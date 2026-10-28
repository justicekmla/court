// 법정리스트 정리 엔진 — 엑셀 매크로(CourtList.bas)와 같은 규칙을 그대로 옮긴 것.
// 날짜는 'YYYY-MM-DD' 문자열로 다룬다. 문자열 위치는 매크로와 같게 1부터 센다.

// ---------------------------------------------------------------- 날짜
export function iso(y, m, d) {
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
export function parts(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
function dnum(s) { const { y, m, d } = parts(s); return Date.UTC(y, m - 1, d) / 86400000; }
function fromNum(n) { const t = new Date(n * 86400000); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
export function addDays(s, k) { return fromNum(dnum(s) + k); }
export function diffDays(a, b) { return dnum(a) - dnum(b); }
export function weekday(s) { return new Date(dnum(s) * 86400000).getUTCDay(); } // 0=일
export function fmtDate(s) { if (!s) return ''; const { y, m, d } = parts(s); return y + '.' + m + '.' + d; }
export function fmtMD(s) { if (!s) return ''; const { m, d } = parts(s); return m + '/' + d; }
function validYMD(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1;
}
export function lastSunday(todayIso) { return addDays(todayIso, -weekday(todayIso)); }

// ---------------------------------------------------------------- 글자
const isDigit = ch => !!ch && ch >= '0' && ch <= '9';
const isHangul = ch => { if (!ch) return false; const c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3; };
const isAsciiLetter = ch => !!ch && ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z'));
const isWordCh = ch => isHangul(ch) || isAsciiLetter(ch) || isDigit(ch);
const isSpace = ch => ch === ' ' || ch === '\t';
const at = (s, i) => (i >= 1 && i <= s.length) ? s[i - 1] : '';       // 1-based
const mid = (s, i, n) => n === undefined ? s.substring(i - 1) : s.substring(i - 1, i - 1 + n);
const inStr = (start, s, sub) => { const k = s.indexOf(sub, start - 1); return k < 0 ? 0 : k + 1; };
const vbTrim = s => String(s).replace(/^ +| +$/g, '');

export function words(s) {
  const out = []; const n = s.length; let i = 1;
  while (i <= n) {
    if (isWordCh(at(s, i))) { const st = i; while (i <= n && isWordCh(at(s, i))) i++; out.push([mid(s, st, i - st), st]); }
    else i++;
  }
  return out;
}
const allHangul = s => s.length > 0 && [...s].every(isHangul);
export const isPureHangul24 = w => w.length >= 2 && w.length <= 4 && allHangul(w);
export function isNameShape(w) {
  const n = w.length; if (n < 2) return false;
  const last = w[n - 1]; let core = w;
  if (/[A-Ca-c]/.test(last)) core = w.substring(0, n - 1);
  else if (n >= 4 && isDigit(last) && isDigit(w[n - 2])) { if (w[n - 2] === '2' || w[n - 2] === '3') core = w.substring(0, n - 2); }
  return isPureHangul24(core);
}
export function baseName(n) { while (n.length > 0 && (isAsciiLetter(n[n.length - 1]) || isDigit(n[n.length - 1]))) n = n.substring(0, n.length - 1); return n; }
export function normSuffix(t) { const l = t[t.length - 1]; return (l && /[a-c]/.test(l)) ? t.substring(0, t.length - 1) + l.toUpperCase() : t; }
export function normalize(s) {
  return String(s).replace(/\r/g, '').replace(/⏎/g, '\n').replace(/\t/g, ' ').replace(/[–—―]/g, '-')
    .replace(/×/g, 'x').replace(/ /g, ' ').replace(/（/g, '(').replace(/）/g, ')').replace(/，/g, ',');
}
function digitsBefore(s, p, allowSpace = true) {
  let i = p - 1;
  if (allowSpace) while (i >= 1 && isSpace(at(s, i))) i--;
  const e = i;
  while (i >= 1 && isDigit(at(s, i))) i--;
  const st = i + 1;
  return { d: e >= st ? mid(s, st, e - st + 1) : '', st };
}
function digitsAfter(s, p, allowSpace = true) {
  const n = s.length; let i = p;
  if (allowSpace) while (i <= n && isSpace(at(s, i))) i++;
  const st = i;
  while (i <= n && isDigit(at(s, i))) i++;
  const e = i - 1;
  return { d: e >= st ? mid(s, st, e - st + 1) : '', e };
}
export function numBefore(s, word) {
  let p = inStr(1, s, word);
  while (p > 0) { const { d } = digitsBefore(s, p); if (d) return parseInt(d.slice(-6), 10); p = inStr(p + 1, s, word); }
  return 0;
}
function repCount(s) {
  let p = inStr(1, s, 'x');
  while (p > 0) { const { d } = digitsAfter(s, p + 1); if (d) return parseInt(d, 10); p = inStr(p + 1, s, 'x'); }
  return 1;
}
const schoolYear = d => { const { y, m } = parts(d); return y - (m < 3 ? 1 : 0); };
export const gradeToGisu = (g, d) => schoolYear(d) - 1994 - g;
export const gisuToGrade = (k, d) => schoolYear(d) - 1994 - k;

function findDates(s) {
  const raw = []; const n = s.length; let p;
  p = inStr(1, s, '월');
  while (p > 0) {
    let { d: d1, st } = digitsBefore(s, p);
    if (d1) {
      if (d1.length > 2) { st = st + d1.length - 2; d1 = d1.slice(-2); }
      const { d: d2, e } = digitsAfter(s, p + 1);
      if (d2 && d2.length <= 2) {
        let q = e + 1; while (q <= n && isSpace(at(s, q))) q++;
        if (at(s, q) === '일') raw.push([st, q - st + 1, +d1, +d2]);
      }
    }
    p = inStr(p + 1, s, '월');
  }
  for (const [sep, sp] of [['/', true], ['.', false]]) {
    p = inStr(1, s, sep);
    while (p > 0) {
      const { d: d1, st } = digitsBefore(s, p, sp);
      if (d1.length >= 1 && d1.length <= 2) {
        const prev = st > 1 ? at(s, st - 1) : '';
        if (!(isDigit(prev) || prev === '.' || prev === '/')) {
          const { d: d2, e } = digitsAfter(s, p + 1, sp);
          if (d2.length >= 1 && d2.length <= 2) {
            const next = e < n ? at(s, e + 1) : '';
            if (!isDigit(next)) raw.push([st, e - st + 1, +d1, +d2]);
          }
        }
      }
      p = inStr(p + 1, s, sep);
    }
  }
  const out = []; const used = raw.map(() => false); let lastEnd = 0;
  for (let k = 0; k < raw.length; k++) {
    let best = -1;
    for (let j = 0; j < raw.length; j++) if (!used[j] && (best < 0 || raw[j][0] < raw[best][0])) best = j;
    used[best] = true;
    if (raw[best][0] > lastEnd) { out.push(raw[best]); lastEnd = raw[best][0] + raw[best][1] - 1; }
  }
  return out;
}
function removeSpans(s, spans) { let a = [...s]; for (const sp of spans) for (let i = 0; i < sp[1]; i++) a[sp[0] - 1 + i] = ' '; return a.join(''); }
function stripParens(s) {
  let a = inStr(1, s, '(');
  while (a > 0) { const b = inStr(a + 1, s, ')'); if (b === 0) break; s = s.substring(0, a - 1) + ' ' + mid(s, b + 1); a = inStr(a + 1, s, '('); }
  return s;
}
export function isSummaryTitle(t) {
  let p = inStr(1, t, '월');
  while (p > 0) {
    if (digitsBefore(t, p).d) {
      const { d, e } = digitsAfter(t, p + 1);
      if (d) { let q = e + 1; while (q <= t.length && isSpace(at(t, q))) q++; if (at(t, q) === '주') return true; }
    }
    p = inStr(p + 1, t, '월');
  }
  return false;
}
const titleRoot = t => vbTrim(t.replace(/\(수정\)/g, '').replace(/\(수정/g, '').replace(/수정\)/g, '').replace(/수정/g, ''));
function diffOne(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) d++; if (d > 1) return false; } return d === 1; }
export function cellText(v) { if (v === null || v === undefined) return ''; let s = vbTrim(String(v)); if (s[0] === '§') s = s.substring(1); return s; }

// ---------------------------------------------------------------- 기준 자료
// refs = {roster:[{name,grade}], articles:[{art,pts,dflt,flag}], dict:[{kw,art,fixed,poster}], nameFix:[{from,to}], reps:[..], nonNames:[..]}
export function makeCtx(refs, sunday) {
  const C = { baseDate: sunday, rosterFull: new Map(), rosterBase: new Map(), artPoints: new Map(), artDefault: new Map(), artFlag: new Map(),
    dict: [], nameFix: new Map(), reps: new Set(), nonNames: new Set(), articleList: [] };
  for (const r of refs.roster || []) {
    let n = cellText(r.name); if (!n) continue; n = normSuffix(n);
    const g = Number(r.grade); C.rosterFull.set(n, Number.isFinite(g) && String(r.grade).trim() !== '' ? Math.trunc(g) : 0);
    const b = baseName(n); if (!C.rosterBase.has(b)) C.rosterBase.set(b, []); C.rosterBase.get(b).push(n);
  }
  for (const a of refs.articles || []) {
    const n = cellText(a.art); if (!n) continue;
    let v = a.pts; if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) v = Number(v);
    if (v === null || v === undefined || v === '') v = undefined;
    C.artPoints.set(n, v); C.artDefault.set(n, a.dflt); C.artFlag.set(n, cellText(a.flag).toUpperCase() !== 'N');
    if (!C.articleList.includes(n)) C.articleList.push(n);
  }
  for (const d of refs.dict || []) {
    if (!cellText(d.kw)) continue;
    const f = cellText(d.fixed);
    C.dict.push({ kw: cellText(d.kw), art: cellText(d.art), fixed: f === '' ? undefined : Math.trunc(Number(f)), poster: cellText(d.poster) });
  }
  for (const f of refs.nameFix || []) if (cellText(f.from)) C.nameFix.set(cellText(f.from), cellText(f.to));
  for (const r of refs.reps || []) if (cellText(r)) C.reps.add(baseName(cellText(r)));
  for (const w of refs.nonNames || []) if (cellText(w)) C.nonNames.add(cellText(w));
  return C;
}
const gradeOf = (C, n) => C.rosterFull.get(n);
export function isKnown(C, tok) { return C.rosterFull.has(normSuffix(tok)) || C.rosterBase.has(tok) || C.rosterBase.has(baseName(tok)); }
export function lookup(C, tok, hint) {
  let t = normSuffix(tok);
  if (!C.rosterFull.has(t) && /\d\d$/.test(tok) && C.rosterBase.has(baseName(tok))) {
    hint = gisuToGrade(parseInt(tok.slice(-2), 10), C.baseDate); tok = baseName(tok); t = tok;
  }
  if (C.rosterFull.has(t)) return [t];
  if (C.rosterBase.has(tok)) {
    const list = C.rosterBase.get(tok);
    if (list.length > 1 && hint > 0) { const c = list.filter(x => gradeOf(C, x) === hint); if (c.length === 1) return c; }
    return list.slice();
  }
  return [];
}
function suggest(C, tok) { const c = []; for (const [b, list] of C.rosterBase) if (diffOne(b, tok)) c.push(...list); return c; }
export function displayName(C, n) {
  const b = baseName(n);
  if (n === b && C.rosterBase.has(b) && C.rosterBase.get(b).length > 1) return n + gradeToGisu(gradeOf(C, n), C.baseDate);
  return n;
}
const isNonName = (C, w) => C.nonNames.has(w) || w.includes('취하') || w.includes('기소');
export function findArticle(C, s, poster) {
  const low = s.toLowerCase();
  for (const d of C.dict) {
    if (low.includes(d.kw.toLowerCase())) {
      const cond = d.poster;
      if (cond === '' || (',' + cond.replace(/ /g, '') + ',').includes(',' + poster + ',')) return { art: d.art, fixed: d.fixed, kw: d.kw };
    }
  }
  return { art: '', fixed: undefined, kw: '' };
}
export function resolveArticle(C, raw, poster) {
  raw = vbTrim(raw);
  for (const k of C.artPoints.keys()) if (k.toLowerCase() === raw.toLowerCase()) return k;
  const a = findArticle(C, raw, poster).art;
  return a || raw;
}
export function accuser(poster) {
  poster = vbTrim(poster || '');
  if (poster.endsWith('부')) return poster;
  if (poster.length === 3) return poster + 'tr';
  return poster;
}
function gradeHint(C, s) {
  let p = inStr(1, s, '학년');
  while (p > 0) { const { d } = digitsBefore(s, p); if (d) { const g = +d.slice(-1); if (g >= 1 && g <= 3) return g; } p = inStr(p + 1, s, '학년'); }
  p = inStr(1, s, '기');
  while (p > 0) {
    const { d } = digitsBefore(s, p);
    if (d.length >= 2) { let g = +d.slice(-2); if (g >= 20 && g <= 39) { g = gisuToGrade(g, C.baseDate); if (g >= 1 && g <= 3) return g; } }
    p = inStr(p + 1, s, '기');
  }
  return 0;
}

