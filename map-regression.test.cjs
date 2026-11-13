const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require("fake-indexeddb/auto");
// Compile the actual service modules without introducing a second TS build config.
function load(file, overrides = {}) {
  const filename = path.resolve(file);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const resolve = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/")) return load(name.slice(2)+".ts",overrides);
    if (name.startsWith("."))
      return load(
        path.resolve(path.dirname(filename), name + ".ts"),
        overrides,
      );
    return require(name);
  };
  new Function("require", "module", "exports", code)(
    resolve,
    module,
    module.exports,
  );
  return module.exports;
}
const geo = load("lib/geo.ts");
const setOnline = (online) =>
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: online },
    configurable: true,
  });
const response = (data) => ({ ok: true, json: async () => data });

test("legacy coordinates, distance and category normalization", () => {
  assert.equal(
    geo.spotLocation({ latitude: 0, longitude: 0 }).formattedAddress,
    "0.00000, 0.00000",
  );
  assert.equal(geo.spotLocation({}), undefined);
  assert.equal(geo.haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  assert.ok(
    Math.abs(geo.haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111195) <
      1,
  );
  assert.equal(geo.formatDistance(240), "240 m");
  assert.equal(geo.formatDistance(1400), "1.4 km");
  assert.equal(geo.categoryFor("bakery"), "bakery");
});

test("all external services gracefully handle offline and non-200 responses", async () => {
  const osm = load("lib/osm.ts");
  const signal = new AbortController().signal;
  const p = { lat: 14.6, lng: 121 };
  const bounds = { south: 14.6, west: 121, north: 14.61, east: 121.01 };
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: false };
  };
  setOnline(false);
  assert.equal(await osm.searchVenues("cafe", p, signal), null);
  assert.equal(await osm.discoverVenues(bounds, signal), null);
  assert.equal(await osm.fetchRoute(p, p, "foot", signal), null);
  assert.equal(
    (await osm.reverseLocation(p, signal)).formattedAddress,
    "14.60000, 121.00000",
  );
  assert.equal(calls, 0);
  setOnline(true);
  assert.equal(await osm.searchVenues("cafe", p, signal), null);
  assert.equal(await osm.discoverVenues(bounds, signal), null);
  assert.equal(await osm.fetchRoute(p, p, "driving", signal), null);
  assert.equal(
    (await osm.reverseLocation(p, signal)).formattedAddress,
    "14.60000, 121.00000",
  );
  assert.equal(calls, 4);
});

test("Photon bias, Overpass dedup/cache, abort and pedestrian routing endpoint", async () => {
  setOnline(true);
  const osm = load("lib/osm.ts");
  const signal = new AbortController().signal;
  let url;
  let calls = 0;
  globalThis.fetch = async (u) => {
    url = String(u);
    calls++;
    return response({
      features: [
        {
          geometry: { coordinates: [121, 14.6] },
          properties: {
            name: "Coffee",
            osm_type: "N",
            osm_id: 42,
            osm_value: "cafe",
            city: "Manila",
          },
        },
      ],
    });
  };
  const venues = await osm.searchVenues(
    "Coffee",
    { lat: 14.6, lng: 121 },
    signal,
  );
  assert.match(url, /lat=14.6&lon=121/);
  assert.equal(venues[0].location.osmId, "node/42");
  assert.equal(venues[0].category, "coffee");
  globalThis.fetch = async () => {
    calls++;
    return response({
      elements: [
        {
          type: "node",
          id: 42,
          lat: 14.6,
          lon: 121,
          tags: { amenity: "cafe" },
        },
        { type: "node", id: 42, lat: 14.6, lon: 121 },
      ],
    });
  };
  const b = { south: 14.6, west: 121, north: 14.61, east: 121.01 };
  assert.equal((await osm.discoverVenues(b, signal)).length, 1);
  await osm.discoverVenues(b, signal);
  assert.equal(calls, 2);
  const controller = new AbortController();
  controller.abort();
  await osm.searchVenues("Coffee", null, controller.signal);
  assert.equal(calls, 2);
  globalThis.fetch = async (u) => {
    url = String(u);
    return response({
      code: "Ok",
      routes: [
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [121, 14.6],
              [121.1, 14.6],
            ],
          },
          distance: 100,
          duration: 80,
        },
      ],
    });
  };
  assert.equal(
    (
      await osm.fetchRoute(
        { lat: 14.6, lng: 121 },
        { lat: 14.6, lng: 121.1 },
        "foot",
        signal,
      )
    ).duration,
    80,
  );
  assert.match(url, /routing.openstreetmap.de\/routed-foot/);
});

