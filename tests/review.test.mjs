import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalString,sourceStamp,combinedRows,currentStamps,reviewSnapshotMatches} from '../review.js';
const row={id:'row-1',user:'김대기',name:'가상학생',date:'2026-11-01',art:'Late for court',pts:5,flags:[['date','확인']],seq:0,unused:undefined};
const groups=()=>[{revision:'r1',done:true,doneAt:'2026-11-07',rows:[structuredClone(row)]},...Array.from({length:3},()=>({done:true,rows:[]}))];
function firestoreRoundtrip(value){if(Array.isArray(value))return value.map(firestoreRoundtrip);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,firestoreRoundtrip(value[k])]));return value;}
test('Firestore map ordering and omitted undefined fields do not change approval',()=>{
 const a=groups(), b=firestoreRoundtrip(a);
 assert.notEqual(JSON.stringify(a),JSON.stringify(b));
 assert.equal(canonicalString(a),canonicalString(b));
 assert.equal(sourceStamp(a[0]),sourceStamp(b[0]));
 assert(reviewSnapshotMatches('남사감',[row],sourceStamp(a[0]),null,b));
});
test('actual selected-group changes still reject a stale review',()=>{
 const a=groups(),b=groups();b[0].rows[0].pts=10;
 assert(!reviewSnapshotMatches('남사감',[row],sourceStamp(a[0]),null,b));
 const c=groups();c[0].done=false;
 assert(!reviewSnapshotMatches('남사감',[row],sourceStamp(a[0]),null,c));
});
test('chief edits made in another tab require reviewing the new content',()=>{
 const a=groups(),final={rows:[{...row,pts:15}],sourceStamps:currentStamps(a)};
 assert(!reviewSnapshotMatches('남사감',[row],sourceStamp(a[0]),final,a));
});
test('another completed group can change without blocking selected-group review',()=>{
 const a=groups(),b=groups();b[1].rows=[{...row,id:'row-2',user:'박주영'}];
 assert(reviewSnapshotMatches('남사감',[row],sourceStamp(a[0]),null,b));
 assert.equal(combinedRows(null,b).length,2);
});
test('legacy empty final snapshots do not hide committed charges',()=>{
 const a=groups();assert.equal(combinedRows({rows:[],sourceStamps:{m:'old-token'}},a).length,1);
});
test('legacy chief corrections survive token migration and map reordering',()=>{
 const a=groups(),edited={...row,pts:7},final={rows:[edited],sourceStamps:{m:'old-token'}};
 assert.equal(combinedRows(final,a)[0].pts,7);
 const migrated={rows:combinedRows(final,a),sourceStamps:currentStamps(a)};
 assert.equal(combinedRows(firestoreRoundtrip(migrated),firestoreRoundtrip(a))[0].pts,7);
 assert(reviewSnapshotMatches('남사감',[edited],sourceStamp(a[0]),firestoreRoundtrip(migrated),firestoreRoundtrip(a)));
});
test('empty completed groups can be explicitly approved',()=>{
 const a=groups();a[0].rows=[];
 assert(reviewSnapshotMatches('남사감',[],sourceStamp(a[0]),{rows:[]},firestoreRoundtrip(a)));
});