// ---------------------------------------------------------------- 날짜 판정
function makeDate(postDate, mo, dy) {
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return '';
  let { y, m } = parts(postDate); if (mo > m + 1) y -= 1;
  return validYMD(y, mo, dy) ? iso(y, mo, dy) : '';
}
function checkDate(postDate, d) {
  if (!d) return { d: '', msg: '날짜 없음' };
  const diff = diffDays(postDate, d);
  if (diff >= 0 && diff <= 31) return { d, msg: '' };
  const pm = parts(postDate).m, dd = parts(d);
  for (let mo = pm; mo >= pm - 1; mo--) {
    if (mo < 1) continue;
    const c = makeDate(postDate, mo, dd.d);
    if (c) { const k = diffDays(postDate, c); if (k >= 0 && k <= 31) return { d: c, msg: '날짜 오타 의심(원문 ' + dd.m + '/' + dd.d + ')' }; }
  }
  return { d, msg: '날짜 오타 의심' };
}
export function toDate(v, refDate) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') { if (v > 30000 && v < 80000) return fromNum(Math.floor(v) - 25569); return ''; }
  if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const s = cellText(v); if (!s) return '';
  const nums = (s.match(/\d+/g) || []).map(Number);
  if (nums.length >= 3 && nums[0] > 1900) return validYMD(nums[0], nums[1], nums[2]) ? iso(nums[0], nums[1], nums[2]) : '';
  if (nums.length >= 2) { const y = parts(refDate).y; return validYMD(y, nums[0], nums[1]) ? iso(y, nums[0], nums[1]) : ''; }
  return '';
}

