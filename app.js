import * as E from './engine.js';
import * as IO from './io.js';
import { firebaseStore, localStore } from './store.js';

// ================================================================ 공통
const app = document.getElementById('app');
const H = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const GKEY = { '남사감': 'm', '여사감': 'f', '인트라넷': 'i', '아침기': 'a' };
const GDESC = { '남사감': '김대기 선생님', '여사감': '박주영 선생님', '인트라넷': '그 외 모든 작성자(tr)', '아침기': '곽노재·김명순 선생님' };
const FLAG_CLS = { name: 'f-name', ambig: 'f-ambig', date: 'f-date', pts: 'f-pts' };
const LOCAL = new URLSearchParams(location.search).has('test');
const todayIso = () => { const t = new Date(); return E.iso(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o));

let store = null;
const S = {
  user: null, role: sessionStorage.getItem('cl-role') || '', group: sessionStorage.getItem('cl-group') || '',
  docs: { refs: undefined, state: undefined, posts: undefined, g_m: undefined, g_f: undefined, g_i: undefined, g_a: undefined, final: undefined, extras: undefined },
  view: '', modal: null, toast: '', saving: 0, showColors: true, unsub: [], pendingRender: false, openPosts: new Set()
};
function setRole(r, g) { S.role = r || ''; S.group = g || ''; sessionStorage.setItem('cl-role', S.role); sessionStorage.setItem('cl-group', S.group); render(); }
function toast(msg, ms = 2600) { S.toast = msg; renderToast(); clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = ''; renderToast(); }, ms); }
function renderToast() { let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = S.toast; t.className = S.toast ? 'show' : ''; }
async function save(fn, okMsg) {
  S.saving++; renderSaving();
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) { console.error(e); toast('저장하지 못했습니다: ' + store.errorText(e), 6000); }
  finally { S.saving--; renderSaving(); }
}
function renderSaving() { const el = document.getElementById('saving'); if (el) el.textContent = S.saving ? '저장 중…' : '저장됨'; }

// ================================================================ 데이터 꺼내기
const st = () => S.docs.state || {};
const refsReady = () => !!(S.docs.refs && S.docs.refs.roster && S.docs.refs.roster.length);
function sundayOf() { return st().sunday || E.lastSunday(todayIso()); }
let ctxCache = { key: '', C: null };
function ctx() {
  const key = (S.docs.refs ? S.docs.refs.updatedAt || 'x' : '') + '|' + sundayOf();
  if (ctxCache.key !== key) ctxCache = { key, C: E.makeCtx(S.docs.refs || {}, sundayOf()) };
  return ctxCache.C;
}
const gdoc = g => S.docs['g_' + GKEY[g]];
const working = g => { const d = gdoc(g); return d ? (d.draft || d.rows || []) : []; };
const committed = g => { const d = gdoc(g); return d ? (d.rows || []) : []; };
const allDone = () => E.GROUPS.every(g => gdoc(g) && gdoc(g).done);
function postsById() { const m = new Map(); for (const p of (S.docs.posts && S.docs.posts.posts) || []) m.set(String(p.id), p); return m; }
function extrasRows() {
  const items = ((S.docs.extras && S.docs.extras.items) || []).filter(x => !x.deleted);
  const C = ctx(); const out = [];
  items.forEach(it => {
    const { rows } = E.mentionsToRows(C, E.extraMentions(C, [it]));
    for (const x of rows) out.push({ ...x, mid: 'x-' + it.id, id: 'x-' + it.id + '-' + out.length, order: 1, seq: out.length, extraId: it.id });
  });
  return out;
}
function computeFor(rows) { return E.compute(ctx(), rows); }
function statusMap(result) { const m = new Map(); for (const r of result.rows) if (r.id) m.set(r.id, r); return m; }

// ================================================================ 시작
async function boot() {
  try { store = LOCAL ? localStore() : await firebaseStore(); }
  catch (e) { app.innerHTML = '<div class="center-box"><h2>연결하지 못했습니다</h2><p>인터넷 연결을 확인하고 새로고침하세요.</p><pre>' + H(e.message || e) + '</pre></div>'; return; }
  if (LOCAL) document.body.classList.add('test-mode');
  store.onAuth(u => {
    S.user = u;
    S.unsub.forEach(f => f()); S.unsub = [];
    if (u) {
      const paths = { refs: 'cfg/refs', state: 'cfg/state', posts: 'cur/posts', g_m: 'cur/g_m', g_f: 'cur/g_f', g_i: 'cur/g_i', g_a: 'cur/g_a', final: 'cur/final', extras: 'cur/extras' };
      for (const [k, p] of Object.entries(paths)) {
        S.docs[k] = undefined;
        S.unsub.push(store.watch(p, v => { S.docs[k] = v; scheduleRender(); }, e => toast('불러오지 못했습니다: ' + store.errorText(e), 8000)));
      }
    }
    render();
  });
}
function loaded() { return Object.values(S.docs).every(v => v !== undefined); }
function scheduleRender() {
  const a = document.activeElement;
  if (isTyping(a)) { S.pendingRender = true; return; }
  render();
}
function isTyping(a) { return !!(a && app.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(file|checkbox|radio|button|submit)$/.test(a.type)))); }
let laterT = 0;
function renderLater() { clearTimeout(laterT); laterT = setTimeout(() => scheduleRender(), 220); }
app.addEventListener('focusout', () => { if (S.pendingRender) setTimeout(() => { if (S.pendingRender && !isTyping(document.activeElement)) render(); }, 50); });

// ================================================================ 화면 그리기
function render() {
  S.pendingRender = false;
  const y = window.scrollY;
  const keep = {};
  for (const el of app.querySelectorAll('[data-keep]')) keep[el.dataset.keep] = el.type === 'checkbox' ? el.checked : el.value;
  let body;
  if (!S.user) body = viewLogin();
  else if (!loaded()) body = '<div class="center-box"><div class="spinner"></div><p>불러오는 중…</p></div>';
  else if (!S.role) body = viewHome();
  else if (S.role === 'chief') body = viewChief();
  else body = viewMember();
  app.innerHTML = topbar() + '<main id="main">' + body + '</main>' + (S.modal ? '<div class="modal-bg"><div class="modal">' + S.modal + '</div></div>' : '');
  for (const el of app.querySelectorAll('[data-keep]')) if (el.dataset.keep in keep && !S.resetKeep) { if (el.type === 'checkbox') el.checked = keep[el.dataset.keep]; else el.value = keep[el.dataset.keep]; }
  S.resetKeep = false;
  window.scrollTo(0, y);
}
function topbar() {
  if (!S.user) return '';
  const role = S.role === 'chief' ? '법무부장' : S.role === 'member' ? '법무부원' + (S.group ? ' · ' + S.group : '') : '';
  return '<header class="top"><button class="brand" data-act="home">법정리스트</button>' +
    (st().listNo ? '<span class="pill">Court List ' + H(st().listNo) + '</span>' : '') +
    (role ? '<span class="pill role">' + H(role) + '</span>' : '') +
    '<span class="grow"></span>' + (S.role ? '<span id="saving" class="muted small">' + (S.saving ? '저장 중…' : '') + '</span>' : '') +
    (S.role === 'chief' ? '<button class="ghost small" data-act="settings">설정</button>' : '') +
    '<button class="ghost small" data-act="home">처음 화면</button></header>';
}

