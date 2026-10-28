// 부서 파일 읽기, 추가 기소 붙여넣기, 기준자료 파일, Court List 엑셀 만들기
import { readWorkbook, writeWorkbook, cell, inMerge, serialToIso } from './xlsx.js';
import * as E from './engine.js';

// ---------------------------------------------------------------- 부서 파일 (선도부·법무부 좌석표 등)
function headerKey(v) {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\n/g, ' ').trim().toLowerCase();
  if (['name', '이름', '학생 이름', '학생이름', '성명'].includes(t)) return 'name';
  if (['date', '날짜', '일자'].includes(t)) return 'date';
  if (['accused by', '기소자', '기소 부서'].includes(t)) return 'acc';
  if (['violated article', '기소 항목', '기소항목', '위반 항목', '위반항목'].includes(t)) return 'art';
  if (['points', '벌점', '점수'].includes(t)) return 'pts';
  if (['grade', '학년'].includes(t)) return 'grade';
  return '';
}
function findHeader(sh) {
  for (let r = 1; r <= 20; r++) {
    const cols = {};
    for (let c = 1; c <= 30; c++) { const k = headerKey(cell(sh, r, c).v); if (k && !cols[k]) cols[k] = c; }
    if (cols.name && cols.art) return { hdr: r, cols };
  }
  return null;
}
const isYellow = x => x.fill === 'FFFF00';
function cellDate(x, refDate) {
  if (x.v === null || x.v === '') return '';
  if (typeof x.v === 'number') return (x.date || (x.v > 30000 && x.v < 80000)) ? serialToIso(x.v) : '';
  return E.toDate(x.v, refDate);
}
// 반환 {items:[{name,grade,date,acc,art,pts,src,file}], yellowOnly, sheets:[이름]}
export async function importDeptFile(buf, fileName, refDate) {
  const sheets = await readWorkbook(buf);
  const ok = []; let anyYellow = false;
  for (const sh of sheets) {
    const h = findHeader(sh); if (!h) continue;
    ok.push({ sh, ...h });
    for (let r = h.hdr + 1; r <= sh.maxRow; r++) if (isYellow(cell(sh, r, h.cols.name)) || isYellow(cell(sh, r, h.cols.art))) { anyYellow = true; break; }
  }
  const items = [];
  for (const { sh, hdr, cols } of ok) {
    let nm = '', gr = '';
    for (let r = hdr + 1; r <= sh.maxRow; r++) {
      const nc = cell(sh, r, cols.name), v = E.cellText(nc.v);
      if (v) { nm = v; gr = cols.grade ? cell(sh, r, cols.grade).v : ''; }
      else if (!inMerge(sh, r, cols.name)) { nm = ''; gr = ''; }
      const art = E.cellText(cell(sh, r, cols.art).v);
      if (!art || !nm) continue;
      if (anyYellow && !isYellow(nc) && !isYellow(cell(sh, r, cols.art))) continue;
      const p = cols.pts ? cell(sh, r, cols.pts).v : null;
      items.push({ name: nm, grade: typeof gr === 'number' ? gr : (Number(gr) || 0), date: cols.date ? cellDate(cell(sh, r, cols.date), refDate) : '',
        acc: cols.acc ? E.cellText(cell(sh, r, cols.acc).v) : '', art, pts: typeof p === 'number' ? p : (p !== null && p !== '' && !isNaN(Number(p)) ? Number(p) : null),
        src: fileName + ' / ' + sh.name + '!' + r + '행', file: fileName });
    }
  }
  return { items, yellowOnly: anyYellow, sheets: ok.map(o => o.sh.name) };
}