// ---------------------------------------------------------------- 글 하나 읽기
function grabParens(C, s, per, poster) {
  let out = '', pos = 1, a = inStr(1, s, '(');
  while (a > 0) {
    const b = inStr(a + 1, s, ')'); if (b === 0) break;
    let i = a - 1; while (i >= 1 && isSpace(at(s, i))) i--;
    const wEnd = i; while (i >= 1 && isWordCh(at(s, i))) i--;
    const wStart = i + 1;
    if (wEnd >= wStart && wStart >= pos) {
      const w = mid(s, wStart, wEnd - wStart + 1), inner = mid(s, a + 1, b - a - 1);
      if (isNameShape(w) && !isNonName(C, w) && findArticle(C, w, poster).art === '' && (isKnown(C, w) || isPureHangul24(w))) {
        if (!per.has(w)) per.set(w, []); per.get(w).push(inner);
        out += mid(s, pos, wEnd - pos + 1); pos = b + 1;
      }
    }
    a = inStr(b + 1, s, '(');
  }
  return out + mid(s, pos);
}
function innerDates(s) {
  const c = []; let p = inStr(1, s, '.');
  while (p > 0) {
    const { d: d1 } = digitsBefore(s, p, false), { d: d2, e } = digitsAfter(s, p + 1, false);
    if (d1.length >= 1 && d1.length <= 2 && d2.length >= 1 && d2.length <= 2) {
      c.push([+d1, +d2]);
      if (at(s, e + 1) === '/') { const { d: d3 } = digitsAfter(s, e + 2, false); if (d3.length >= 1 && d3.length <= 2) c.push([+d1, +d3]); }
    }
    p = inStr(p + 1, s, '.');
  }
  return c;
}
// post = {id, date, user, title, text}
export function parsePost(C, p) {
  const poster = p.user;
  let postHint = gradeHint(C, p.title);
  const headerDates = new Map();
  let curArt = '', curFixed, curStated, curMo = 0, curDy = 0, curWd = false;
  const postWd = p.title.includes('취하');
  const pending = [], local = [];
  const lines = normalize(p.text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = vbTrim(lines[i]); if (!ln) continue;
    const g = gradeHint(C, ln); if (g > 0) postHint = g;
    const per = new Map();
    const line2 = grabParens(C, ln, per, poster);
    const { art, fixed, kw } = findArticle(C, line2, poster);
    let stated; if (art) { const k = numBefore(line2, '점'); if (k > 0) stated = k; }
    const rep = repCount(line2);
    const noParen = stripParens(line2);
    const ds = findDates(noParen);
    let clean = removeSpans(noParen, ds);
    if (kw) clean = clean.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
    const cands = []; let known = 0;
    for (const [w] of words(clean)) if (isNameShape(w)) { cands.push(w); if (isKnown(C, w)) known++; }
    const isList = known > 0 && known >= 0.5 * cands.length;
    const names = cands.filter(t => isKnown(C, t) || (isList && isPureHangul24(t) && !isNonName(C, t)));
    const lineWd = ln.includes('취하');
    if (art) {
      curArt = art; curFixed = fixed; curStated = stated; curWd = lineWd;
      for (const x of pending) { x.art = art; x.fixed = fixed; x.stated = stated; x.rep = rep; if (lineWd) x.wd = true; }
      pending.length = 0;
    } else if (lineWd && names.length === 0) curWd = true;
    let lineMo = 0, lineDy = 0;
    if (ds.length > 0) {
      lineMo = ds[0][2]; lineDy = ds[0][3];
      if (names.length === 0) { curMo = lineMo; curDy = lineDy; headerDates.set(lineMo + '/' + lineDy, [lineMo, lineDy]); }
    }
    for (const t of names) {
      let hint = postHint, mult = 1, ptsOv;
      let dts = [lineMo > 0 ? [lineMo, lineDy] : [curMo, curDy]];
      for (const inner of per.get(t) || []) {
        const g2 = gradeHint(C, inner); if (g2 > 0) hint = g2;
        if (!inner.includes('총')) { const k = numBefore(inner, '회'); if (k > 0) mult = k; }
        const k2 = numBefore(inner, '점'); if (k2 > 0) ptsOv = k2;
        const found = innerDates(inner); if (found.length > 0) dts = found;
      }
      for (const dd of dts) {
        const x = { tok: t, hint, art: curArt, fixed: curFixed, stated: curStated, rep, mult, ptsOv, mo: dd[0], dy: dd[1], src: '',
          post: String(p.id), postDate: p.date, user: poster, line: ln, group: p.id + '|' + i, lineNo: i + 1, title: p.title,
          wd: postWd || curWd || lineWd };
        if (curArt === '') pending.push(x);
        local.push(x);
      }
    }
  }
  if (headerDates.size === 1) { const hd = [...headerDates.values()][0]; for (const x of local) if (x.mo === 0) { x.mo = hd[0]; x.dy = hd[1]; } }
  return local; // art === '' → 기소 항목을 찾지 못한 이름
}

