import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as E from '../engine.js';
import {rowsForGroup,combinedRows,currentStamps,sourceStamp,reviewSnapshotMatches} from '../review.js';

const source=await fs.readFile(new URL('../app.js',import.meta.url),'utf8');
test('any author can be uploaded to each selected work group with original authors preserved',async()=>{
 for(const group of E.GROUPS){
  const refs={roster:[{name:'가상학생',grade:1}],articles:[{art:'Cleaning',pts:1}],dict:[{kw:'청소',art:'Cleaning'}]};
  const input={value:['김대기','박주영','곽노재','새선생님'].map((user,i)=>['글',i+1,'2026-11-15','12:00',user,'생활','','청소 - 가상학생'].join('\t')).join('\n')};
  const original=input.value;
  const docs=new Map(), messages=[];
  const box={S:{saving:0,docs:{refs}},E,GKEY:{남사감:'m',여사감:'f',인트라넷:'i',아침기:'a'},document:{getElementById:id=>id==='sunday'?{value:'2026-11-15'}:input},sundayOf:()=> '2026-11-15',st:()=>({}),uid:()=> 'rev',toast:m=>messages.push(m),Date,Set,Error,
   store:{transaction:async fn=>fn({get:async path=>docs.get(path),set:(path,data)=>docs.set(path,data),del:path=>docs.delete(path)})},save:async fn=>fn()};
  vm.createContext(box);
  vm.runInContext(source.slice(source.indexOf('async function doOrganize('),source.indexOf('function viewWaiting(')),box);
  await box.doOrganize(group);
  assert.deepEqual(messages,[]);
  const saved=docs.get('cur/g_'+box.GKEY[group]);
  assert.equal(saved.rows.length,4);
  assert(saved.rows.every(r=>r.uploadGroup===group));
  assert.deepEqual(Array.from(saved.rows,r=>r.user),['김대기','박주영','곽노재','새선생님']);
  assert(docs.get('cur/posts').posts.every(p=>p.uploadGroup===group));
  input.value=original;
  await assert.rejects(box.doOrganize(group),/이미 등록/);
 }
});
test('selected group survives chief edits and approvals while legacy rows keep their author grouping',()=>{
 const row={id:'x',user:'김대기',uploadGroup:'여사감',pts:1};
 const groups=E.GROUPS.map(g=>({done:true,revision:g,rows:g==='여사감'?[row]:[]}));
 const final={rows:[{...row,pts:2}],sourceStamps:currentStamps(groups)};
 const rows=combinedRows(final,groups);
 assert.equal(rows.length,1);
 assert.equal(rowsForGroup(rows,'여사감')[0].pts,2);
 assert.equal(rowsForGroup(rows,'남사감').length,0);
 assert(reviewSnapshotMatches('여사감',rows,sourceStamp(groups[1]),final,groups));
 assert.equal(rowsForGroup([{user:'김대기'}],'남사감').length,1);
});
