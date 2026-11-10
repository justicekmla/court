import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';

const full='가나다라마', aliases=[full,'가나다라','가라마'];
const post=text=>({id:'9',date:'2026-11-06',user:'김대기',title:'생활지도',text:'11월 6일\n'+text});
function context(rosterName=full){return E.makeCtx({roster:[{name:rosterName,grade:1},{name:'가상학생',grade:1}],articles:[{art:'Cleaning',pts:1}],dict:[{kw:'청소 불량',art:'Cleaning'}]},'2026-11-08');}
test('all requested aliases resolve to the full canonical output against the full private roster name',()=>{
 for(const alias of aliases){
  const C=context(),p=post('청소 불량 - '+alias+'(2점)');
  assert(E.isKnown(C,alias));assert.deepEqual(E.lookup(C,alias,0),[full]);
  const res=E.compute(C,E.extractWeek(C,[p],'2026-11-02','2026-11-08').rows);
  assert.equal(res.list.length,1);assert.equal(res.list[0].disp,full);assert.equal(res.list[0].pts,2);assert.equal(res.list[0].grade,1);
 }
});
test('known long names and long correction keys pass recognition without accepting unknown prose',()=>{
 const C=E.makeCtx({roster:[{name:'가나다라마',grade:1}],nameFix:[{from:'가나다라마바',to:'가나다라마'}],articles:[{art:'Cleaning',pts:1}],dict:[{kw:'청소 불량',art:'Cleaning'}]},'2026-11-08');
 for(const name of ['가나다라마','가나다라마바']){
  const rows=E.mentionsToRows(C,E.parsePost(C,post('청소 불량 - '+name+'(2점)'))).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].name,'가나다라마');assert.equal(rows[0].pts,2);
 }
 assert.equal(E.parsePost(C,post('청소 불량 - 이것은안내문입니다')).length,0);
});
test('old aliases are canonicalized before deduplication with manual points retained',()=>{
 const C=context(),rows=aliases.map((name,i)=>({id:'r'+i,mid:i+1,post:String(i),group:String(i)+'|1',name,tok:name,user:'김대기',art:'Cleaning',date:'2026-11-06',pts:4,flags:[],edited:['pts'],line:'청소 불량'}));
 assert.equal(E.compute(C,rows).list.length,1);
 assert.equal(E.compute(C,rows).list[0].disp,full);
 assert.equal(E.compute(C,rows).list[0].pts,4);
 assert.equal(rows[1].name,'가나다라');
});
test('ambiguous abbreviations and distinct shorter roster names are never merged',()=>{
 const C=E.makeCtx({roster:[{name:'가나다라마',grade:1},{name:'가바다라마',grade:1},{name:'가나다라',grade:2}]},'2026-11-08');
 assert.deepEqual(E.lookup(C,'가나다라',0),['가나다라']);
 assert.deepEqual(E.lookup(C,'가라마',0),[]);
});
test('old omitted full name is restored from saved original posts without resetting other rows',()=>{
 const C=context(),p=post('청소 불량 - 가상학생, '+full+'(1학년)(2점)');
 C.sourcePosts=[p];
 const old={id:'old',mid:1,post:'9',group:'9|1',name:'가상학생',tok:'가상학생',user:'김대기',art:'Cleaning',date:'2026-11-06',pts:1,flags:[],edited:[],line:'청소 불량 - 가상학생, '+full+'(1학년)(2점)',lineNo:2};
 const rows=E.expandSourceRows(C,[old]),restored=rows.find(r=>r.name===full);
 assert(restored);assert.equal(restored.pts,2);assert.equal(rows[0].id,'old');
 assert.equal(E.expandSourceRows(C,rows).length,2);
 restored.deleted=true;assert(!E.compute(C,rows).list.some(r=>r.name===full));
 restored.deleted=false;restored.pts=7;restored.edited=['pts'];
 assert.equal(E.compute(C,rows).list.find(r=>r.name===full).pts,7);
 assert.equal(E.expandSourceRows(C,[]).length,0);
});
