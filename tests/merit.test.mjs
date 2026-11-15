import {test} from 'node:test';
import assert from 'node:assert/strict';
import {meritDate,meritGroup,meritPlan,meritRecords,meritTarget} from '../ledger/merit.js';
const students=[{id:'260001',name:'가상가',grade:1,row:5},{id:'250001',name:'가상나',grade:2,row:6},{id:'240001',name:'가상다',grade:3,row:7}];
const target=()=>({students,rounds:[{round:26,col:32}],sheet:{name:'상벌점 누계',cells:new Map()}});
const rec=(name,score,grade='')=>({name,score,grade,sheet:'심사',row:3});
test('merit dates reject invalid dates and produce readable row-one dates',()=>{
 assert.equal(meritDate('2026-11-01'),'2026.11.1');assert.equal(meritDate('2028-02-29'),'2028.2.29');
 for(const date of ['','2026-02-29','2026-13-01','2026-04-31'])assert.throws(()=>meritDate(date));
 const p=meritPlan([],target(),26,{date:'2026-11-15'});assert.equal(p.dateRef,'AF1');assert.equal(p.date,'2026.11.15');
});
test('whole-school and grade group names cover user expressions and spacing',()=>{
 for(const name of ['전학년','전 학년 전체','전교생 전원','전체 학생','모든 학생'])assert.deepEqual(meritGroup(name),[1,2,3]);
 for(const name of ['2학년 전체','2 학년 전원','2학년(전체)','2학년'])assert.deepEqual(meritGroup(name),[2]);
 assert.deepEqual(meritGroup('전체','2학년'),[2]);assert.deepEqual(meritGroup('1, 2학년 전체'),[1,2]);assert.equal(meritGroup('가상나'),null);
});
test('school, grade and personal awards add together once per source and zeros fill the rest',()=>{
 const p=meritPlan([rec('전학년',1),rec('2학년 전체',2),rec('가상나',3)],target(),26);
 assert.deepEqual(p.entries.map(e=>e.score),[1,6,1]);assert.equal(p.total,8);assert.equal(p.awarded,3);assert.deepEqual(p.errors,[]);
 const q=meritPlan([rec('2학년 전체',2)],target(),26);assert.equal(q.entries.length,3);assert.equal(q.zeroFilled,2);assert.equal(q.entries.find(e=>e.student.grade===1).score,0);
});
test('empty reviewed results explicitly fill every student with numeric zero',()=>{
 const p=meritPlan([],target(),26);assert.equal(p.zeroFilled,3);assert(p.entries.every(e=>e.score===0&&typeof e.score==='number'));assert.equal(p.total,0);
});
test('zero filling cannot overwrite an existing value or formula for a non-recipient',()=>{
 for(const cell of [{value:0},{value:4},{value:'',formula:'SUM(A1:A2)'}]){const t=target();t.sheet.cells.set('AF5',cell);assert(meritPlan([rec('가상나',1)],t,26).errors.length);}
 const t=target();t.sheet.cells.set('AF1',{formula:'A1'});assert(meritPlan([],t,26,{date:'2026-11-15'}).errors.length);
});
test('ambiguous or unknown people and invalid scores remain errors instead of expanding to everyone',()=>{
 const t=target();t.students=[...students,{...students[0],id:'260002',row:8}];assert.equal(meritPlan([rec('가상가',2)],t,26).unmatched.length,1);
 assert(meritPlan([rec('미등록학생',2)],t,26).errors.length);assert(meritPlan([rec('전학년',null)],t,26).errors.length);
 const p=meritPlan([{...rec('가상가',2),studentId:'260001'}],t,26);assert.equal(p.awarded,1);assert.equal(p.errors.length,0);
});
test('an empty merit file with the correct headers is valid; unrelated files are rejected',()=>{
 const row=new Map([[3,{col:3,value:'학생'}],[18,{col:18,value:'심사상점(pts)'}]]);
 assert.deepEqual(meritRecords({sheets:[{rows:new Map([[4,row]])}]}),[]);assert.throws(()=>meritRecords({sheets:[{rows:new Map()}]}));
});
test('zero-filled rounds count as completed when selecting the next merit round',()=>{
 const headers=new Map([[1,{col:1,value:'학번'}],[2,{col:2,value:'학반번'}],[3,{col:3,value:'이름'}],[32,{col:32,value:'26회'}],[33,{col:33,value:'27회'}]]);
 const row=new Map([[1,{value:'260001'}],[2,{value:'10101'}],[3,{value:'가상가'}]]);
 const sheet={name:'상벌점 누계',rows:new Map([[2,headers],[5,row]]),cells:new Map([['AF5',{value:0}]])};assert.equal(meritTarget({sheets:[sheet]}).suggested,27);
});