// ---------------------------------------------------------------- 로그인
function viewLogin() {
  const em = localStorage.getItem('cl-email') || '';
  return '<div class="center-box login"><h1>법정리스트</h1><p class="muted">법무부 공용 계정으로 로그인하세요.</p>' +
    '<form id="login"><label>이메일<input name="email" type="email" autocomplete="username" value="' + H(em) + '" required></label>' +
    '<label>비밀번호<input name="pw" type="password" autocomplete="current-password" required></label>' +
    '<button class="primary big" type="submit">로그인</button><p id="loginErr" class="err"></p></form></div>';
}
// ---------------------------------------------------------------- 첫 화면
function viewHome() {
  const sun = sundayOf(), mon = E.addDays(sun, -6);
  return '<div class="center-box home"><h1>법정리스트</h1>' +
    '<div class="home-btns"><button class="primary huge" data-act="role" data-role="chief">법무부장</button><button class="outline huge" data-act="seat-arranger">법무부차장</button><button class="outline huge" data-act="role" data-role="member">법무부원</button></div>' +
    '<p class="muted">' + (st().phase && st().phase !== 'idle' ? '진행 중: ' + E.fmtMD(mon) + '(월) ~ ' + E.fmtMD(sun) + '(일) · ' + phaseText() : '이번 주 정리를 아직 시작하지 않았습니다') + '</p>' +
    (LOCAL ? '<p class="test-note">시험 모드입니다. 이 브라우저에만 저장되며 다른 사람과 공유되지 않습니다.</p>' : '') + '</div>';
}
function phaseText() { return { review: '크로스체크 단계', extras: '추가 기소 단계', list: '리스트 완성' }[st().phase] || ''; }

