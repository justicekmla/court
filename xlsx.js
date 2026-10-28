// 엑셀(.xlsx/.xlsm) 읽기·쓰기 — 외부 라이브러리 없이 브라우저 기능만 사용
const enc = new TextEncoder(), dec = new TextDecoder();

// ---------------------------------------------------------------- ZIP
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer());
}
export async function unzip(buf) {
  const b = new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('엑셀 파일이 아닙니다 (xlsx 형식으로 저장해 주세요)');
  const cnt = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
  const files = new Map();
  for (let k = 0; k < cnt; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl));
    files.set(name, { method, csize, off });
    p += 46 + nl + xl + cl;
  }
  return {
    has: n => files.has(n),
    names: () => [...files.keys()],
    async text(n) {
      const f = files.get(n); if (!f) return null;
      const ds = f.off + 30 + v.getUint16(f.off + 26, true) + v.getUint16(f.off + 28, true);
      const raw = b.subarray(ds, ds + f.csize);
      return dec.decode(f.method === 0 ? raw : await inflateRaw(raw));
    }
  };
}
export async function zip(entries) { // entries: [[name, string|Uint8Array]]
  const parts = [], central = []; let off = 0;
  for (const [name, data] of entries) {
    const raw = typeof data === 'string' ? enc.encode(data) : data;
    const nb = enc.encode(name), crc = crc32(raw);
    let body = await deflateRaw(raw), method = 8;
    if (!body) { body = raw; method = 0; }
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
    h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
    c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + body.length;
  }
  const csize = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------------------------------------------------------------- 작은 XML 도구
const unesc = s => s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, k) =>
  k === 'amp' ? '&' : k === 'lt' ? '<' : k === 'gt' ? '>' : k === 'quot' ? '"' : k === 'apos' ? "'" : String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)));
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function attrs(tag) { const a = {}; tag.replace(/([\w:]+)="([^"]*)"/g, (m, k, v) => { a[k] = unesc(v); }); return a; }
function* tags(xml, name) { // <name ...>inner</name> 또는 <name .../>
  const re = new RegExp('<' + name + '(\\s[^>]*?)?(/>|>([\\s\\S]*?)</' + name + '>)', 'g'); let m;
  while ((m = re.exec(xml))) yield { a: attrs(m[1] || ''), inner: m[3] || '' };
}
const allText = inner => { let s = ''; for (const t of tags(inner, 't')) s += unesc(t.inner); return s; };
export function colNum(letters) { let n = 0; for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
export function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
const splitRef = ref => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { c: colNum(m[1]), r: +m[2] }; };

