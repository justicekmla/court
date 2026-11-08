import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as E from '../engine.js';
const refs={roster:[{name:'이지효',grade:1},{name:'황예진',grade:1}],articles:[{art:'Late for school',pts:3},{art:'Late for school 7',pts:7},{art:'Violated curfew regulation',pts:8}],dict:[{kw:'지각',art:'Late for school'},{kw:'통금 위반',art:'Violated curfew regulation'}]};
const ctx=()=>Object.assign(E.makeCtx(refs,'2026-11-08'),{femaleDefaultDate:'2026-11-11'});
const parse=(text,user='김대기')=>{const C=ctx(); return E.mentionsToRows(C,E.parsePost(C,{id:'1',date:'2026-11-08',user,title:'생활',text})).rows.map((r,i)=>({...r,id:'r'+i,seq:i}));};
const row=(extra={})=>({id:'r',mid:1,seq:0,group:'1|0',user:'김대기',name:'이지효',tok:'이지효',date:'2026-11-05',art:'Violated curfew regulation',pts:8,line:'통금 위반 - 이지효(황예진)',flags:[],...extra});
test('male tardiness is school 7, other departments retain dictionary mapping',()=>{
 assert.equal(parse('지각 - 이지효')[0].art,'Late for school 7');
 assert.equal(parse('지각 - 이지효','박주영')[0].art,'Late for school');
 assert.equal(parse('지각 - 이지효','다른교사')[0].art,'Late for school');
});
test('male curfew keeps outside names at 8 and parenthesized names at 3',()=>{
 for(const text of ['통금 위반 - 이지효(황예진)','통금 위반\n이지효(황예진)','통금 위반 - 이지효 ( 황예진 )']){
  const result=E.compute(ctx(),parse(text));
  assert.deepEqual(Object.fromEntries(result.list.map(r=>[r.name,r.pts])),{'이지효':8,'황예진':3});
 }
 assert.equal(E.compute(ctx(),parse('통금 위반 - 이지효')).list[0].pts,8);
 assert.equal(E.compute(ctx(),parse('통금 위반 - (황예진)')).list[0].pts,3);
});
test('female explicit dates stay explicit, missing dates use chief date',()=>{
 assert.equal(parse('지각 - 이지효','박주영')[0].date,'2026-11-11');
 assert.equal(parse('11/5\n지각 - 이지효','박주영')[0].date,'2026-11-05');
 assert.equal(parse('지각 - 이지효(11.4)','박주영')[0].date,'2026-11-04');
 const r=parse('지각 - 이지효','박주영')[0];
 assert.equal(E.compute({...ctx(),femaleDefaultDate:'2026-11-12'},[r]).list[0].date,'2026-11-12');
});
test('legacy rows are corrected on copies; saved records and manual corrections survive',()=>{
 const input=[row(),row({id:'late',mid:2,art:'Late for school',line:'지각 - 이지효',group:'1|1'}),row({id:'female',mid:3,user:'박주영',date:'',line:'지각',art:'Late for school',group:'2|0'})];
 const before=structuredClone(input),res=E.compute(ctx(),input);
 assert.deepEqual(input,before);
 assert.equal(res.rows.find(r=>r.id==='late').art,'Late for school 7');
 assert.equal(res.rows.find(r=>r.id==='female').date,'2026-11-11');
 assert.equal(res.list.find(r=>r.name==='황예진').pts,3);
 const manual=row({name:'황예진',tok:'황예진',pts:12,date:'2026-10-01',edited:['pts','date'],keepDuplicate:true,deleted:true});
 assert.deepEqual(E.applySourceRules(ctx(),manual),manual);
 const female=row({user:'박주영',date:'2026-10-01',dateDefaulted:true,edited:['date']});
 assert.equal(E.applySourceRules(ctx(),female).date,'2026-10-01');
});
test('recovered parenthetical rows remain independently editable/deletable and are not recreated',()=>{
 const expanded=E.expandSourceRows(ctx(),[row()]);assert.equal(expanded.length,2);
 expanded[1].deleted=true;expanded[1].pts=12;expanded[1].edited=['pts'];
 assert.equal(E.expandSourceRows(ctx(),expanded).length,2);
 assert(!E.compute(ctx(),expanded).list.some(r=>r.name==='황예진'));
 delete expanded[1].deleted;
 assert.equal(E.compute(ctx(),expanded).list.find(r=>r.name==='황예진').pts,12);
});
test('duplicate override includes both; reversal returns to automatic dedup; withdrawal still applies',()=>{
 const a=row({line:'통금 위반 - 이지효'}),b=row({id:'b',mid:2,group:'2|0',line:'통금 위반 - 이지효'});
 assert.equal(E.compute(ctx(),[a,b]).list.length,1);
 b.keepDuplicate=true;
 let res=E.compute(ctx(),[a,b]);assert.equal(res.list.length,2);assert(res.rows.every(r=>r.status==='ok'));
 b.keepDuplicate=false;assert.equal(E.compute(ctx(),[a,b]).list.length,1);
 b.keepDuplicate=true;
 const w=row({id:'w',mid:3,wd:true,line:'통금 위반 취하 이지효'});
 assert.equal(E.compute(ctx(),[a,b,w]).list.length,0);
 assert.equal(E.compute(ctx(),[a,{...b,deleted:true}]).list.length,1);
});
test('draft saves serialize and retain the latest rows through reload without completing the group',async()=>{
 const source=await fs.readFile(new URL('../app.js',import.meta.url),'utf8');
 const begin=source.indexOf('function saveScope('),end=source.indexOf('function defaultPts(',begin);
 const persisted={revision:'rev',done:false,rows:[row()],extra:'preserve',draft:null};
 const pending=[]; let saved=structuredClone(persisted);
 const context={S:{group:'남사감',editRevision:'rev',docs:{g_m:structuredClone(persisted)}},GKEY:{남사감:'m'},draftBuffers:new Map(),groupWrites:new Map(),gdoc:()=>context.S.docs.g_m,save:async fn=>{await fn();return true},store:{transaction:async fn=>{await new Promise(resolve=>pending.push(resolve));await fn({get:async()=>structuredClone(saved),set:(_,d)=>saved=structuredClone(d)});}},toast:()=>{},render:()=>{},clone:structuredClone};
 context.working=()=>context.draftBuffers.get('남사감')?.rows||context.S.docs.g_m.draft||context.S.docs.g_m.rows;
 vm.createContext(context);vm.runInContext(source.slice(begin,end),context);
 const first=[row({pts:4,edited:['pts']})],last=[row({pts:5,edited:['pts'],keepDuplicate:true})];
 const a=context.saveScope('group',first),b=context.saveScope('group',last);
 await new Promise(setImmediate);assert.equal(pending.length,1);pending.shift()();
 await a;await new Promise(setImmediate);assert.equal(pending.length,1);pending.shift()();await b;
 assert.deepEqual(saved.draft,last);assert.equal(saved.done,false);assert.equal(saved.extra,'preserve');assert.deepEqual(saved.rows,persisted.rows);
 assert.deepEqual(context.working(),last);
 // A fresh page uses the saved draft, including manual edits and duplicate choice.
 context.draftBuffers.clear();context.S.docs.g_m=structuredClone(saved);assert.deepEqual(context.working(),last);
});