// ================================================================ 법무부장
function viewChief() {
  if (S.view === 'settings') return viewSettings();
  if (!refsReady()) return viewNeedRefs();
  const ph = st().phase || 'idle';
  if (ph === 'idle') return viewPaste();
  if (ph === 'review') return allDone() ? viewFinal() : viewWaiting();
  if (ph === 'extras') return viewExtras();
  if (ph === 'list') return viewList();
  return viewPaste();
}
function steps(n) {
  const t = ['붙여넣기', '크로스체크', '추가 기소', '법정리스트'];
  return '<ol class="steps">' + t.map((x, i) => '<li class="' + (i + 1 === n ? 'on' : i + 1 < n ? 'done' : '') + '">' + (i + 1) + ' ' + x + '</li>').join('') + '</ol>';
}
function viewNeedRefs() {
  return '<div class="panel narrow"><h2>기준자료를 먼저 올려 주세요</h2><p>재학생 명단, 벌점표, 표현사전, 오타교정, 학생대표, 리스트 머리말이 든 <b>기준자료.xlsx</b> 파일을 한 번 올리면 모든 사람이 함께 씁니다.</p>' +
    (st().listNo ? '' : '<p><label>다음에 만들 리스트 번호 <input id="firstNo" data-keep="firstNo" type="number" value="25" size="4"></label></p>') +
    dropZone('refs', '기준자료.xlsx를 여기에 끌어다 놓거나 눌러서 고르세요') + '</div>';
}
function dropZone(kind, label, multiple) {
  return '<label class="drop" data-drop="' + kind + '"><input type="file" accept=".xlsx,.xlsm" ' + (multiple ? 'multiple ' : '') + 'data-file="' + kind + '" hidden><span>' + H(label) + '</span></label>';
}
// ---------------------------------------------------------------- 1) 붙여넣기
function viewPaste() {
  const sun = sundayOf();
  return steps(1) + '<div class="panel"><h2>인트라넷 글 붙여넣기</h2>' +
    '<p class="muted">인트라넷 법정게시판에서 <b>법정글 복사</b> 즐겨찾기를 눌러 복사한 내용을 아래 칸에 붙여넣으세요. <a href="help.html" target="_blank">즐겨찾기 설치·사용법</a></p>' +
    '<div class="row-inline"><label>기준 일요일 <input type="date" id="sunday" value="' + H(sun) + '" data-keep="sunday"></label>' +
    '<span class="muted" id="weekInfo">' + E.fmtMD(E.addDays(sun, -6)) + '(월) ~ ' + E.fmtMD(sun) + '(일) 에 올라온 글만 씁니다 · 리스트 번호 ' + H(st().listNo || '?') + '</span></div>' +
    '<textarea id="paste" class="paste" placeholder="여기에 붙여넣기 (⌘V / Ctrl+V)" data-keep="paste"></textarea><p id="pasteInfo" class="muted"></p>' +
    '<button class="primary big" data-act="organize">정리</button></div>';
}
async function doOrganize() {
  const text = document.getElementById('paste').value;
  const sunday = document.getElementById('sunday').value || E.lastSunday(todayIso());
  const posts = E.parsePasted(text);
  if (!posts.length) { toast('붙여넣은 글을 읽지 못했습니다. 즐겨찾기로 복사한 내용을 그대로 붙여넣으세요.', 5000); return; }
  const monday = E.addDays(sunday, -6);
  const C = E.makeCtx(S.docs.refs, sunday);
  const wk = E.extractWeek(C, posts, monday, sunday);
  if (!wk.posts.length) { toast(E.fmtMD(monday) + '~' + E.fmtMD(sunday) + ' 기간의 글이 없습니다. 기준 일요일을 확인하세요.', 6000); return; }
  const by = { m: [], f: [], i: [], a: [] };
  for (const r of wk.rows) by[GKEY[E.groupOf(r.user)]].push(r);
  const now = new Date().toISOString();
  const ops = [['cur/posts', { posts: wk.posts, monday, sunday, createdAt: now }], ['cur/final', null], ['cur/extras', null]];
  for (const k of Object.keys(by)) ops.push(['cur/g_' + k, { rows: by[k], draft: null, done: false, createdAt: now }]);
  ops.push(['cfg/state', { ...st(), phase: 'review', sunday, monday, startedAt: now, listNo: st().listNo || 1 }]);
  await save(() => store.batch(ops), wk.posts.length + '개 글을 정리했습니다');
}
// ---------------------------------------------------------------- 2) 크로스체크 대기
function viewWaiting() {
  const rows = E.GROUPS.map(g => {
    const d = gdoc(g) || {}; const list = (d.draft || d.rows || []).filter(r => !r.placeholder);
    const s = d.done ? '<span class="ok">✔ 완료</span>' : d.draft ? '<span class="warn">수정 중</span>' : '<span class="muted">시작 전</span>';
    return '<tr><td><b>' + g + '</b> <span class="muted small">' + GDESC[g] + '</span></td><td class="num">' + list.length + '</td><td>' + s + '</td>' +
      '<td>' + (d.done ? '<button class="ghost small" data-act="reopen" data-g="' + g + '">다시 열기</button>' : '') + '</td></tr>';
  }).join('');
  const n = E.GROUPS.filter(g => gdoc(g) && gdoc(g).done).length;
  return steps(2) + '<div class="panel narrow center"><h2>법무부원 크로스체크 진행 중…</h2>' +
    '<div class="progress"><div style="width:' + (n * 25) + '%"></div></div><p class="muted">' + n + ' / 4 완료 · 4명 모두 \'크로스체킹 완료\'를 누르면 완성 정리본이 나타납니다.</p>' +
    '<table class="grid compact"><thead><tr><th>담당</th><th>항목 수</th><th>상태</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="muted small">' + weekLine() + '</p></div>';
}
function weekLine() { const p = S.docs.posts || {}; return (p.posts ? p.posts.length + '개 글 · ' : '') + E.fmtMD(p.monday || '') + ' ~ ' + E.fmtMD(p.sunday || ''); }
// ---------------------------------------------------------------- 3) 완성 정리본
function finalRows() { return S.docs.final ? S.docs.final.rows : E.GROUPS.flatMap(g => committed(g)).sort((a, b) => a.seq - b.seq); }
function viewFinal() {
  const rows = finalRows();
  const res = computeFor(rows); const sm = statusMap(res);
  const cnt = counts(res.rows);
  return steps(2) + '<div class="panel"><div class="head-row"><h2>완성 정리본</h2><span class="muted">4명 크로스체크 완료 · 원문 이름 순서 · 칸을 눌러 직접 고칠 수 있습니다</span><span class="grow"></span>' +
    '<button class="primary" data-act="toExtras">완성 정리본 확인 →</button></div>' + summaryChips(cnt) +
    E.GROUPS.map(g => '<h3 class="sec">' + g + ' <span class="muted small">' + GDESC[g] + '</span></h3>' + rowsTable(rows.filter(r => E.groupOf(r.user) === g), sm, { scope: 'final' })).join('') + '</div>';
}
function counts(rows) {
  const c = { ok: 0, dup: 0, withdrawn: 0, wdreq: 0, unassigned: 0, excluded: 0, flag: 0, deleted: 0 };
  for (const r of rows) { if (r.placeholder) continue; c[r.status] = (c[r.status] || 0) + 1; if (r.status === 'ok' && r.flags.length) c.flag++; }
  return c;
}
function summaryChips(c) {
  return '<div class="chips"><span class="chip">반영 <b>' + c.ok + '</b></span><span class="chip warnc">확인 표시 <b>' + c.flag + '</b></span>' +
    '<span class="chip">중복 <b>' + c.dup + '</b></span><span class="chip">취하됨 <b>' + c.withdrawn + '</b></span>' +
    (c.unassigned ? '<span class="chip errc">항목 없음 <b>' + c.unassigned + '</b></span>' : '') + (c.deleted ? '<span class="chip">지움 <b>' + c.deleted + '</b></span>' : '') + '</div>';
}
// ---------------------------------------------------------------- 4) 추가 기소
function viewExtras() {
  const ex = S.docs.extras || {}; const items = ex.items || [];
  const files = ex.files || [];
  const C = ctx();
  const live = items.filter(x => !x.deleted);
  const tr = items.map((x, i) => {
    if (x.deleted) return '';
    const nm = E.lookup(C, C.nameFix.get(x.name) || x.name, x.grade || 0);
    const nameCls = nm.length === 1 ? '' : nm.length > 1 ? 'f-ambig' : 'f-name';
    const artCls = C.artPoints.has(E.resolveArticle(C, x.art, x.acc)) ? '' : 'f-pts';
    return '<tr data-xid="' + H(x.id) + '"><td><input class="cell ' + nameCls + '" data-xf="name" value="' + H(x.name) + '"></td>' +
      '<td><input class="cell" data-xf="grade" value="' + H(x.grade || '') + '" size="2"></td>' +
      '<td><input class="cell" data-xf="date" value="' + H(x.date ? E.fmtMD(x.date) : '') + '" placeholder="날짜" size="6"></td>' +
      '<td><input class="cell" data-xf="acc" value="' + H(x.acc) + '" size="8"></td>' +
      '<td>' + artSelect(x.art, 'data-xf="art"', artCls, x.acc) + '</td>' +
      '<td><input class="cell num" data-xf="pts" value="' + H(x.pts ?? '') + '" size="3" placeholder="자동"></td>' +
      '<td class="muted small src">' + H(x.src) + '</td><td><button class="icon" data-act="xdel" title="빼기">✕</button></td></tr>';
  }).join('');
  return steps(3) + '<div class="panel"><div class="head-row"><h2>추가 기소</h2><span class="muted">선도부·법무부·식품영양부 등에서 받은 파일, 메신저·종이로 받은 기소를 넣습니다</span><span class="grow"></span>' +
    '<button class="ghost" data-act="backFinal">← 완성 정리본</button><button class="primary" data-act="toList">추가 기소 반영 완료 →</button></div>' +
    '<div class="two"><div><h3>부서 엑셀 파일</h3>' + dropZone('dept', '엑셀 파일(.xlsx)을 여기에 끌어다 놓거나 눌러서 고르세요 · 여러 개 가능', true) +
    '<p class="muted small">노란색으로 칠한 줄이 있는 파일(법정 좌석표)은 노란 줄만, 없으면 모든 줄을 가져옵니다.</p>' +
    (files.length ? '<ul class="files">' + files.map((f, i) => '<li><b>' + H(f.name) + '</b> · ' + f.count + '건' + (f.yellowOnly ? ' (노란 줄만)' : '') + ' <button class="icon" data-act="fdel" data-i="' + i + '" title="이 파일 빼기">✕</button></li>').join('') + '</ul>' : '') + '</div>' +
    '<div><h3>직접 붙여넣기</h3><textarea id="xpaste" class="paste small-ta" placeholder="예) 10/23 외부음식 10점 홍길동 김철수&#10;또는 엑셀 표를 머리글(이름·날짜·기소 항목…)째 복사해 붙여넣기" data-keep="xpaste"></textarea>' +
    '<div class="row-inline"><label>기소자 <input id="xacc" placeholder="예: 식품영양부" size="10" data-keep="xacc"></label><button class="outline" data-act="xadd">붙여넣은 내용 추가</button></div><p id="xinfo" class="muted small"></p></div></div>' +
    '<h3>추가될 기소 <span class="muted small">' + live.length + '건 · 칸을 눌러 고칠 수 있습니다 (분홍=명단에 없는 이름, 주황=동명이인, 노랑=벌점표에 없는 항목)</span></h3>' +
    (live.length ? '<div class="tablewrap"><table class="grid"><thead><tr><th>이름</th><th>학년</th><th>날짜</th><th>기소자</th><th>기소 항목</th><th>점수</th><th>출처</th><th></th></tr></thead><tbody>' + tr + '</tbody></table></div>' : '<p class="muted">아직 없습니다. 추가 기소가 없으면 바로 [추가 기소 반영 완료]를 누르세요.</p>') + '</div>';
}
// ---------------------------------------------------------------- 5) 법정리스트
function listResult() { const rows = finalRows().concat(extrasRows()); return computeFor(rows); }
function viewList() {
  const res = listResult(); const list = res.list;
  const refs = S.docs.refs; const h = refs.header || { labels: [], names: [], notice: '' };
  const sun = st().sunday; const no = st().listNo;
  const issues = issueList(res);
  let body = ''; let i = 0;
  while (i < list.length) {
    let j = i; while (j + 1 < list.length && list[j + 1].disp === list[i].disp) j++;
    for (let k = i; k <= j; k++) {
      const r = list[k]; const fl = kinds(r);
      const nameFlag = list.slice(i, j + 1).flatMap(x => x.flags).find(f => f[0] === 'name' || f[0] === 'ambig');
      body += '<tr><td></td><td>' + (r.grade || '') + '</td>' +
        (k === i ? '<td rowspan="' + (j - i + 1) + '" class="' + (S.showColors && nameFlag ? FLAG_CLS[nameFlag[0]] : '') + '" title="' + H(nameFlag ? nameFlag[1] : '') + '">' + H(r.disp) + '</td>' : '') +
        '<td class="' + (S.showColors && fl.date ? 'f-date' : '') + '" title="' + H(fl.date || '') + '">' + E.fmtDate(r.date) + '</td><td>' + H(r.accuser) + '</td><td>' + H(r.art) + '</td>' +
        '<td class="' + (S.showColors && fl.pts ? 'f-pts' : '') + '" title="' + H([fl.pts, r.repBonus ? '학생대표 +1점' : ''].filter(Boolean).join(' / ')) + '">' + r.finalPts + '</td><td></td></tr>';
    }
    i = j + 1;
  }
  const sheet = '<div class="court" id="court"><table class="court-t"><colgroup><col style="width:4%"><col style="width:6.7%"><col style="width:10.3%"><col style="width:9.7%"><col style="width:10.7%"><col style="width:38%"><col style="width:10.2%"><col style="width:10.3%"></colgroup>' +
    '<tr class="tr-title"><td colspan="6" rowspan="3" class="title">Court List ' + H(no) + ' 법무부용</td><td class="hb">' + H(h.labels[0]) + '</td><td class="hb">' + H(h.names[0]) + '</td></tr>' +
    '<tr class="tr-title"><td class="hb">' + H(h.labels[1]) + '</td><td class="hb">' + H(h.names[1]) + '</td></tr><tr class="tr-title"><td class="hb">' + H(h.labels[2]) + '</td><td class="hb">' + H(h.names[2]) + '</td></tr>' +
    '<tr><td colspan="8" class="notice">' + H(IO.wednesdayLabel(sun) + '\n' + h.notice) + '</td></tr>' +
    '<tr class="th"><td>No</td><td>Grade</td><td>Name</td><td>Date</td><td>Accused by</td><td>Violated Article</td><td>Points</td><td>Sum</td></tr>' + body + '</table></div>';
  return steps(4) + '<div class="panel"><div class="head-row"><h2>Court List ' + H(no) + ' 법무부용</h2><span class="muted">' + list.length + '건 · ' + E.fmtMD(E.addDays(sun, -6)) + '~' + E.fmtMD(sun) + ' · 날짜 ' + IO.wednesdayLabel(sun) + '</span><span class="grow"></span>' +
    '<button class="ghost" data-act="backExtras">← 추가 기소</button><button class="primary" data-act="dlx">엑셀 다운로드</button><button class="outline" data-act="pdf">PDF 저장</button></div>' +
    '<div class="head-row"><label class="small"><input type="checkbox" data-act="colors" ' + (S.showColors ? 'checked' : '') + '> 확인할 칸 색 표시 (다운로드 파일에는 색이 없습니다)</label><span class="grow"></span><button class="danger ghost small" data-act="newWeek">새로 시작 (다음 주)</button></div>' +
    (issues.length ? '<details class="issues" open><summary>확인 필요 ' + issues.length + '건</summary><div class="tablewrap"><table class="grid compact"><thead><tr><th>이름</th><th>날짜</th><th>항목</th><th>칸</th><th>사유</th><th>출처</th></tr></thead><tbody>' +
      issues.map(x => '<tr><td>' + H(x.name) + '</td><td>' + H(x.date) + '</td><td>' + H(x.art) + '</td><td><span class="tag ' + (x.cls || '') + '">' + H(x.kind) + '</span></td><td>' + H(x.msg) + '</td><td class="muted small">' + H(x.src) + '</td></tr>').join('') +
      '</tbody></table></div><p class="muted small">고칠 것이 있으면 [← 추가 기소] → [← 완성 정리본]으로 돌아가 칸을 고치면 리스트가 바로 다시 만들어집니다.</p></details>' : '') + sheet + '</div>';
}
function kinds(r) { const o = {}; for (const [k, m] of r.flags) o[k] = o[k] ? o[k] + ' / ' + m : m; return o; }
function issueList(res) {
  const out = [];
  for (const r of res.list) for (const [k, m] of r.flags) out.push({ name: r.disp, date: E.fmtDate(r.date), art: r.art, kind: { name: '이름', ambig: '이름', date: '날짜', pts: '점수' }[k], cls: FLAG_CLS[k], msg: m, src: E.sourceLabel(r) });
  for (const r of res.rows) if (r.status === 'unassigned' && !r.wd) out.push({ name: r.tok || r.name, date: '', art: '', kind: '항목 없음', cls: 'f-name', msg: '기소 항목을 찾지 못해 리스트에 넣지 않음', src: E.sourceLabel(r) + ' ' + (r.line || '') });
  for (const w of res.wdLog) if (w.kind !== 'done') out.push({ name: w.name, date: w.date, art: w.art, kind: '취하', cls: w.kind === 'past' ? 'f-date' : 'f-pts', msg: w.res, src: '글 ' + w.post + '(' + w.user + ')' });
  return out;
}
// ---------------------------------------------------------------- 설정
function viewSettings() {
  const r = S.docs.refs || {}; const h = r.header || { labels: ['담당교사', '법무부장', '사법위원장'], names: ['', '', ''], notice: '' };
  const s = st();
  return '<div class="panel narrow"><div class="head-row"><h2>설정</h2><span class="grow"></span><button class="ghost" data-act="closeSettings">← 돌아가기</button></div>' +
    '<h3>리스트</h3><div class="form"><label>다음 리스트 번호 <input id="setNo" data-keep="setNo" type="number" value="' + H(s.listNo || 1) + '"></label>' +
    '<label>기준 일요일 <input id="setSun" data-keep="setSun" type="date" value="' + H(s.sunday || '') + '"><span class="muted small">비우면 오늘 기준 지난 일요일</span></label></div>' +
    '<h3>리스트 머리말</h3><div class="form">' + [0, 1, 2].map(i => '<label><input class="hl" data-keep="hl' + i + '" data-i="' + i + '" value="' + H(h.labels[i] || '') + '" size="8"> <input class="hn" data-keep="hn' + i + '" data-i="' + i + '" value="' + H(h.names[i] || '') + '" size="10"></label>').join('') +
    '<label class="wide">안내문 (날짜 다음 줄부터)<textarea id="setNotice" data-keep="setNotice" rows="8">' + H(h.notice || '') + '</textarea></label></div>' +
    '<button class="primary" data-act="saveSettings">저장</button>' +
    '<h3>기준자료</h3><p class="muted">학생 ' + ((r.roster || []).length) + '명 · 벌점표 ' + ((r.articles || []).length) + '개 · 표현 ' + ((r.dict || []).length) + '개' + (r.updatedAt ? ' · ' + H(r.updatedAt.slice(0, 10)) + ' 올림' : '') + '</p>' +
    '<p>학기·학년이 바뀌거나 표현을 추가하려면 [내려받기] → 엑셀에서 고치기 → 다시 올리기.</p><div class="row-inline"><button class="outline" data-act="dlRefs">현재 기준자료 내려받기</button></div>' + dropZone('refs', '고친 기준자료.xlsx를 여기에 끌어다 놓거나 눌러서 고르세요') +
    '<h3>이번 주 자료</h3><p class="muted">' + (s.phase && s.phase !== 'idle' ? weekLine() + ' · ' + phaseText() : '진행 중인 정리가 없습니다') + '</p>' +
    '<div class="row-inline">' + (s.phase && s.phase !== 'idle' ? E.GROUPS.map(g => gdoc(g) && gdoc(g).done ? '<button class="ghost small" data-act="reopen" data-g="' + g + '">' + g + ' 다시 열기</button>' : '').join('') +
      '<button class="danger ghost" data-act="resetWeek">이번 주 정리 지우고 처음부터</button>' : '') + '</div>' +
    '<h3>계정</h3><p class="muted">' + H(S.user && S.user.email) + '</p><button class="ghost" data-act="logout">로그아웃</button></div>';
}