// ---------------------------------------------------------------- 추가 기소 붙여넣기
// 1) 엑셀에서 머리글째 복사한 표  2) 인트라넷 글처럼 적은 글 (기소자를 따로 받음)
export function parseExtraPaste(C, text, acc, refDate, label) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const tab = lines.filter(l => l.includes('\t'));
  if (tab.length >= 2) {
    for (let h = 0; h < Math.min(lines.length, 10); h++) {
      const heads = lines[h].split('\t').map(headerKey); const cols = {};
      heads.forEach((k, i) => { if (k && cols[k] === undefined) cols[k] = i; });
      if (cols.name === undefined || cols.art === undefined) continue;
      const items = []; let nm = '';
      for (let r = h + 1; r < lines.length; r++) {
        const c = lines[r].split('\t'); if (!lines[r].trim()) continue;
        const v = E.cellText(c[cols.name]); if (v) nm = v;
        const art = E.cellText(c[cols.art]); if (!art || !nm) continue;
        const pts = cols.pts !== undefined ? E.cellText(c[cols.pts]) : '';
        items.push({ name: nm, grade: cols.grade !== undefined ? (Number(E.cellText(c[cols.grade])) || 0) : 0,
          date: cols.date !== undefined ? E.toDate(E.cellText(c[cols.date]), refDate) : '', acc: cols.acc !== undefined ? (E.cellText(c[cols.acc]) || acc) : acc,
          art, pts: pts !== '' && !isNaN(Number(pts)) ? Number(pts) : null, src: label + ' ' + (r + 1) + '줄', file: label });
      }
      return { items, missing: [], mode: 'table' };
    }
  }
  const ms = E.parsePost(C, { id: label, date: refDate, user: acc, title: '', text });
  const { rows } = E.mentionsToRows(C, ms.filter(m => m.art));
  const items = rows.map(r => ({ name: r.name, grade: 0, date: r.date, acc, art: r.art,
    pts: r.flags.some(f => f[0] === 'pts') ? null : r.pts, src: label + ' ' + r.lineNo + '줄: ' + r.line, file: label }));
  return { items, missing: ms.filter(m => !m.art).map(m => m.tok + ' (' + m.line + ')'), mode: 'text' };
}

// ---------------------------------------------------------------- 기준자료 파일
const SHEETS = {
  roster: ['재학생명단', ['이름', '학년', '학반번'], r => ({ name: r[0], grade: r[1], no: r[2] ?? '' }), o => [o.name, o.grade, o.no ?? '']],
  articles: ['벌점표', ['Violated Article', 'Points', 'Category', '점수 미기재 시 기본 점수', '기본 점수 쓸 때 색 표시(Y/N)'], r => ({ art: r[0], pts: r[1], cat: r[2] ?? '', dflt: r[3] ?? '', flag: r[4] ?? '' }), o => [o.art, o.pts, o.cat, o.dflt, o.flag]],
  dict: ['표현사전', ['글에 쓰인 표현(키워드)', 'Violated Article', '고정 점수(비우면 벌점표)', '게시자 조건(쉼표, 비우면 모두)', '메모'], r => ({ kw: r[0], art: r[1] ?? '', fixed: r[2] ?? '', poster: r[3] ?? '', memo: r[4] ?? '' }), o => [o.kw, o.art, o.fixed, o.poster, o.memo ?? '']],
  nameFix: ['오타교정', ['글에 쓰인 이름', '바른 이름'], r => ({ from: r[0], to: r[1] ?? '' }), o => [o.from, o.to]],
  reps: ['학생대표', ['이름'], r => r[0], o => [o]],
  nonNames: ['이름아님', ['이름처럼 보이지만 이름이 아닌 단어'], r => r[0], o => [o]],
};
const clean = v => (v === undefined || v === null) ? '' : (typeof v === 'string' ? v.trim() : v);
export async function readRefsFile(buf) {
  const sheets = await readWorkbook(buf); const byName = new Map(sheets.map(s => [s.name.trim(), s]));
  const refs = {}; const missing = [];
  for (const [key, [title, , fromRow]] of Object.entries(SHEETS)) {
    const sh = byName.get(title); if (!sh) { missing.push(title); refs[key] = []; continue; }
    const list = [];
    for (let r = 2; r <= sh.maxRow; r++) {
      const row = []; for (let c = 1; c <= 6; c++) row.push(clean(cell(sh, r, c).v));
      if (row[0] === '' || row[0] === null) continue;
      list.push(fromRow(row));
    }
    refs[key] = list;
  }
  // 리스트 머리말 (양식 시트: G1:H3, A4 둘째 줄부터)
  const f = byName.get('양식') || byName.get('리스트머리말');
  if (f) {
    const a4 = String(cell(f, 4, 1).v ?? ''); const k = a4.indexOf('\n');
    refs.header = { labels: [1, 2, 3].map(r => String(cell(f, r, 7).v ?? '')), names: [1, 2, 3].map(r => String(cell(f, r, 8).v ?? '')), notice: k >= 0 ? a4.slice(k + 1) : a4 };
  } else missing.push('양식');
  if (!refs.roster.length) throw new Error("'재학생명단' 시트에 학생이 없습니다");
  return { refs, missing };
}
export async function writeRefsFile(refs) {
  const B = { font: { b: true } };
  const sheets = Object.entries(SHEETS).map(([key, [title, heads, , toRow]]) => ({
    name: title, cols: heads.map((h, i) => i === 0 ? 30 : 22), freeze: 'A2',
    rows: [heads.map(h => ({ v: h, s: B })), ...(refs[key] || []).map(o => toRow(o).map(v => (v === null || v === undefined) ? '' : v))] }));
  const h = refs.header || { labels: ['담당교사', '법무부장', '사법위원장'], names: ['', '', ''], notice: '' };
  sheets.push({ name: '양식', cols: [4, 6.66, 10.33, 9.66, 10.66, 38.16, 10.16, 10.33], heights: { 4: 206.25 }, merges: ['A1:F3', 'A4:H4'],
    rows: [['Court List n 법무부용', , , , , , h.labels[0], h.names[0]], [, , , , , , h.labels[1], h.names[1]], [, , , , , , h.labels[2], h.names[2]],
      [{ v: 'm/d/yyyy\n' + h.notice, s: { wrap: true, v: 'center', font: { sz: 10.5, b: true } } }]] });
  return writeWorkbook(sheets);
}

