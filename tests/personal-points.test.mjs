import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';

const names=['가상학생','시험학생','예시학생','연습학생','검증학생'];
const refs={roster:names.map(name=>({name,grade:1})),articles:[{art:'Cleaning',pts:1}],dict:[{kw:'청소 불량',art:'Cleaning'}]};
const ctx=()=>E.makeCtx(refs,'2026-11-08');
const line='청소 불량 - 가상학생, 시험학생(2점), 예시학생(1학년)(2점), 연습학생, 검증학생(3점)';
function parse(text){const C=ctx();return E.mentionsToRows(C,E.parsePost(C,{id:'1',date:'2026-11-06',user:'김대기',title:'생활지도',text:'11월 6일\n'+text})).rows.map((r,i)=>({...r,id:'r'+i,seq:i}));}
const expected=[['가상학생',1],['시험학생',2],['예시학생',2],['연습학생',1],['검증학생',3]];
test('consecutive personal annotations never become whole-line points or repetition counts',()=>{
 for(const text of [line,line.replace('(1학년)(2점)','(1학년) (2점)'),line.replace('(1학년)(2점)','(1학년, 2점)')]){
  assert.deepEqual(parse(text).map(r=>[r.name,r.pts]),expected);
  assert.equal(E.compute(ctx(),parse(text)).list.length,5);
 }
});
test('explicit occurrences stay separate from personal points',()=>{
 const rows=parse('청소 불량 - 가상학생, 예시학생(1학년)(2점)(2회), 검증학생(3점)');
 assert.deepEqual(rows.map(r=>[r.name,r.pts]),[['가상학생',1],['예시학생',2],['예시학생',2],['검증학생',3]]);
 assert.equal(E.compute(ctx(),rows).list.length,4);
});
function legacy(){return names.flatMap((name,mid)=>Array.from({length:name==='검증학생'?3:2},(_,k)=>({id:mid+'-'+k,mid:mid+1,seq:mid*3+k,post:'1',group:'1|1',user:'김대기',name,tok:name,date:'2026-11-06',art:'Cleaning',pts:1,line,lineNo:2,flags:[],edited:[]})));}
test('already saved rows are corrected on copies with stable IDs and no reset',()=>{
 const rows=legacy(),before=structuredClone(rows),res=E.compute(ctx(),rows);
 assert.deepEqual(rows,before);
 assert.deepEqual(res.list.map(r=>[r.name,r.pts]).sort(),expected.slice().sort());
 assert.equal(res.rows.length,rows.length);
 assert.equal(res.rows.filter(r=>r.sourceSuppressed).length,6);
 assert(res.rows.filter(r=>r.sourceSuppressed).every(r=>r.status==='excluded'));
 assert.deepEqual(E.compute(ctx(),E.expandSourceRows(ctx(),rows)).list,res.list);
 assert.deepEqual(res.rows.map(r=>r.id),rows.map(r=>r.id));
});
test('manual corrections, deletion, exceptions, files and added rows survive',()=>{
 const rows=legacy();
 rows[0].pts=7;rows[0].edited=['pts'];rows[0].date='2026-11-05';rows[0].edited.push('date');
 rows[2].deleted=true;
 rows[5].pts=9;rows[5].edited=['pts'];
 rows[7].keepDuplicate=true;
 const res=E.compute(ctx(),rows);
 assert.equal(res.rows.find(r=>r.id===rows[0].id).pts,7);
 assert.equal(res.rows.find(r=>r.id===rows[0].id).date,'2026-11-05');
 assert.equal(res.rows.find(r=>r.id===rows[2].id).status,'deleted');
 assert.equal(res.rows.find(r=>r.id===rows[5].id).pts,9);
 assert(!res.rows.find(r=>r.id===rows[5].id).sourceSuppressed);
 assert(!res.rows.find(r=>r.id===rows[7].id).sourceSuppressed);
 for(const extra of [{src:'file'},{added:true}]){
  const row={...legacy()[0],pts:12,...extra};
  assert.equal(E.expandSourceRows(ctx(),[row])[0].pts,12);
 }
});
test('newly parsed and saved corrected rows remain stable through repeated compute',()=>{
 const rows=parse(line),expanded=E.expandSourceRows(ctx(),rows);
 assert.deepEqual(expanded.map(r=>[r.name,r.pts]),expected);
 assert(!expanded.some(r=>r.sourceSuppressed));
 assert.deepEqual(E.expandSourceRows(ctx(),expanded),expanded);
});