// ================================================================ 법무부원
function viewMember() {
  if (!refsReady() || !st().phase || st().phase === 'idle' || !S.docs.posts) return '<div class="center-box"><h2>아직 정리된 글이 없습니다</h2><p class="muted">법무부장이 인트라넷 글을 붙여넣고 정리하면 여기에 나타납니다. 이 화면은 자동으로 바뀝니다.</p></div>';
  if (!S.group) return '<div class="center-box"><h2>담당을 고르세요</h2><div class="grid4">' + E.GROUPS.map(g => {
    const d = gdoc(g) || {};
    return '<button class="primary huge g" data-act="pick" data-g="' + g + '">' + g + '<small>' + GDESC[g] + (d.done ? ' · 완료' : d.draft ? ' · 수정 중' : '') + '</small></button>';
  }).join('') + '</div><p class="muted small">' + weekLine() + '</p></div>';
  const d = gdoc(S.group);
  if (!d) return '<div class="center-box"><p>담당 자료가 없습니다.</p></div>';
  if (d.done) return '<div class="center-box thanks"><div class="big-emoji">🙂</div><h1>수고하셨습니다</h1><p class="muted">' + H(S.group) + ' 크로스체크가 통합 정리본에 반영되었습니다.<br>이 화면 이후에는 수정할 수 없습니다.</p></div>';
  const mine = working(S.group);
  const others = E.GROUPS.filter(g => g !== S.group).flatMap(g => committed(g));
  const res = computeFor(mine.concat(others)); const sm = statusMap(res);
  const cnt = counts(res.rows.filter(r => mine.some(m => m.id === r.id)));
  return '<div class="panel"><div class="head-row"><h2>' + H(S.group) + ' <span class="muted small">' + GDESC[S.group] + '</span></h2><span class="grow"></span>' +
    '<button class="primary" data-act="memberDone">크로스체킹 완료</button></div>' +
    '<p class="muted">원문과 나란히 보며 이름·날짜·항목·점수를 고치세요. 고친 내용은 자동 저장되고, [크로스체킹 완료]를 누르면 통합 정리본에 한꺼번에 반영됩니다.</p>' + summaryChips(cnt) + legend() +
    rowsTable(mine, sm, { scope: 'group' }) + '<div class="foot-row"><button class="primary big" data-act="memberDone">크로스체킹 완료</button></div></div>';
}
function legend() { return '<p class="legend"><span class="f-name">명단에 없는 이름</span><span class="f-ambig">동명이인 추정</span><span class="f-date">날짜 없음·오타 의심</span><span class="f-pts">점수 미기재·벌점표에 없음</span><span class="st-dup">중복·취하(회색)</span></p>'; }

