const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');require('fake-indexeddb/auto');
function load(file,overrides={}){const filename=path.resolve(file);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;const module={exports:{}};const resolve=name=>name in overrides?overrides[name]:name.startsWith('@/')?load(name.slice(2)+'.ts',overrides):name.startsWith('.')?load(path.resolve(path.dirname(filename),name+'.ts'),overrides):require(name);new Function('require','module','exports',code)(resolve,module,module.exports);return module.exports;}
const base={name:'Coffee',category:'coffee',status:'wishlist',vibeTags:[],menuItems:[],collectionIds:[]};
const place={key:'node/1',name:'Coffee',category:'coffee',location:{lat:14.6,lng:121,formattedAddress:'Main Street',locality:'Manila',osmId:'node/1'}};

test('legacy migration retains visits, old ratings and original photos without duplicate pins',()=>{
 const {migrateLegacyRecords}=load('lib/legacyMigration.ts');
 const old={name:'Coffee',category:'Cafe',rating:8,comment:'First',latitude:14.6,longitude:121,createdAt:10};
 const result=migrateLegacyRecords([{...old,id:1},{...old,id:2,rating:6,comment:'Second',createdAt:20},{...old,id:3,name:'Unlocated',latitude:undefined,longitude:undefined}],[{id:1,spotId:1,blob:new Blob(['photo'],{type:'image/jpeg'}),createdAt:10}]);
 assert.equal(result.spots.length,2);assert.equal(result.visits.length,3);assert.equal(result.spots[0].overallRating,3.5);assert.equal(result.visits[1].notes,'Second');assert.equal(result.photos.length,1);assert.equal(result.spots[1].locationMissing,true);
});

test('v8 migration, wishlist, duplicate guard, visits, filters, collection deletion, backup and LWW',async()=>{
 const Dexie=require('dexie').default;await Dexie.delete('KeepCheckDB');
 const old=new Dexie('KeepCheckDB');old.version(7).stores({spots:'++id, name, category, rating, createdAt, firebaseId, userId, pendingSync, updatedAt',images:'++id, spotId, createdAt, firebaseId'});
 await old.table('spots').add({name:'Legacy',category:'Cafe',rating:10,comment:'Preserve me',createdAt:1,latitude:1,longitude:2});old.close();
 const {db}=load('app/db.ts');await db.open();assert.equal(await db.venues.count(),1);assert.equal(await db.visitLogs.count(),1);assert.equal(await db.spots.count(),1);
 const journal=load('lib/journal.ts',{'@/app/db':{db}});const backup=load('lib/journalBackup.ts',{'@/app/db':{db}});
 const spot=await journal.saveJournalEntry(place,base,undefined);assert.equal(spot.status,'wishlist');assert.equal(spot.overallRating,undefined);
 await assert.rejects(journal.saveJournalEntry({...place,key:'other'},base,undefined),journal.DuplicateVenueError);
 const draft={rating:4,visitedAt:100,notes:'Matcha',itemsOrdered:['Iced matcha'],totalSpend:200,photos:[{blob:new Blob(['image'],{type:'image/webp'}),thumbnail:new Blob(['preview'],{type:'image/webp'})}]};
 const visited=await journal.saveJournalEntry({...place,record:spot},{...base,vibeTags:['fast-wifi'],budgetTier:'₱₱'},draft);
 assert.equal(visited.status,'visited');assert.equal(visited.overallRating,4);assert.equal(await db.photoQueue.count(),1);
 await journal.saveJournalEntry({...place,record:visited},{...base,status:'visited',vibeTags:['fast-wifi']},{...draft,rating:2,photos:[]});
 assert.equal((await db.venues.get(spot.id)).overallRating,3);assert.equal(await db.venues.count(),2);
 const spots=await db.venues.toArray(),visits=await db.visitLogs.toArray();
 assert.equal(journal.filterSpots(spots,visits,{...journal.defaultFilters,vibes:['fast-wifi'],distance:1000},{lat:14.6,lng:121}).length,1);
 assert.equal(journal.filterSpots(spots,visits,{...journal.defaultFilters,distance:1000},null).length,0);
 assert.equal(journal.journalInsights(spots,visits).averageSpend,200);
 await journal.saveCollection('Best Matcha','Tea');const c=await db.collections.toCollection().first();await db.venues.update(spot.id,{collectionIds:[c.id]});await journal.deleteCollection(c.id);assert.deepEqual((await db.venues.get(spot.id)).collectionIds,[]);
 const exported=await backup.makeBackup();assert.match(exported.photos[0].data,/^data:image\/webp;base64,/);const csv=backup.backupCsv({...exported,spots:exported.spots.map(s=>({...s,name:'=formula'}))});assert.match(csv,/'=formula/);
 const newer={...exported,spots:exported.spots.map(s=>s.id===spot.id?{...s,name:'Newer name',updatedAt:s.updatedAt+100}:s)};
 assert.equal(await backup.restoreBackup(newer),1);assert.equal((await db.venues.get(spot.id)).name,'Newer name');assert.equal(await backup.restoreBackup(exported),0);
 const invalid={...exported,visitLogs:[{...exported.visitLogs[0],spotId:'missing'}]};await assert.rejects(backup.restoreBackup(invalid));assert.equal((await db.venues.get(spot.id)).name,'Newer name');
 const sync=load('lib/journalSync.ts',{'@/app/db':{db},'./firebase':{},'firebase/firestore':{},'firebase/storage':{}});
 await db.venues.update(spot.id,{userId:'u',updatedAt:1000,isDeleted:true,syncStatus:'pending'});
 await sync.mergeJournalRecords('venues',[{...visited,userId:'u',updatedAt:900}],'u');assert.equal((await db.venues.get(spot.id)).isDeleted,true);
 await sync.mergeJournalRecords('venues',[{...visited,userId:'u',updatedAt:1100}],'u');assert.equal((await db.venues.get(spot.id)).syncStatus,'synced');
 await journal.deleteVenue(spot.id);assert.ok((await db.visitLogs.where('spotId').equals(spot.id).toArray()).every(v=>v.isDeleted));
 db.close();await Dexie.delete('KeepCheckDB');
});
