import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as E from '../engine.js';
import {rowsForGroup,combinedRows,currentStamps,sourceStamp,reviewSnapshotMatches,memberReviewStage,ownedRows,planPostUpload,canonicalString,scopedPosts} from '../review.js';

const source=await fs.readFile(new URL('../app.js',import.meta.url),'utf8');
const uploadSource = source.slice(source.indexOf('function describePostLocations('), source.indexOf('function viewWaiting('));
test('any author can be uploaded to each selected work group with original authors preserved',async()=>{
 for(const group of E.GROUPS){
  const refs={roster:[{name:'가상학생',grade:1}],articles:[{art:'Cleaning',pts:1}],dict:[{kw:'청소',art:'Cleaning'}]};
  const input={value:['김대기','박주영','곽노재','새선생님'].map((user,i)=>['글',i+1,'2026-11-15','12:00',user,'생활','','청소 - 가상학생'].join('\t')).join('\n')};
  const original=input.value;
  const docs=new Map(), messages=[], notices=[];
  const box={S:{saving:0,role:'chief',chiefUnlocked:true,docs:{refs}},E,ownedRows,planPostUpload,canonicalString,H:String,confirmBox:(...args)=>notices.push(args),GKEY:{남사감:'m',여사감:'f',인트라넷:'i',아침기:'a'},document:{getElementById:id=>id==='sunday'?{value:'2026-11-15'}:input},sundayOf:()=> '2026-11-15',st:()=>({}),uid:()=> 'rev',toast:m=>messages.push(m),Date,Set,Error,
   store:{transaction:async fn=>fn({get:async path=>docs.get(path),set:(path,data)=>docs.set(path,data),del:path=>docs.delete(path)})},save:async fn=>{await fn(); return true;}};
  vm.createContext(box);
  vm.runInContext(uploadSource,box);
  await box.doOrganize(group);
  assert.match(messages[0], /4개 글을 등록/);
  const saved=docs.get('cur/g_'+box.GKEY[group]);
  assert.equal(saved.rows.length,4);
  assert(saved.rows.every(r=>r.uploadGroup===group));
  assert.deepEqual(Array.from(saved.rows,r=>r.user),['김대기','박주영','곽노재','새선생님']);
  assert(docs.get('cur/posts').posts.every(p=>p.uploadGroup===group));
  input.value=original;
  await box.doOrganize(group);
  assert.match(notices[0][0], /이미 등록/);
  assert.match(notices[0][1], new RegExp(group));
  assert.equal(docs.get('cur/g_'+box.GKEY[group]).rows.length, 4);
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
  S: { saving: 0, role: 'member', group, docs: { refs } }, E, memberReviewStage, ownedRows, planPostUpload, canonicalString, H: String, confirmBox() {}, GKEY: { 아침기: 'a', 남사감: 'm' },
  document: { getElementById: id => id === 'paste-a' ? input : null },
  gdoc: () => docs.get(path), groupWrites, sundayOf: () => sunday, st: () => docs.get('cfg/state'),
  uid: () => 'rev' + ++revision, toast() {},
  store: { transaction: async fn => fn({ get: async p => docs.get(p), set: (p, d) => docs.set(p, d), del: p => docs.delete(p) }) },
  save: async fn => { await fn(); return true; },
 };
 vm.createContext(box);
 vm.runInContext(uploadSource, box);

 await box.doOrganize(group, true);
 assert(!docs.has(path));
 assert.equal(input.value, pasted(1));

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
 assert.equal(docs.get('cur/final').reviewed.m, final.reviewed.m);

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

 input.value = '';
 await assert.rejects(box.doOrganize(group, true), /이미 1학년 검토/);
 assert.equal(docs.get(path).rows, appended.rows);

 box.S.group = '남사감';
 await box.doOrganize('남사감', true);
 const empty = docs.get('cur/g_m');
 assert.equal(memberReviewStage(empty), 'complete');
 assert.equal(empty.noPosts, true);
 assert.equal(empty.rows.length, 0);
 assert.equal(docs.get('cur/final').sourceStamps.m, 'v2:pending');
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
 assert.match(html, /등록하고 크로스체크<\/button><button[^>]+data-act="emptyGroup"[^>]*>이번 주 해당 글 없음/);
 box.S.role = 'member2';
 assert.doesNotMatch(box.viewMember(), /<textarea|help.html/);
});