// ================================================================ 표 (원문 줄 | 이름 | 날짜 | 항목 | 점수 | 상태)
function artSelect(val, attr, cls, poster) {
  const C = ctx(); const list = C.articleList; let v = val || '';
  if (v && !list.includes(v)) { const r = E.resolveArticle(C, v, poster || ''); if (list.includes(r)) v = r; }
  return '<select class="cell ' + (cls || '') + '" ' + attr + '><option value="">(항목 선택)</option>' + list.map(a => '<option' + (a === v ? ' selected' : '') + '>' + H(a) + '</option>').join('') +
    (v && !list.includes(v) ? '<option selected>' + H(v) + '</option>' : '') + '</select>';
}
function statusBadge(r) {
  switch (r.status) {
    case 'ok': return r.wd ? '' : '<span class="b ok">반영</span>';
    case 'dup': return '<span class="b gray" title="' + H(r.note) + '">' + H(r.note) + '</span>';
    case 'withdrawn': return '<span class="b gray">' + H(r.note) + '</span>';
    case 'wdreq': return '<span class="b wd">취하 요청</span> <span class="small">' + H(r.note) + '</span>';
    case 'unassigned': return '<span class="b err">' + (r.wd ? H(r.note) : '항목 없음 → 항목을 고르면 반영') + '</span>';
    case 'excluded': return '<span class="b gray">제외된 글</span>';
    case 'deleted': return '<span class="b gray">지움</span>';
    default: return '';
  }
}
function rowsTable(rows, sm, opt) {
  const P = postsById(); const C = ctx();
  const order = []; const by = new Map();
  for (const r of rows) { if (!by.has(r.post)) { by.set(r.post, []); order.push(r.post); } by.get(r.post).push(r); }
  if (!order.length) return '<p class="muted">이 담당에 해당하는 글이 없습니다.</p>';
  order.sort((x, y) => (parseFloat(x) || 0) - (parseFloat(y) || 0));
  return order.map(pid => {
    const p = P.get(String(pid)) || { id: pid, title: '', user: '', date: '', text: '' };
    const list = by.get(pid).slice().sort((a, b) => (a.lineNo || 0) - (b.lineNo || 0) || (a.seq || 0) - (b.seq || 0));
    const excl = list.some(r => r.excluded);
    const real = list.filter(r => !r.placeholder);
    let lastLine = null;
    const trs = real.map(r => {
      const c = sm.get(r.id) || r; const fl = kinds(c);
      const gray = ['dup', 'withdrawn', 'excluded', 'deleted'].includes(c.status);
      const showLine = r.lineNo !== lastLine; lastLine = r.lineNo;
      const nameVal = r.edited && r.edited.includes('name') ? r.name : (C.rosterFull.has(r.name) ? E.displayName(C, r.name) : (r.name || r.tok));
      const ptsVal = r.art || (r.edited && r.edited.includes('pts')) ? r.pts : '';
      const nf = fl.name ? 'f-name' : fl.ambig ? 'f-ambig' : '';
      return '<tr data-id="' + H(r.id) + '" data-scope="' + opt.scope + '" class="' + (gray ? 'st-dup' : '') + (c.status === 'deleted' ? ' st-del' : '') + '">' +
        '<td class="src-line">' + (showLine ? H(r.line) : '') + '</td>' +
        '<td><input class="cell ' + (S.showColors ? nf : '') + '" data-f="name" value="' + H(nameVal) + '" title="' + H(fl.name || fl.ambig || '') + '"></td>' +
        '<td><input class="cell ' + (fl.date ? 'f-date' : '') + '" data-f="date" value="' + H(r.date ? E.fmtMD(r.date) : '') + '" placeholder="날짜" size="5" title="' + H(fl.date || '') + '"></td>' +
        '<td>' + artSelect(r.art, 'data-f="art"', fl.pts ? 'f-pts' : '', r.user) + '</td>' +
        '<td><input class="cell num ' + (fl.pts ? 'f-pts' : '') + '" data-f="pts" value="' + H(ptsVal) + '" size="2" title="' + H(fl.pts || '') + '">' + (C.reps.has(E.baseName(c.name || '')) && c.art ? '<span class="rep" title="학생대표: 리스트에서 +1점">+1</span>' : '') + '</td>' +
        '<td class="stat">' + statusBadge(c) + '</td>' +
        '<td>' + (c.status === 'deleted' ? '<button class="icon" data-act="undel" title="되살리기">↺</button>' : '<button class="icon" data-act="del" title="이 줄 지우기">✕</button>') + '</td></tr>';
    }).join('');
    const open = S.openPosts.has(String(pid));
    return '<section class="post' + (excl ? ' excl' : '') + '"><div class="post-h"><span class="pid">글 ' + H(p.id) + '</span><b>' + H(p.title) + '</b><span class="muted small">' + H(p.user) + ' · ' + E.fmtMD(p.date) + ' ' + H((p.time || '').slice(0, 5)) + '</span>' +
      (excl ? '<span class="b gray">제외: ' + H(p.markNote || '') + '</span>' : '') + '<span class="grow"></span>' +
      '<button class="ghost small" data-act="toggleText" data-pid="' + H(pid) + '">' + (open ? '원문 닫기' : '원문 전체') + '</button>' +
      '<button class="ghost small" data-act="' + (excl ? 'incl' : 'excl') + '" data-pid="' + H(pid) + '" data-scope="' + opt.scope + '">' + (excl ? '이 글 넣기' : '이 글 빼기') + '</button></div>' +
      (open ? '<pre class="fulltext">' + H(E.normalize(p.text || '')) + '</pre>' : '') +
      (real.length ? '<div class="tablewrap"><table class="grid edit"><colgroup><col class="c-line"><col class="c-name"><col class="c-date"><col class="c-art"><col class="c-pts"><col class="c-st"><col class="c-x"></colgroup><thead><tr><th>원문 줄</th><th>이름</th><th>날짜</th><th>기소 항목</th><th>점수</th><th>상태</th><th></th></tr></thead><tbody>' + trs + '</tbody></table></div>' : '<p class="muted small none">(뽑힌 항목 없음 — 원문 전체를 확인하세요)</p>') +
      '<button class="ghost small add" data-act="addRow" data-pid="' + H(pid) + '" data-scope="' + opt.scope + '">+ 줄 추가</button></section>';
  }).join('');
}