// ---------------------------------------------------------------- 읽기
// 반환: [{name, cells: Map 'r,c' → {v, fill(rgb 대문자 6자리 or ''), date:boolean}, merges:[{r1,c1,r2,c2}], maxRow, maxCol}]
export async function readWorkbook(buf) {
  const z = await unzip(buf);
  const wbx = await z.text('xl/workbook.xml'); if (!wbx) throw new Error('엑셀 통합문서가 아닙니다');
  const rels = (await z.text('xl/_rels/workbook.xml.rels')) || '';
  const relMap = {}; for (const r of tags(rels, 'Relationship')) relMap[r.a.Id] = r.a.Target;
  const ss = []; const ssx = await z.text('xl/sharedStrings.xml');
  if (ssx) for (const si of tags(ssx, 'si')) ss.push(allText(si.inner.replace(/<rPh[\s\S]*?<\/rPh>/g, '')));
  const st = (await z.text('xl/styles.xml')) || '';
  const fills = []; for (const f of tags(st, 'fill')) {
    const pf = [...tags(f.inner, 'patternFill')][0]; let rgb = '';
    if (pf && pf.a.patternType && pf.a.patternType !== 'none') {
      const fg = [...tags(pf.inner, 'fgColor')][0];
      if (fg) { if (fg.a.rgb) rgb = fg.a.rgb.slice(-6).toUpperCase(); else if (fg.a.indexed === '13') rgb = 'FFFF00'; else if (fg.a.indexed === '9') rgb = 'FFFFFF'; }
    }
    fills.push(rgb);
  }
  const fmts = {}; for (const f of tags(st, 'numFmt')) fmts[f.a.numFmtId] = f.a.formatCode;
  const xfs = []; const cx = /<cellXfs[\s\S]*?<\/cellXfs>/.exec(st);
  if (cx) for (const x of tags(cx[0], 'xf')) {
    const id = +(x.a.numFmtId || 0); const code = fmts[id] || '';
    const isDate = (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (/[ymd]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/^[#0.,% ]+$/.test(code));
    xfs.push({ fill: fills[+(x.a.fillId || 0)] || '', date: isDate });
  }
  const out = [];
  for (const s of tags(wbx, 'sheet')) {
    let target = relMap[s.a['r:id']] || ''; if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const x = await z.text(target); if (!x) continue;
    const cells = new Map(); let maxRow = 0, maxCol = 0;
    const re = /<c\s([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g; let m;
    while ((m = re.exec(x))) {
      const a = attrs(m[1]); if (!a.r) continue;
      const { r, c } = splitRef(a.r); const inner = m[3] || '';
      const xf = xfs[+(a.s || 0)] || { fill: '', date: false };
      let v = null; const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (a.t === 's') v = vm ? ss[+vm[1]] : null;
      else if (a.t === 'inlineStr') v = allText(inner);
      else if (a.t === 'str' || a.t === 'e') v = vm ? unesc(vm[1]) : null;
      else if (a.t === 'b') v = vm ? vm[1] === '1' : null;
      else if (vm) v = Number(vm[1]);
      cells.set(r + ',' + c, { v, fill: xf.fill, date: xf.date && typeof v === 'number' });
      if (v !== null && v !== '') { maxRow = Math.max(maxRow, r); maxCol = Math.max(maxCol, c); }
    }
    const merges = [];
    for (const mc of tags(x, 'mergeCell')) { const [p1, p2] = mc.a.ref.split(':'); const A = splitRef(p1), B = splitRef(p2 || p1); merges.push({ r1: A.r, c1: A.c, r2: B.r, c2: B.c }); }
    out.push({ name: s.a.name, cells, merges, maxRow, maxCol });
  }
  return out;
}
export function cell(sh, r, c) { return sh.cells.get(r + ',' + c) || { v: null, fill: '', date: false }; }
export function inMerge(sh, r, c) { return sh.merges.some(m => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2); }
export function serialToIso(n) { const t = new Date(Math.round((n - 25569) * 86400000)); return t.toISOString().slice(0, 10); }

// ---------------------------------------------------------------- 쓰기
// sheets: [{name, rows:[[{v, s}]] or values, cols:[width], heights:{r:h}, merges:['A1:F3'], print:{area, fitWidth, landscape}, freeze:'A2'}]
// style 객체 s: {font:{name,sz,b,color}, fill:'RRGGBB', border:true|{l,r,t,b}, h:'center', v:'center', wrap:true, fmt:'@'}
export async function writeWorkbook(sheets) {
  const fonts = ['<font><sz val="11"/><name val="맑은 고딕"/><family val="2"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
    borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const keyIdx = new Map([['{}', 0]]);
  const idx = (arr, xml) => { let i = arr.indexOf(xml); if (i < 0) { arr.push(xml); i = arr.length - 1; } return i; };
  function styleId(s) {
    if (!s) return 0; const k = JSON.stringify(s); if (keyIdx.has(k)) return keyIdx.get(k);
    const f = s.font || {};
    const fontId = idx(fonts, '<font>' + (f.b ? '<b/>' : '') + '<sz val="' + (f.sz || 11) + '"/>' + (f.color ? '<color rgb="FF' + f.color + '"/>' : '') + '<name val="' + esc(f.name || '맑은 고딕') + '"/><family val="2"/></font>');
    const fillId = s.fill ? idx(fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + s.fill + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
    let bd = s.border === true ? { l: 1, r: 1, t: 1, b: 1 } : (s.border || {});
    const side = (n, on) => on ? '<' + n + ' style="thin"><color indexed="64"/></' + n + '>' : '<' + n + '/>';
    const borderId = idx(borders, '<border>' + side('left', bd.l) + side('right', bd.r) + side('top', bd.t) + side('bottom', bd.b) + '<diagonal/></border>');
    const numFmtId = s.fmt === '@' ? 49 : 0;
    const al = (s.h || s.v || s.wrap) ? '<alignment' + (s.h ? ' horizontal="' + s.h + '"' : '') + (s.v ? ' vertical="' + s.v + '"' : '') + (s.wrap ? ' wrapText="1"' : '') + '/>' : '';
    xfs.push('<xf numFmtId="' + numFmtId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"' +
      (numFmtId ? ' applyNumberFormat="1"' : '') + ' applyFont="1"' + (fillId ? ' applyFill="1"' : '') + ' applyBorder="1"' + (al ? ' applyAlignment="1">' + al + '</xf>' : '/>'));
    keyIdx.set(k, xfs.length - 1); return xfs.length - 1;
  }
  const sheetXml = [], names = [];
  sheets.forEach((sh, si) => {
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    x += '<sheetPr>' + (sh.print && sh.print.fitWidth ? '<pageSetUpPr fitToPage="1"/>' : '') + '</sheetPr>';
    x += '<sheetViews><sheetView workbookViewId="0"' + (si === 0 ? ' tabSelected="1"' : '') + '>' + (sh.freeze ? '<pane ySplit="' + (splitRef(sh.freeze).r - 1) + '" topLeftCell="' + sh.freeze + '" activePane="bottomLeft" state="frozen"/>' : '') + '</sheetView></sheetViews>';
    x += '<sheetFormatPr defaultRowHeight="16.5"/>';
    if (sh.cols && sh.cols.length) x += '<cols>' + sh.cols.map((w, i) => w ? '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>' : '').join('') + '</cols>';
    x += '<sheetData>';
    (sh.rows || []).forEach((row, ri) => {
      const r = ri + 1; const h = sh.heights && sh.heights[r];
      let rx = '<row r="' + r + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>';
      (row || []).forEach((cl, ci) => {
        if (cl === undefined || cl === null) return;
        const o = (typeof cl === 'object' && !Array.isArray(cl)) ? cl : { v: cl };
        const ref = colName(ci + 1) + r; const s = styleId(o.s);
        if (o.v === undefined || o.v === null || o.v === '') { if (s) rx += '<c r="' + ref + '" s="' + s + '"/>'; return; }
        if (typeof o.v === 'number') rx += '<c r="' + ref + '" s="' + s + '"><v>' + o.v + '</v></c>';
        else rx += '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(o.v) + '</t></is></c>';
      });
      x += rx + '</row>';
    });
    x += '</sheetData>';
    if (sh.merges && sh.merges.length) x += '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>';
    const pm = sh.margins || { l: 0.7086614173228347, r: 0.7086614173228347, t: 0.7480314960629921, b: 0.7480314960629921 };
    x += '<pageMargins left="' + pm.l + '" right="' + pm.r + '" top="' + pm.t + '" bottom="' + pm.b + '" header="0.31496062992125984" footer="0.31496062992125984"/>';
    if (sh.print) x += '<pageSetup paperSize="9" orientation="' + (sh.print.landscape ? 'landscape' : 'portrait') + '"' + (sh.print.fitWidth ? ' fitToWidth="1" fitToHeight="0"' : '') + '/>';
    x += '</worksheet>';
    sheetXml.push(x); names.push(sh.name);
  });
  const defNames = sheets.map((sh, i) => sh.print && sh.print.area ? '<definedName name="_xlnm.Print_Area" localSheetId="' + i + '">\'' + esc(sh.name) + '\'!' + sh.print.area + '</definedName>' : '').join('');
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
    names.map((n, i) => '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' + (defNames ? '<definedNames>' + defNames + '</definedNames>' : '') + '</workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    names.map((n, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
    '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    names.map((n, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const entries = [['[Content_Types].xml', ct], ['_rels/.rels', rootRels], ['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', wbRels], ['xl/styles.xml', styles]];
  sheetXml.forEach((x, i) => entries.push(['xl/worksheets/sheet' + (i + 1) + '.xml', x]));
  return zip(entries);
}