// ---------------------------------------------------------------- 글 고르기 (주 / 수정 / 최종)
function namesOf(C, text) { const s = new Set(); for (const [w] of words(text)) if (isNameShape(w) && isKnown(C, w)) s.add(w); return s; }
// posts: [{id,date,...}] 반환: [{...post, inWeek, mark:'포함'|'제외', markNote}]
export function markPosts(C, posts, monday, sunday) {
  const out = posts.map(p => ({ ...p, inWeek: !!p.date && p.date >= monday && p.date <= sunday && cellText(p.text) !== '' }));
  const auto = new Set();
  for (const p of out) if (p.inWeek && !p.mark) { p.mark = '포함'; p.markNote = ''; auto.add(p); }
  const num = p => parseFloat(p.id) || 0;
  for (const r of out) {
    if (!(r.inWeek && r.title.includes('수정'))) continue;
    const root = titleRoot(r.title);
    for (const q of out) if (q !== r && auto.has(q) && num(q) < num(r) && titleRoot(q.title) === root) { q.mark = '제외'; q.markNote = r.id + '번 수정본으로 대체'; }
  }
  for (const r of out) {
    if (!(r.inWeek && r.title.includes('최종'))) continue;
    const fin = namesOf(C, r.text);
    for (const q of out) {
      if (q === r || !auto.has(q) || !(num(q) < num(r)) || q.mark === '제외' || isSummaryTitle(q.title)) continue;
      const nq = namesOf(C, q.text); let hit = 0; for (const n of nq) if (fin.has(n)) hit++;
      if (nq.size > 0 && hit >= 0.5 * nq.size) { q.mark = '제외'; q.markNote = '「' + r.title + '」(' + r.id + ')에 포함된 내용'; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- 줄 만들기 (이름·날짜·점수 판정)
// extras: [{name, grade, date, acc, art, pts, src, file}]
export function extraMentions(C, extras) {
  return extras.map(e => ({ tok: e.name, hint: e.grade || 0, art: resolveArticle(C, e.art, e.acc), fixed: undefined, stated: e.pts === '' || e.pts == null ? undefined : e.pts,
    rep: 1, mult: 1, ptsOv: undefined, mo: 0, dy: 0, src: 'file', fullDate: e.date || '', post: e.src, postDate: C.baseDate, user: e.acc,
    line: e.src + ': ' + e.name + ' / ' + e.art, group: 'file|' + e.file, lineNo: 0, title: e.file, wd: false }));
}
function filterByLineGrade(C, sug, line) {
  const gc = new Map();
  for (const [w] of words(line)) if (isNameShape(w)) { const c = lookup(C, w, 0); if (c.length === 1) { const g = gradeOf(C, c[0]); gc.set(g, (gc.get(g) || 0) + 1); } }
  let gBest = 0, gN = 0; for (const [g, n] of gc) if (n > gN) { gN = n; gBest = g; }
  if (gBest === 0) return sug;
  const out = sug.filter(k => gradeOf(C, k) === gBest);
  return out.length === 1 ? out : sug;
}
// 말뭉치(mention)를 리스트 줄로 바꾼다. 반환 rows: 각 줄 {name,tok,date,art,pts,flags[[kind,msg]],accuser,post,line,group,mid,wd,src,user,lineNo,title}
export function mentionsToRows(C, mentions, midStart = 0) {
  const rows = []; let mid_ = midStart;
  for (const m of mentions) {
    mid_++;
    const flags = [];
    let tok = m.tok; if (C.nameFix.has(tok)) tok = C.nameFix.get(tok);
    const cands = lookup(C, tok, m.hint);
    let nm = '', ambig = null;
    if (cands.length === 1) nm = cands[0];
    else if (cands.length > 1) ambig = cands;
    else {
      let sug = suggest(C, tok);
      if (sug.length > 1) sug = filterByLineGrade(C, sug, m.line);
      if (sug.length === 1) { nm = sug[0]; flags.push(['name', "명단에 없는 이름 '" + tok + "' → '" + sug[0] + "'로 추정"]); }
      else { nm = tok; flags.push(['name', "명단에 없는 이름 '" + tok + "'" + (sug.length ? ' (후보: ' + sug.join(', ') + ')' : '')]); }
    }
    let d;
    if (m.src === 'file') { d = m.fullDate || ''; if (!d) flags.push(['date', '날짜 없음']); }
    else { d = m.mo > 0 ? makeDate(m.postDate, m.mo, m.dy) : ''; const r = checkDate(m.postDate, d); d = r.d; if (r.msg) flags.push(['date', r.msg]); }
    const art = m.art;
    let pts = 0, mult = m.mult;
    if (art) {
      const base = C.artPoints.get(art);
      let stated = m.stated; if (m.ptsOv !== undefined) stated = m.ptsOv;
      const multi = typeof base === 'string';
      if (base === undefined) { pts = stated === undefined ? 0 : stated; flags.push(['pts', "벌점표에 없는 조항 '" + art + "'" + (stated === undefined ? '' : ' (원본 ' + stated + '점)')]); }
      else if (m.fixed !== undefined) pts = stated === undefined ? m.fixed : stated;
      else if (multi) {
        const opts = base.replace(/ /g, '').split(',');
        pts = stated === undefined ? 0 : stated;
        if (pts === 0) {
          const df = C.artDefault.get(art);
          pts = cellText(df) !== '' ? Math.trunc(Number(df)) : Math.trunc(Number(opts[0]));
          if (C.artFlag.get(art)) flags.push(['pts', '점수 미기재 → 과거 리스트 기준 ' + pts + '점 적용 (가능: ' + base + ')']);
        }
      } else {
        pts = Math.trunc(Number(base));
        if (stated !== undefined && stated !== pts && pts !== 0) {
          if (stated % pts === 0 && m.src !== 'file') mult = mult * Math.floor(stated / pts);
          else pts = stated;
        }
      }
    }
    const n = art ? m.rep * mult : 1;
    for (let k = 0; k < n; k++) {
      rows.push({ name: nm, ambig, tok, date: d, art, pts, flags: flags.map(f => f.slice()), accuser: accuser(m.user), post: m.post, line: m.line,
        group: m.group, mid: mid_, wd: !!m.wd, src: m.src, user: m.user, lineNo: m.lineNo, title: m.title || '', unassigned: !art });
    }
  }
  // 동명이인: 같은 줄 이름들의 학년으로 추정
  for (const row of rows) {
    if (!row.ambig) continue;
    const gc = new Map();
    for (const r2 of rows) if (r2.group === row.group && !r2.ambig && C.rosterFull.has(r2.name)) { const g = gradeOf(C, r2.name); gc.set(g, (gc.get(g) || 0) + 1); }
    let gBest = 0, gN = 0; for (const [g, n] of gc) if (n > gN) { gN = n; gBest = g; }
    const pick = gBest > 0 ? row.ambig.filter(c => gradeOf(C, c) === gBest) : [];
    if (pick.length === 1) { row.name = pick[0]; row.flags.push(['ambig', "동명이인 '" + row.tok + "' → 주변 이름 기수(" + gradeToGisu(gBest, C.baseDate) + '기)로 추정']); }
    else { row.name = row.ambig[0]; row.flags.push(['ambig', "동명이인 '" + row.tok + "' 판별 불가 (후보: " + row.ambig.join(', ') + ')']); }
  }
  for (const r of rows) delete r.ambig;
  return { rows, nextMid: mid_ };
}

// ---------------------------------------------------------------- 정리 전체
// 글 목록 → (주 선택) → 줄. 반환 {posts(표시용), rows}
// rows 순서: 일반 글(글 번호 순) → 정리 글(n월 n주). order 값으로 나중에 부서 파일 줄을 사이에 끼운다.
export function extractWeek(C, posts, monday, sunday) {
  const marked = markPosts(C, posts, monday, sunday).filter(p => p.inWeek);
  const normal = [], summ = [];
  for (const p of marked) (isSummaryTitle(p.title) ? summ : normal).push(p);
  let all = [], next = 0;
  for (const [list, order] of [[normal, 0], [summ, 2]]) {
    for (const p of list) {
      const ms = parsePost(C, p);
      const { rows, nextMid } = mentionsToRows(C, ms, next); next = nextMid;
      for (const r of rows) { r.order = order; r.excluded = p.mark === '제외'; }
      if (ms.length === 0) all.push({ ...emptyRow(p), order, excluded: p.mark === '제외' });
      all = all.concat(rows);
    }
  }
  all.forEach((r, i) => { r.seq = i; r.id = 'r' + i; });
  return { posts: marked.map(p => ({ id: String(p.id), date: p.date, time: p.time || '', user: p.user, title: p.title, text: p.text, mark: p.mark, markNote: p.markNote || '', summary: isSummaryTitle(p.title) })), rows: all, nextMid: next };
}
function emptyRow(p) { return { placeholder: true, post: String(p.id), user: p.user, title: p.title, line: '', lineNo: 0, mid: -1, name: '', tok: '', date: '', art: '', pts: 0, flags: [], accuser: accuser(p.user), group: '', wd: false, src: '', unassigned: false }; }

// 사람이 고친 줄을 다시 판정한다 (이름 → 명단, 날짜 없음 표시)
export function refreshEdited(C, r) {
  if (!r.edited) return r;
  const e = r.edited;
  if (e.includes('name')) {
    r.flags = r.flags.filter(f => f[0] !== 'name' && f[0] !== 'ambig');
    const t = vbTrim(r.name); const c = t ? lookup(C, C.nameFix.get(t) || t, 0) : [];
    if (c.length === 1) r.name = c[0];
    else if (c.length > 1) { r.name = c[0]; r.flags.push(['ambig', "동명이인 '" + t + "' — 기수를 붙여 주세요 (후보: " + c.map(x => displayName(C, x)).join(', ') + ')']); }
    else if (t) r.flags.push(['name', "명단에 없는 이름 '" + t + "'"]);
  }
  if (e.includes('date')) { r.flags = r.flags.filter(f => f[0] !== 'date'); if (!r.date) r.flags.push(['date', '날짜 없음']); }
  if (e.includes('pts') || e.includes('art')) r.flags = r.flags.filter(f => f[0] !== 'pts');
  if (e.includes('art') && r.art && !C.artPoints.has(r.art)) r.flags.push(['pts', "벌점표에 없는 조항 '" + r.art + "'"]);
  if (r.art) r.unassigned = false;
  return r;
}
export function sourceLabel(r) { return r.src === 'file' ? String(r.post) : '글 ' + r.post + '(' + r.user + ')'; }

// rows(모든 줄, 사람이 고친 것 포함) → 중복·취하 판정과 최종 리스트
// 각 줄의 status: ok | dup | withdrawn | wdreq | excluded | deleted | unassigned | placeholder
export function compute(C, rowsIn) {
  const rows = rowsIn.map(r => refreshEdited(C, { ...r, flags: (r.flags || []).map(f => f.slice()), edited: r.edited ? r.edited.slice() : undefined }));
  rows.forEach((r, i) => { r._i = (typeof r.seq === 'number') ? r.seq : i; });
  const ordered = rows.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a._i - b._i || 0);
  for (const r of ordered) {
    r.status = r.placeholder ? 'placeholder' : r.deleted ? 'deleted' : r.excluded ? 'excluded' : (!r.art ? 'unassigned' : 'ok'); r.note = '';
  }
  const live = ordered.filter(r => r.status === 'ok');
  // 중복
  const groups = new Map();
  for (const r of live) {
    if (r.wd) continue;
    const key = r.name + '|' + fmtDate(r.date) + '|' + r.art;
    if (!groups.has(key)) groups.set(key, new Map());
    const byMid = groups.get(key); const mk = String(r.mid);
    if (!byMid.has(mk)) byMid.set(mk, []); byMid.get(mk).push(r);
  }
  const finalRows = [];
  for (const byMid of groups.values()) {
    let best = null, bestN = 0;
    for (const [k, v] of byMid) if (v.length > bestN) { bestN = v.length; best = k; }
    finalRows.push(...byMid.get(best));
    const note = '중복 - ' + sourceLabel(byMid.get(best)[0]) + ' 기소로 반영됨';
    for (const [k, v] of byMid) if (k !== best) for (const r of v) { r.status = 'dup'; r.note = note; }
  }
  // 취하
  const wdLog = []; const seen = new Set();
  for (const w of live) {
    if (!w.wd) continue;
    w.status = 'wdreq';
    if (seen.has(w.mid)) continue; seen.add(w.mid);
    const dtxt = fmtDate(w.date); let res, kind;
    if (!dtxt || !w.art) { res = '확인 필요: 날짜 또는 기소 항목이 없어 지우지 않음'; kind = 'check'; }
    else {
      let n = 0, same = 0;
      for (const r of finalRows) {
        if (r.status === 'ok' && r.src !== 'file' && r.name === w.name && fmtDate(r.date) === dtxt) {
          if (r.art === w.art) { r.status = 'withdrawn'; r.note = '취하됨 - 글 ' + w.post + '(' + w.user + ')'; r.wdBy = w.post; n++; } else same++;
        }
      }
      if (n > 0) { res = '리스트에서 ' + n + '건 삭제'; kind = 'done'; }
      else if (same > 0) { res = '확인 필요: 같은 날 다른 항목만 있어 지우지 않음 (항목명 확인)'; kind = 'check'; }
      else { res = '이번 리스트에 없음 - 지난 리스트에서 직접 삭제 필요'; kind = 'past'; }
    }
    w.note = res;
    wdLog.push({ post: w.post, user: w.user, title: w.title, name: w.name, date: dtxt, art: w.art, res, kind, line: w.line });
  }
  for (const r of ordered) if (r.status === 'unassigned' && r.wd) {
    r.note = '취하 글: 날짜 또는 기소 항목이 없어 지우지 않음';
    wdLog.push({ post: r.post, user: r.user, title: r.title, name: r.tok, date: '', art: '', res: '확인 필요: 날짜 또는 기소 항목이 없어 지우지 않음', kind: 'check', line: r.line });
  }
  const kept = finalRows.filter(r => r.status === 'ok');
  for (const r of kept) {
    if (C.rosterFull.has(r.name)) { r.grade = gradeOf(C, r.name); r.disp = displayName(C, r.name); } else { r.grade = 0; r.disp = r.name; }
    r.repBonus = C.reps.has(baseName(r.name));
    r.finalPts = Number(r.pts) + (r.repBonus ? 1 : 0);
  }
  return { rows, list: sortRows(kept), wdLog };
}
export function sortRows(rows) {
  const cnt = new Map(); for (const r of rows) cnt.set(r.disp, (cnt.get(r.disp) || 0) + 1);
  const arr = rows.map((r, i) => ({ r, cnt: cnt.get(r.disp), seq: i }));
  const dn = s => s ? dnum(s) : 99999;
  arr.sort((a, b) => {
    if (a.cnt !== b.cnt) return a.cnt > b.cnt ? -1 : 1;
    if (a.r.grade !== b.r.grade) return a.r.grade > b.r.grade ? -1 : 1;
    if (a.r.disp !== b.r.disp) return a.r.disp < b.r.disp ? -1 : 1;   // 매크로의 이진 비교와 같음
    const da = dn(a.r.date), db = dn(b.r.date); if (da !== db) return da < db ? -1 : 1;
    return a.seq - b.seq;
  });
  return arr.map(x => x.r);
}

// 기소자 묶음 (부원 화면)
export const GROUPS = ['남사감', '여사감', '인트라넷', '아침기'];
export function groupOf(user) {
  const u = vbTrim(user || '');
  if (u === '김대기') return '남사감';
  if (u === '박주영') return '여사감';
  if (u === '곽노재' || u === '김명순') return '아침기';
  return '인트라넷';
}

// 인트라넷 즐겨찾기로 복사한 글(탭으로 나뉜 줄) 읽기
export function parsePasted(text) {
  const out = []; const seen = new Set();
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const c = raw.split('\t');
    if (c.length < 8) continue;
    const id = cellText(c[1]); const date = cellText(c[2]);
    if (!/^\d+$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, date, time: cellText(c[3]), user: cellText(c[4]), title: cellText(c[5]), text: cellText(c.slice(7).join(' ')) });
  }
  return out;
}