test('cross-group uploads show current whole-post status and require confirmation to make a second copy', async () => {
 const sunday = '2026-11-22', id = '123', title = '테스트 글';
 const input = { value: ['글', id, sunday, '', '곽노재', title, '', '11/17 가상학생'].join('\t') };
 const refs = { roster: [{ name: '가상학생', grade: 1 }], articles: [] };
 const original = { id: 'old-row', post: id, user: '곽노재', excluded: false };
 const state = { phase: 'review', sunday };
 const doc = { revision: 'old', rows: [original], draft: [{ ...original, excluded: true }] };
 const stored = { id, date: sunday, user: '곽노재', title, text: '11/17 가상학생', uploadGroup: '아침기', mark: '포함' };
 const docs = new Map([['cur/posts', { posts: [stored] }], ['cur/g_a', doc], ['cfg/state', state]]);
 const notices = [];
 const box = {
  S: { saving: 0, role: 'member', group: '인트라넷', docs: { refs } },
  E, memberReviewStage, ownedRows, planPostUpload, canonicalString, H: String,
  GKEY: { 남사감: 'm', 여사감: 'f', 인트라넷: 'i', 아침기: 'a' }, groupWrites: new Map(),
  gdoc: () => docs.get('cur/g_i'), st: () => state, sundayOf: () => sunday, uid: () => 'fresh',
  document: { getElementById: key => key === 'paste-i' ? input : null },
  confirmBox: (...args) => notices.push(args), toast() {}, save: async fn => { await fn(); return true; },
  store: { transaction: fn => fn({ get: async path => docs.get(path), set: (path,data) => docs.set(path,data) }) },
 };
 vm.runInNewContext(uploadSource, box);
 await box.doOrganize('인트라넷');
 assert.match(notices[0][1], /글 123.*아침기 \(전체 글 제외\)/);
 assert(!docs.has('cur/g_i'));

 doc.draft[0].excluded = false;
 await notices[0][3]();
 assert.match(notices[1][1], /아침기 \(전체 글 포함\)/);
 assert(!docs.has('cur/g_i'));

 await notices[1][3]();
 assert.equal(docs.get('cur/g_i').rows[0].uploadGroup, '인트라넷');
 assert.equal(docs.get('cur/g_i').rows[0].user, '곽노재');
 assert.deepEqual(Array.from(docs.get('cur/posts').posts, p => p.uploadGroup), ['아침기', '인트라넷']);
 assert.equal(docs.get('cur/g_a'), doc);
});

test('legacy post placement and final review follow the owning group, including hidden drafts', () => {
 const original = { id: 'legacy', post: '14', user: '곽노재', excluded: false };
 const groups = [null, null, { rows: [original], done: true }, null];
 const saved = { rows: [{ ...original, excluded: true }] };
 const posts = [{ id: '14', user: '곽노재', title: '테스트 글' }];
 assert.equal(scopedPosts(posts, groups)[0].uploadGroup, '인트라넷');
 assert.equal(combinedRows(saved, groups)[0].uploadGroup, '인트라넷');
 assert.deepEqual(planPostUpload(posts, '아침기', posts, groups, saved).conflicts[0].locations,
  [{ group: '인트라넷', status: 'excluded' }]);
});

test('adding a row or excluding a post applies only to the selected group and preserves a custom accuser', () => {
 let rows = [
  { id: 'a', post: '14', user: '곽노재', uploadGroup: '아침기', excluded: false },
  { id: 'i', post: '14', user: '곽노재', uploadGroup: '인트라넷', excluded: false },
 ];
 const box = {
  E, uid: () => 'new-row', scopeRows: () => structuredClone(rows), render() {}, renderLater() {},
  saveScope: (_scope, saved) => { rows = saved; },
 };
 vm.runInNewContext(
  source.slice(source.indexOf('function markEdited('), source.indexOf('function setArticle(')) +
  source.slice(source.indexOf('function editField('), source.indexOf('// ================================================================ 버튼')), box);
 box.postAction('final', '14', '인트라넷', 'addRow');
 box.editField('final', 'new-row', 'accuser', ' 별도기소자 ');
 assert.equal(rows[2].uploadGroup, '인트라넷');
 assert.equal(rows[2].accuser, '별도기소자');
 assert.equal(rows[2].user, '곽노재');
 box.postAction('final', '14', '인트라넷', 'excl');
 assert.deepEqual(Array.from(rows, r => r.excluded), [false, true, true]);
});
