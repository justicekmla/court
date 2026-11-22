import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as E from '../engine.js';
import {rowsForGroup,combinedRows,currentStamps,sourceStamp,reviewSnapshotMatches,memberReviewStage} from '../review.js';

const source=await fs.readFile(new URL('../app.js',import.meta.url),'utf8');
test('any author can be uploaded to each selected work group with original authors preserved',async()=>{
 for(const group of E.GROUPS){
  const refs={roster:[{name:'가상학생',grade:1}],articles:[{art:'Cleaning',pts:1}],dict:[{kw:'청소',art:'Cleaning'}]};
  const input={value:['김대기','박주영','곽노재','새선생님'].map((user,i)=>['글',i+1,'2026-11-15','12:00',user,'생활','','청소 - 가상학생'].join('\t')).join('\n')};
  const original=input.value;
  const docs=new Map(), messages=[];
  const box={S:{saving:0,role:'chief',chiefUnlocked:true,docs:{refs}},E,GKEY:{남사감:'m',여사감:'f',인트라넷:'i',아침기:'a'},document:{getElementById:id=>id==='sunday'?{value:'2026-11-15'}:input},sundayOf:()=> '2026-11-15',st:()=>({}),uid:()=> 'rev',toast:m=>messages.push(m),Date,Set,Error,
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

test('first-grade members register their own posts and can append only before handoff', async () => {
 const sunday = '2026-11-22', group = '아침기', path = 'cur/g_a';
 const refs = {
  roster: [{ name: '가상학생', grade: 1 }, { name: '시험학생', grade: 1 }],
  articles: [{ art: E.MORNING_ABSENCE_ARTICLE, pts: 6 }],
 };
 const pasted = id => ['글', id, sunday, '12:00', '담당교사', '아침기 기소', '',
  '16일⏎가상학생⏎17일⏎시험학생'].join('\t');
 const input = { value: pasted(1) };
 const state = { sunday, phase: 'idle' };
 const final = { reviewed: { m: 'approved' }, rows: [] };
 const docs = new Map([['cfg/state', state], ['cur/final', final]]);
 const groupWrites = new Map();
 let revision = 0;
 const box = {
  S: { saving: 0, role: 'member', group, docs: { refs } }, E, memberReviewStage, GKEY: { 아침기: 'a', 남사감: 'm' },
  document: { getElementById: id => id === 'paste-a' ? input : null },
  gdoc: () => docs.get(path), groupWrites, sundayOf: () => sunday, st: () => docs.get('cfg/state'),
  uid: () => 'rev' + ++revision, toast() {},
  store: { transaction: async fn => fn({ get: async p => docs.get(p), set: (p, d) => docs.set(p, d), del: p => docs.delete(p) }) },
  save: async fn => fn(),
 };
 vm.createContext(box);
 vm.runInContext(source.slice(source.indexOf('async function doOrganize('), source.indexOf('function viewWaiting(')), box);

 await box.doOrganize(group);
 const first = docs.get(path);
 assert.equal(memberReviewStage(first), 'first');
 assert.equal(docs.get('cfg/state').phase, 'review');
 assert.deepEqual(Array.from(first.rows, r => r.date), ['2026-11-16', '2026-11-17']);
 assert.equal(input.value, '');

 // A queued draft save must finish before its rows are combined with a later upload.
 groupWrites.set(group, { revision: first.revision, task: new Promise(resolve => setTimeout(() => {
  docs.set(path, { ...first, draft: [{ ...first.rows[0], pts: 3 }, first.rows[1]] });
  resolve(true);
 }, 0)) });
 input.value = pasted(2);
 await box.doOrganize(group);
 const appended = docs.get(path);
 assert.equal(appended.rows.length, 4);
 assert.equal(appended.rows[0].pts, 3);
 assert.equal(docs.get('cur/final'), final);

 input.value = pasted(3);
 await box.doOrganize('남사감');
 assert(!docs.has('cur/g_m'));
 box.S.role = 'member2';
 await box.doOrganize(group);
 assert.equal(docs.get(path), appended);
 box.S.role = 'member';
 docs.set(path, { ...appended, firstDoneAt: 'now' });
 await assert.rejects(box.doOrganize(group), /이미 1학년 검토/);
 assert.equal(input.value, pasted(3));
});

test('the selected first-grade group shows the copy guide and paste box before any upload', () => {
 const box = {
  S: { role: 'member', group: '아침기', saving: 0 }, E, H: String, GKEY: { 아침기: 'a' },
  MEMBER_STAGES: { member: 'first', member2: 'second' }, refsReady: () => true,
  gdoc: () => null, st: () => ({ phase: 'idle' }), sundayOf: () => '2026-11-22',
  memberReviewStage, memberCanEdit: () => false,
 };
 vm.createContext(box);
 vm.runInContext(source.slice(source.indexOf('function copyInstructions('), source.indexOf('function viewPaste(')) +
  source.slice(source.indexOf('function viewMember('), source.indexOf('function legend(')), box);
 const html = box.viewMember();
 assert.match(html, /href="help.html"/);
 assert.match(html, /선택한 글 가져오기/);
 assert.match(html, /id="paste-a"/);
 assert.match(html, /등록하고 크로스체크/);
 box.S.role = 'member2';
 assert.doesNotMatch(box.viewMember(), /<textarea|help.html/);
});
