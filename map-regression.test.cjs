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


test("dense viewport POIs are nearest-first, deduplicated and capped; GPS commits are bounded", () => {
 const {nearestPois,shouldCommitPosition,discoveryBounds}=load('lib/mapPerformance.ts');
 const center={lat:14.6,lng:121};
 const venues=Array.from({length:300},(_,i)=>({key:String(i),name:'Cafe '+i,category:'coffee',location:{lat:14.6+i*.00001,lng:121,osmId:'node/'+i,formattedAddress:''}})).reverse();
 const result=nearestPois([...venues,venues[0]],center,new Set(['node/0']));
 assert.equal(result.length,40);assert.equal(result[0].key,'1');assert.equal(result[39].key,'40');
 assert.equal(shouldCommitPosition(center,{lat:14.600001,lng:121},100),false);
 assert.equal(shouldCommitPosition(center,center,2000),true);
 assert.equal(shouldCommitPosition(center,{lat:14.601,lng:121},100),true);
 const bounds=discoveryBounds({south:10,north:20,west:110,east:130},center);
 assert.ok(bounds.north-bounds.south < .037);assert.ok(bounds.east-bounds.west < .04);
});

test("opening hours parser safely evaluates OSM time strings and handles invalid formats", () => {
  const { getOpeningHoursStatus } = load("lib/osm.ts");

  const tuesdayNoon = new Date("2026-11-17T12:30:00"); // Tuesday 12:30
  const tuesdayNight = new Date("2026-11-17T23:30:00"); // Tuesday 23:30
  const sundayNoon = new Date("2026-11-22T12:30:00"); // Sunday 12:30

  assert.equal(getOpeningHoursStatus("24/7", tuesdayNoon), "open");
  assert.equal(getOpeningHoursStatus("closed", tuesdayNoon), "closed");
  assert.equal(getOpeningHoursStatus("off", tuesdayNoon), "closed");

  assert.equal(getOpeningHoursStatus("Mo-Su 10:00-22:00", tuesdayNoon), "open");
  assert.equal(getOpeningHoursStatus("Mo-Su 10:00-22:00", tuesdayNight), "closed");

  assert.equal(getOpeningHoursStatus("Mo-Fr 08:00-18:00; Sa-Su off", tuesdayNoon), "open");
  assert.equal(getOpeningHoursStatus("Mo-Fr 08:00-18:00; Sa-Su off", sundayNoon), "closed");

  assert.equal(getOpeningHoursStatus("daily 07:00-21:00", tuesdayNoon), "open");
  assert.equal(getOpeningHoursStatus("Tu off", tuesdayNoon), "closed");

  // Fallback to null on unparseable / missing
  assert.equal(getOpeningHoursStatus(undefined, tuesdayNoon), null);
  assert.equal(getOpeningHoursStatus("", tuesdayNoon), null);
  assert.equal(getOpeningHoursStatus("sunrise-sunset", tuesdayNoon), null);
});