// ================================================================ 고치기 (부원: 내 담당 draft / 부장: final)
function scopeRows(scope) { return scope === 'final' ? clone(finalRows()) : clone(working(S.group)); }
function saveScope(scope, rows) {
  if (scope === 'final') { S.docs.final = { ...(S.docs.final || {}), rows }; return save(() => store.set('cur/final', { rows, updatedAt: new Date().toISOString() })); }
  const k = 'cur/g_' + GKEY[S.group]; const d = gdoc(S.group);
  S.docs['g_' + GKEY[S.group]] = { ...d, draft: rows };
  return save(() => store.merge(k, { draft: rows, savedAt: new Date().toISOString() }));
}
function defaultPts(art) {
  const C = ctx(); const b = C.artPoints.get(art);
  if (b === undefined) return '';
  if (typeof b === 'string') { const d = C.artDefault.get(art); return E.cellText(d) !== '' ? Number(d) : Number(b.split(',')[0]); }
  return Number(b);
}
function markEdited(r, f) { r.edited = Array.from(new Set([...(r.edited || []), f])); }
function editField(scope, id, f, value) {
  const rows = scopeRows(scope); const r = rows.find(x => x.id === id); if (!r) return;
  if (f === 'name') { r.name = value.trim(); markEdited(r, 'name'); }
  else if (f === 'date') { const d = value.trim() ? E.toDate(value, sundayOf()) : ''; if (value.trim() && !d) { toast('날짜를 10/23 처럼 적어 주세요'); render(); return; } r.date = d; markEdited(r, 'date'); }
  else if (f === 'art') { r.art = value; markEdited(r, 'art'); if (!(r.edited || []).includes('pts')) r.pts = defaultPts(value); r.unassigned = !value; }
  else if (f === 'pts') { r.pts = value === '' ? 0 : Number(value); markEdited(r, 'pts'); }
  saveScope(scope, rows); renderLater();
}
function rowAction(scope, id, act) {
  const rows = scopeRows(scope); const r = rows.find(x => x.id === id); if (!r) return;
  if (act === 'del') { if (r.added) rows.splice(rows.indexOf(r), 1); else r.deleted = true; }
  if (act === 'undel') delete r.deleted;
  saveScope(scope, rows); render();
}
function postAction(scope, pid, act) {
  const rows = scopeRows(scope);
  if (act === 'addRow') {
    const same = rows.filter(r => String(r.post) === String(pid));
    const base = same[same.length - 1] || {};
    const p = postsById().get(String(pid)) || {};
    const nid = uid();
    const r = { id: nid, post: String(pid), user: p.user || base.user, title: p.title || base.title, line: '(직접 추가)', lineNo: 99999, mid: 'add-' + nid, name: '', tok: '',
      date: '', art: '', pts: '', flags: [], accuser: E.accuser(p.user || base.user), group: 'add|' + nid, wd: false, src: '', added: true, edited: [],
      order: base.order || 0, seq: (base.seq || 0) + 0.001 * (same.length + 1), unassigned: true, excluded: false };
    rows.splice(rows.indexOf(base) + 1 || rows.length, 0, r);
  } else for (const r of rows) if (String(r.post) === String(pid)) r.excluded = act === 'excl';
  saveScope(scope, rows); render();
}