// ---------------------------------------------------------------- Court List (배포용: 리스트 시트 하나)
export function wednesdayLabel(sunday) { const w = E.addDays(sunday, 3); const p = E.parts(w); return p.m + '/' + p.d + '/' + p.y; }
export async function writeCourtList(list, { listNo, sunday, header }) {
  const h = header || { labels: ['', '', ''], names: ['', '', ''], notice: '' };
  const thin = true, F = sz => ({ name: '맑은 고딕', sz });
  const title = { font: { ...F(36), b: true }, h: 'center', v: 'center', wrap: true, border: thin };
  const box = { font: F(11), h: 'center', v: 'center', border: thin };
  const notice = { font: { ...F(10.5), b: true }, v: 'center', wrap: true, border: thin };
  const head = { font: F(10), h: 'center', v: 'center', border: thin };
  const body = { font: F(10), h: 'center', v: 'center', border: thin };
  const bodyTxt = { ...body, fmt: '@' };
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = []; for (let c = 0; c < 6; c++) row.push({ v: r === 0 && c === 0 ? 'Court List ' + listNo + ' 법무부용' : '', s: title });
    row.push({ v: h.labels[r] || '', s: box }, { v: h.names[r] || '', s: box }); rows.push(row);
  }
  const r4 = [{ v: wednesdayLabel(sunday) + '\n' + (h.notice || ''), s: notice }]; for (let c = 1; c < 8; c++) r4.push({ v: '', s: notice }); rows.push(r4);
  rows.push(['No', 'Grade', 'Name', 'Date', 'Accused by', 'Violated Article', 'Points', 'Sum'].map(v => ({ v, s: head })));
  const merges = ['A1:F3', 'A4:H4'];
  const first = 6;
  list.forEach((x, i) => {
    rows.push([{ v: '', s: body }, { v: x.grade ? x.grade : '', s: body }, { v: x.disp, s: body }, { v: E.fmtDate(x.date), s: bodyTxt },
      { v: x.accuser, s: body }, { v: x.art, s: body }, { v: x.finalPts, s: body }, { v: '', s: body }]);
  });
  let i = 0;
  while (i < list.length) {
    let j = i; while (j + 1 < list.length && list[j + 1].disp === list[i].disp) j++;
    if (j > i) { merges.push('C' + (first + i) + ':C' + (first + j)); for (let k = i + 1; k <= j; k++) rows[first - 1 + k][2] = { v: '', s: body }; }
    i = j + 1;
  }
  const last = first + list.length - 1;
  return writeWorkbook([{ name: 'Court List', cols: [4, 6.6640625, 10.33203125, 9.6640625, 10.6640625, 38.1640625, 10.1640625, 10.33203125], heights: { 1: 42, 2: 42, 3: 42, 4: 206.25, 5: 16.5 },
    merges, rows, print: { area: '$A$1:$H$' + Math.max(last, 5), fitWidth: true } }]);
}
export function courtListFileName(listNo, sunday) {
  const mon = E.parts(E.addDays(sunday, -6)), sun = E.parts(sunday);
  return 'Court List ' + listNo + ' 법무부용 (' + mon.m + '.' + mon.d + '-' + sun.m + '.' + sun.d + ').xlsx';
}