test("v6 migration preserves records; remote sync respects timestamps, tombstones and location metadata", async () => {
  const Dexie = require("dexie").default;
  await Dexie.delete("KeepCheckDB");
  const old = new Dexie("KeepCheckDB");
  old
    .version(6)
    .stores({
      spots:
        "++id, name, category, rating, createdAt, firebaseId, userId, pendingSync",
      images: "++id, spotId, createdAt, firebaseId",
    });
  await old
    .table("spots")
    .add({
      id: 1,
      name: "Old cafe",
      category: "Cafe",
      rating: 8,
      comment: "",
      createdAt: 10,
      latitude: 14.6,
      longitude: 121,
      userId: "u",
      firebaseId: "remote",
    });
  old.close();
  const { db } = load("app/db.ts");
  await db.open();
  const migrated = await db.spots.get(1);
  assert.equal(migrated.rating, 8);
  assert.equal(migrated.location.formattedAddress, "14.60000, 121.00000");
  assert.equal(migrated.updatedAt, 10);
  let written;
  const sync = load("lib/offlineSync.ts", {
    "@/app/db": { db },
    "@/utils/image": {},
    "./firestore": {
      writeSpotToFirestore: async (uid, id, spot) => {
        written = spot;
      },
    },
  });
  await db.spots.update(1, {
    updatedAt: 30,
    isDeleted: true,
    pendingSync: true,
  });
  await sync.applyRemoteSpotChanges("u", [
    { type: "modified", spot: { ...migrated, updatedAt: 20 } },
  ]);
  assert.equal((await db.spots.get(1)).isDeleted, true);
  const incoming = {
    ...migrated,
    updatedAt: 40,
    location: {
      lat: 14.6,
      lng: 121,
      formattedAddress: "Main Street",
      locality: "Manila",
      osmId: "node/42",
    },
  };
  await sync.applyRemoteSpotChanges("u", [
    { type: "modified", spot: incoming },
  ]);
  assert.equal((await db.spots.get(1)).location.locality, "Manila");
  setOnline(true);
  await sync.syncSpotToFirestore("u", await db.spots.get(1));
  assert.equal(written.location.osmId, "node/42");
  assert.equal(
    await sync.syncSpotToFirestore("another-user", await db.spots.get(1)),
    false,
  );
  // An edit arriving while an older upload completes must remain pending.
  const race = load("lib/offlineSync.ts", {
    "@/app/db": { db },
    "@/utils/image": {},
    "./firestore": {
      writeSpotToFirestore: async () => {
        await db.spots.update(1, { updatedAt: 50, pendingSync: true });
      },
    },
  });
  await race.syncSpotToFirestore("u", await db.spots.get(1));
  assert.equal((await db.spots.get(1)).pendingSync, true);
  db.close();
  await Dexie.delete("KeepCheckDB");
});

test("Firestore transaction preserves newer remote edits and writes metadata atomically", async () => {
  let remote = { updatedAt: 100, name: "Newer remote" },
    written;
  const firestore = load("lib/firestore.ts", {
    "firebase/firestore": {
      doc: () => ({}),
      runTransaction: async (db, fn) =>
        fn({
          get: async () => ({ data: () => remote }),
          set: (ref, value) => {
            written = value;
          },
        }),
    },
    "./firebase": { getFirebaseFirestore: () => ({}) },
  });
  const spot = {
    name: "Local",
    category: "Cafe",
    rating: 8,
    comment: "",
    createdAt: 1,
    updatedAt: 50,
    location: {
      lat: 0,
      lng: 0,
      formattedAddress: "Main Street",
      locality: "Town",
      osmId: "node/1",
    },
  };
  assert.equal(
    (await firestore.writeSpotToFirestore("u", "remote", spot)).name,
    "Newer remote",
  );
  assert.equal(written, undefined);
  remote = { updatedAt: 10 };
  await firestore.writeSpotToFirestore("u", "remote", spot);
  assert.equal(written.location.osmId, "node/1");
  assert.equal(written.updatedAt, 50);
  assert.equal(written.syncStatus, "synced");
});
