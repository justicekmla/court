import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {directoryPanel,filterDirectory} from '../directory.js';
const refs={roster:[{name:'가상학생29',grade:3,no:'30101'},{name:'가상학생31',grade:1,no:'10101'}],reps:['가상학생29','이전학생'],articles:[{art:'Cleaning',pts:1}]};
test('roster view lists every current student and keeps editing confined to council',()=>{
 const html=directoryPanel(refs);assert(html.includes('가상학생29'));assert(html.includes('가상학생31'));assert(!html.includes('councilRemove'));assert(!html.includes('councilSave'));
 const edit=directoryPanel(refs,{council:true,draft:refs.reps});assert(edit.includes('이전학생'));assert(edit.includes('value="가상학생31"'));assert(!edit.includes('value="가상학생29"'));assert(edit.includes('councilSave'));
 assert(directoryPanel({...refs,reps:[]},{council:true,draft:[]}).includes('councilSave'));
 assert(directoryPanel({roster:[{name:'<script>"',grade:1}]}).includes('&lt;script&gt;&quot;'));
});
test('directory searches names, grades and student numbers without changing data',()=>{
 const rows=[{dataset:{search:'가상학생29 3 30101'}},{dataset:{search:'가상학생31 1 10101'}}],label={};
 const root={querySelectorAll:()=>rows,querySelector:()=>label};filterDirectory(root,'10101');assert.deepEqual(rows.map(r=>r.hidden),[true,false]);assert.equal(label.textContent,'1명 표시');filterDirectory(root,'');assert(rows.every(r=>!r.hidden));
});
const source=await fs.readFile(new URL('../app.js',import.meta.url),'utf8');
async function saveWith(latest,draft,base,unlocked=true){
 let written=null,error=null;const S={role:'chief',chiefUnlocked:unlocked,councilDraft:draft,councilBase:base,docs:{refs},saving:0};
 const sandbox={S,clone:structuredClone,ctxCache:{key:'old'},version2:{metadataChanged(){}},render(){},Date,JSON,Error,store:{transaction:async fn=>fn({get:async()=>latest,set:(path,data)=>{written=data;}})},save:async fn=>{try{await fn();return true;}catch(e){error=e;return false;}}};
 vm.createContext(sandbox);vm.runInContext(source.slice(source.indexOf('async function saveCouncil()'),source.indexOf('function viewChiefVersion1()')),sandbox);await sandbox.saveCouncil();return {written,error,S};
}
test('council save preserves all other latest reference data and supports clearing the list',async()=>{
 const latest={...refs,dict:['latest'],updatedAt:'before'};const result=await saveWith(latest,['가상학생31'],refs.reps);assert.deepEqual(Array.from(result.written.reps),['가상학생31']);assert.deepEqual(result.written.dict,['latest']);assert.equal(result.S.councilDraft,null);
 assert.deepEqual(Array.from((await saveWith(refs,[],refs.reps)).written.reps),[]);
});
test('stale council edits, removed students and locked chief do not overwrite shared references',async()=>{
 assert((await saveWith({...refs,reps:['다른학생']},[],refs.reps)).error);
 assert((await saveWith({...refs,roster:[]},['가상학생31'],refs.reps)).error);
 assert.equal((await saveWith(refs,[],refs.reps,false)).written,null);
});