// ================================================================ 버튼
app.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.act; const tr = b.closest('tr[data-id]');
  switch (act) {
    case 'home': S.view = ''; setRole('', ''); break;
    case 'role': setRole(b.dataset.role, ''); break;
    case 'seat-arranger': window.location.assign(new URL('./seats/', import.meta.url).href); break;
    case 'pick': setRole('member', b.dataset.g); break;
    case 'settings': S.view = 'settings'; render(); break;
    case 'closeSettings': S.view = ''; render(); break;
    case 'organize': await doOrganize(); break;
    case 'del': case 'undel': rowAction(tr.dataset.scope, tr.dataset.id, act); break;
    case 'addRow': case 'excl': case 'incl': postAction(b.dataset.scope, b.dataset.pid, act); break;
    case 'toggleText': { const k = String(b.dataset.pid); S.openPosts.has(k) ? S.openPosts.delete(k) : S.openPosts.add(k); render(); break; }
    case 'memberDone': confirmBox('크로스체킹을 마칠까요?', '<b>' + H(S.group) + '</b>의 수정 내용이 통합 정리본에 반영되고, 이후에는 고칠 수 없습니다.', '완료', async () => {
      const k = 'cur/g_' + GKEY[S.group]; const d = gdoc(S.group);
      await save(() => store.merge(k, { rows: d.draft || d.rows, draft: null, done: true, doneAt: new Date().toISOString() }));
    }); break;
    case 'reopen': confirmBox(b.dataset.g + ' 다시 열기', '이 담당을 다시 고칠 수 있게 엽니다. 크로스체크 단계로 돌아가며, <b>완성 정리본·법정리스트 화면에서 법무부장이 직접 고친 내용은 지워집니다</b> (추가 기소는 남습니다).', '다시 열기', async () => {
      const g = b.dataset.g; await save(() => store.batch([['cur/g_' + GKEY[g], { done: false, draft: null }, true], ['cur/final', null], ['cfg/state', { phase: 'review' }, true]]));
    }); break;
    case 'toExtras': await save(async () => { if (!S.docs.final) await store.set('cur/final', { rows: finalRows(), createdAt: new Date().toISOString() }); await store.merge('cfg/state', { phase: 'extras' }); }); break;
    case 'backFinal': await save(() => store.merge('cfg/state', { phase: 'review' })); break;
    case 'toList': await save(() => store.merge('cfg/state', { phase: 'list' })); window.scrollTo(0, 0); break;
    case 'backExtras': await save(() => store.merge('cfg/state', { phase: 'extras' })); break;
    case 'xadd': addPasted(); break;
    case 'xdel': { const id = b.closest('tr').dataset.xid; const ex = clone(S.docs.extras); ex.items = ex.items.filter(x => x.id !== id); await save(() => store.set('cur/extras', ex)); break; }
    case 'fdel': { const ex = clone(S.docs.extras); const f = ex.files[+b.dataset.i]; ex.files.splice(+b.dataset.i, 1); ex.items = ex.items.filter(x => x.file !== f.name); await save(() => store.set('cur/extras', ex)); break; }
    case 'dlx': await downloadList(); break;
    case 'pdf': printList(); break;
    case 'newWeek': confirmBox('새로 시작할까요?', '이번 주 자료(붙여넣은 글, 크로스체크, 추가 기소)를 지우고 리스트 번호를 ' + ((+st().listNo || 0) + 1) + '(으)로 올립니다. <b>엑셀·PDF를 먼저 내려받았는지 확인하세요.</b>', '새로 시작', () => resetWeek(true)); break;
    case 'resetWeek': confirmBox('이번 주 정리를 지울까요?', '붙여넣은 글과 크로스체크·추가 기소 내용이 모두 지워집니다. 리스트 번호는 그대로입니다.', '지우기', () => resetWeek(false)); break;
    case 'saveSettings': saveSettings(); break;
    case 'dlRefs': { const blob = await IO.writeRefsFile(S.docs.refs); downloadBlob(blob, '기준자료.xlsx'); break; }
    case 'logout': await store.signOut(); setRole('', ''); break;
    case 'mok': { const f = S.modalOk; S.modal = null; S.modalOk = null; render(); if (f) await f(); break; }
    case 'mcancel': S.modal = null; S.modalOk = null; render(); break;
  }
});
app.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.f) { const tr = t.closest('tr[data-id]'); editField(tr.dataset.scope, tr.dataset.id, t.dataset.f, t.value); return; }
  if (t.dataset.xf) { editExtra(t.closest('tr').dataset.xid, t.dataset.xf, t.value); return; }
  if (t.dataset.file) { handleFiles(t.dataset.file, t.files); t.value = ''; return; }
  if (t.dataset.act === 'colors') { S.showColors = t.checked; render(); return; }
  if (t.id === 'sunday') { const v = t.value; const el = document.getElementById('weekInfo'); if (el && v) el.textContent = E.fmtMD(E.addDays(v, -6)) + '(월) ~ ' + E.fmtMD(v) + '(일) 에 올라온 글만 씁니다'; }
});
app.addEventListener('input', ev => {
  if (ev.target.id === 'paste') { const n = E.parsePasted(ev.target.value).length; const el = document.getElementById('pasteInfo'); if (el) el.textContent = n ? n + '개 글을 읽었습니다' : (ev.target.value.trim() ? '글을 읽지 못했습니다 — 즐겨찾기로 복사한 내용인지 확인하세요' : ''); }
});
app.addEventListener('submit', async ev => {
  if (ev.target.id !== 'login') return; ev.preventDefault();
  const f = new FormData(ev.target); const err = document.getElementById('loginErr');
  localStorage.setItem('cl-email', f.get('email'));
  try { err.textContent = '로그인 중…'; await store.signIn(f.get('email'), f.get('pw')); }
  catch (e) { err.textContent = store.errorText(e); }
});
for (const evn of ['dragover', 'dragenter']) app.addEventListener(evn, ev => { const d = ev.target.closest('[data-drop]'); if (d) { ev.preventDefault(); d.classList.add('over'); } });
app.addEventListener('dragleave', ev => { const d = ev.target.closest('[data-drop]'); if (d) d.classList.remove('over'); });
app.addEventListener('drop', ev => { const d = ev.target.closest('[data-drop]'); if (!d) return; ev.preventDefault(); d.classList.remove('over'); handleFiles(d.dataset.drop, ev.dataTransfer.files); });
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.classList && ev.target.classList.contains('cell') && ev.target.tagName === 'INPUT') ev.target.blur(); });