test("local Overpass name search regex, brand matching, and combined 3-layer distance ranking", async () => {
  setOnline(true);
  const osm = load("lib/osm.ts");
  const geo = load("lib/geo.ts");

  // 1. Test buildOverpassRegexPattern
  assert.equal(osm.buildOverpassRegexPattern("mcdonalds"), "mcdonald['’]?s");
  assert.equal(osm.buildOverpassRegexPattern("mcdonald's"), "mcdonald['’]?s");
  assert.equal(osm.buildOverpassRegexPattern("wendys"), "wendy['’]?s");
  assert.equal(osm.buildOverpassRegexPattern("st. mark"), "st\\. mark");
  assert.equal(osm.buildOverpassRegexPattern('cafe "special"'), "caf[eé] special");

  const pattern = osm.buildOverpassRegexPattern("mcdonalds");
  const regex = new RegExp(pattern, "i");
  assert.ok(regex.test("McDonald's"));
  assert.ok(regex.test("McDonalds"));
  assert.ok(regex.test("McDonald’s"));

  // 2. Test searchLocalOverpassByName query construction and normalization
  let capturedOverpassQuery = "";
  globalThis.fetch = async (url, init) => {
    capturedOverpassQuery = init && init.body ? init.body.toString() : "";
    return response({
      elements: [
        {
          type: "node",
          id: 101,
          lat: 14.5995,
          lon: 120.9842,
          tags: {
            name: "McDonald's Taft",
            brand: "McDonald's",
            amenity: "fast_food",
            "addr:street": "Taft Ave",
            "addr:city": "Manila",
            opening_hours: "24/7",
          },
        },
        {
          type: "way",
          id: 202,
          center: { lat: 14.5800, lon: 120.9800 },
          tags: {
            name: "Starbucks Coffee",
            shop: "coffee",
            cuisine: "coffee_shop",
            "addr:city": "Manila",
          },
        },
      ],
    });
  };

  const center = { lat: 14.6000, lng: 120.9800 };
  const overpassResults = await osm.searchLocalOverpassByName("mcdonalds", center, 12000);

  // Check query contains [timeout:10], around:12000, name pattern, brand pattern
  assert.match(capturedOverpassQuery, /timeout%3A10/);
  assert.match(capturedOverpassQuery, /around%3A12000/);
  assert.match(capturedOverpassQuery, /brand/);

  // Check coffee query adds shop=coffee and cuisine=coffee_shop
  await osm.searchLocalOverpassByName("cafe central", center, 12000);
  assert.match(capturedOverpassQuery, /shop%3Dcoffee/);
  assert.match(capturedOverpassQuery, /cuisine%3Dcoffee_shop/);

  // Check normalized Venue objects
  assert.equal(overpassResults.length, 2);
  assert.equal(overpassResults[0].key, "node/101");
  assert.equal(overpassResults[0].name, "McDonald's Taft");
  assert.equal(overpassResults[0].category, "restaurant");
  assert.equal(overpassResults[0].location.locality, "Manila");
  assert.equal(overpassResults[0].openingHours, "24/7");

  // Way coordinates normalized from center
  assert.equal(overpassResults[1].key, "way/202");
  assert.equal(overpassResults[1].location.lat, 14.5800);
  assert.equal(overpassResults[1].location.lng, 120.9800);
  assert.equal(overpassResults[1].category, "coffee");

  // 3. Test searchPhoton with options
  let capturedPhotonUrl = "";
  globalThis.fetch = async (url) => {
    capturedPhotonUrl = String(url);
    return response({
      features: [
        {
          geometry: { coordinates: [120.9842, 14.5995] },
          properties: {
            name: "McDonald's",
            osm_type: "N",
            osm_id: 101,
            city: "Manila",
          },
        },
      ],
    });
  };

  await osm.searchPhoton("mcdonalds", {
    lat: 14.6,
    lon: 121.0,
    zoom: 15,
    bbox: [120.9, 14.5, 121.1, 14.7],
  });
  assert.match(capturedPhotonUrl, /lat=14.6/);
  assert.match(capturedPhotonUrl, /lon=121/);
  assert.match(capturedPhotonUrl, /zoom=15/);
  assert.match(capturedPhotonUrl, /bbox=120.9%2C14.5%2C121.1%2C14.7/);

  // 4. Test rankAndDeduplicateSearchResults
  const savedVenue = {
    key: "saved-1",
    name: "My Favorite McDonald's",
    category: "restaurant",
    location: { lat: 14.6050, lng: 120.9820, formattedAddress: "Ermita, Manila" },
  };

  const localOverpassVenue = {
    key: "node/101",
    name: "McDonald's",
    category: "restaurant",
    location: { lat: 14.6000, lng: 120.9800, osmId: "node/101", formattedAddress: "Taft, Manila" },
  };

  // Duplicate within 40m
  const duplicatePhotonVenue = {
    key: "photon-14.60005-120.98005",
    name: "McDonald's",
    category: "restaurant",
    location: { lat: 14.60005, lng: 120.98005, formattedAddress: "Taft, Manila" },
  };

  // Nearby local venue (~2 km)
  const nearbyVenue = {
    key: "node/303",
    name: "McDonald's Quirino",
    category: "restaurant",
    location: { lat: 14.5750, lng: 120.9900, formattedAddress: "Quirino, Manila" },
  };

  // Distant venue in another city (> 12 km, e.g. 500 km away)
  const distantVenue = {
    key: "node/404",
    name: "McDonald's Cebu",
    category: "restaurant",
    location: { lat: 10.3157, lng: 123.8854, formattedAddress: "Cebu City" },
  };

  const ranked = osm.rankAndDeduplicateSearchResults(
    [savedVenue],
    [localOverpassVenue, nearbyVenue],
    [duplicatePhotonVenue, distantVenue],
    center,
    40,
    12000,
  );

  // Layer 1: Saved spot is strictly first
  assert.equal(ranked[0].key, "saved-1");

  // Layer 2: Duplicate within 40m is removed (should be 4 items total: saved, 2 local, 1 distant)
  assert.equal(ranked.length, 4);
  assert.ok(ranked.some((v) => v.key === "node/101"));
  assert.ok(!ranked.some((v) => v.key === "photon-14.60005-120.98005"));

  // Layer 3: Local venues (<= 12km) rank ahead of distant venues (> 12km), ordered closest-first
  assert.equal(ranked[1].key, "node/101"); // ~0m from center
  assert.equal(ranked[2].key, "node/303"); // ~3km from center
  assert.equal(ranked[3].key, "node/404"); // Cebu (> 500km) strictly last

  // Check distance is calculated on every venue
  assert.ok(typeof ranked[0].distance === "number");
  assert.ok(typeof ranked[1].distance === "number");
  assert.equal(geo.formatDistance(ranked[1].distance), "0 m");
  assert.ok(geo.formatDistance(ranked[2].distance).includes("km") || geo.formatDistance(ranked[2].distance).includes("m"));
});