function confirmBox(title, html, okText, fn) {
  S.modal = '<h3>' + H(title) + '</h3><p>' + html + '</p><div class="foot-row"><button class="ghost" data-act="mcancel">취소</button><button class="primary" data-act="mok">' + H(okText) + '</button></div>';
  S.modalOk = fn; render();
}
function afterRender() {}

// ================================================================ 파일
async function handleFiles(kind, files) {
  if (!files || !files.length) return;
  if (kind === 'refs') {
    try {
      const { refs, missing } = await IO.readRefsFile(await files[0].arrayBuffer());
      if (missing.length) toast('없는 시트: ' + missing.join(', ') + ' (빈 채로 올립니다)', 5000);
      refs.updatedAt = new Date().toISOString();
      if (!refs.header && S.docs.refs && S.docs.refs.header) refs.header = S.docs.refs.header;
      await save(() => store.set('cfg/refs', refs), '기준자료를 올렸습니다 (학생 ' + refs.roster.length + '명)');
      if (!st().listNo) { const el = document.getElementById('firstNo'); await store.merge('cfg/state', { listNo: (el && +el.value) || 1, phase: st().phase || 'idle' }); }
    } catch (e) { toast('기준자료를 읽지 못했습니다: ' + (e.message || e), 6000); }
    return;
  }
  // 부서 파일
  const ex = clone(S.docs.extras || { items: [], files: [] }); ex.items = ex.items || []; ex.files = ex.files || [];
  const msgs = [];
  for (const f of files) {
    if (ex.files.some(x => x.name === f.name)) { msgs.push(f.name + ': 이미 넣음'); continue; }
    try {
      const r = await IO.importDeptFile(await f.arrayBuffer(), f.name, sundayOf());
      if (!r.sheets.length) { msgs.push(f.name + ': 머리글(Name / Violated Article)을 찾지 못함'); continue; }
      for (const it of r.items) ex.items.push({ ...it, id: uid() });
      ex.files.push({ name: f.name, count: r.items.length, yellowOnly: r.yellowOnly, sheets: r.sheets });
      msgs.push(f.name + ': ' + r.items.length + '건' + (r.yellowOnly ? ' (노란 줄만)' : ''));
    } catch (e) { msgs.push(f.name + ': 읽지 못함 (' + (e.message || e) + ')'); }
  }
  await save(() => store.set('cur/extras', ex));
  toast(msgs.join(' · '), 6000);
}
async function addPasted() {
  const text = document.getElementById('xpaste').value; const acc = document.getElementById('xacc').value.trim();
  const info = document.getElementById('xinfo');
  if (!text.trim()) { info.textContent = '붙여넣은 내용이 없습니다.'; return; }
  const isTable = text.split('\n').filter(l => l.includes('\t')).length >= 2;
  if (!acc && !isTable) { info.textContent = '기소자(예: 식품영양부, 선도부, 홍길동)를 적어 주세요.'; return; }
  const ex = clone(S.docs.extras || { items: [], files: [] }); ex.items = ex.items || []; ex.files = ex.files || [];
  const label = '직접 입력' + (acc ? '(' + acc + ')' : '');
  const r = IO.parseExtraPaste(ctx(), text, acc, sundayOf(), label);
  if (!r.items.length) { info.textContent = '기소 항목을 찾지 못했습니다. "10/23 외부음식 홍길동"처럼 날짜·항목·이름을 적어 주세요.'; return; }
  for (const it of r.items) ex.items.push({ ...it, id: uid() });
  document.getElementById('xpaste').value = ''; info.textContent = '';
  await save(() => store.set('cur/extras', ex), r.items.length + '건 추가했습니다' + (r.missing.length ? ' · 항목을 못 찾은 이름: ' + r.missing.join(', ') : ''));
}
function editExtra(id, f, v) {
  const ex = clone(S.docs.extras); const it = ex.items.find(x => x.id === id); if (!it) return;
  if (f === 'date') { const d = v.trim() ? E.toDate(v, sundayOf()) : ''; if (v.trim() && !d) { toast('날짜를 10/23 처럼 적어 주세요'); render(); return; } it.date = d; }
  else if (f === 'grade') it.grade = Number(v) || 0;
  else if (f === 'pts') it.pts = v.trim() === '' ? null : Number(v);
  else it[f] = v.trim();
  save(() => store.set('cur/extras', ex));
}
function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
async function downloadList() {
  const res = listResult();
  const blob = await IO.writeCourtList(res.list, { listNo: st().listNo, sunday: st().sunday, header: S.docs.refs.header });
  downloadBlob(blob, IO.courtListFileName(st().listNo, st().sunday));
}
function printList() {
  const was = S.showColors; S.showColors = false; render();
  const title = document.title; document.title = IO.courtListFileName(st().listNo, st().sunday).replace(/\.xlsx$/, '');
  document.body.classList.add('printing');
  setTimeout(() => { window.print(); document.body.classList.remove('printing'); document.title = title; S.showColors = was; render(); }, 100);
}
async function resetWeek(bump) {
  const ops = ['cur/posts', 'cur/g_m', 'cur/g_f', 'cur/g_i', 'cur/g_a', 'cur/final', 'cur/extras'].map(p => [p, null]);
  const s = { ...st(), phase: 'idle' }; delete s.sunday; delete s.monday;
  if (bump) { s.listNo = (+st().listNo || 0) + 1; s.lastDone = new Date().toISOString(); }
  ops.push(['cfg/state', s]);
  await save(() => store.batch(ops), bump ? 'Court List ' + s.listNo + ' 준비 완료' : '이번 주 정리를 지웠습니다');
  S.view = ''; render();
}
async function saveSettings() {
  const no = +document.getElementById('setNo').value || 1; const sun = document.getElementById('setSun').value;
  if (sun && E.weekday(sun) !== 0) { toast('기준 일요일은 일요일 날짜여야 합니다'); return; }
  const header = { labels: [...document.querySelectorAll('.hl')].map(x => x.value), names: [...document.querySelectorAll('.hn')].map(x => x.value), notice: document.getElementById('setNotice').value };
  const s = { ...st(), listNo: no }; if (sun) s.sunday = sun; else if (!st().phase || st().phase === 'idle') delete s.sunday;
  await save(async () => { await store.set('cfg/state', s); await store.merge('cfg/refs', { header }); }, '저장했습니다');
}

boot();
