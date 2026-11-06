import { GROUPS, groupOf } from './engine.js?v=20261107';
const GKEY = { '남사감':'m', '여사감':'f', '인트라넷':'i', '아침기':'a' };

// Firestore map field order is not part of the data. Match its omission of
// undefined object properties while preserving meaningful array/row order.
export function canonicalString(value) {
  function normalize(v) {
    if (Array.isArray(v)) return v.map(x => x === undefined ? null : normalize(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, normalize(v[k])]));
    return v;
  }
  return JSON.stringify(normalize(value));
}
export function sourceStamp(doc) {
  const text = canonicalString([doc?.revision || '', doc?.doneAt || '', doc?.rows || []]);
  let a=2166136261, b=5381;
  for (let i=0; i<text.length; i++) { a=Math.imul(a^text.charCodeAt(i),16777619); b=Math.imul(b,33)^text.charCodeAt(i); }
  return 'v2:'+(a>>>0).toString(36)+'-'+(b>>>0).toString(36);
}
export const rowsForGroup = (rows, group) => rows.filter(row => groupOf(row.user) === group);
export function currentStamps(groups) {
  return Object.fromEntries(GROUPS.map((g,i) => [GKEY[g],sourceStamp(groups[i])]));
}
export function combinedRows(final, groups) {
  return GROUPS.flatMap((g,i) => {
    const saved = final ? rowsForGroup(final.rows || [],g) : [];
    const stamp = final?.sourceStamps?.[GKEY[g]];
    // Keep chief edits from the previous release. Its order-sensitive tokens
    // cannot be migrated reliably; approvals must be recorded again. A missing
    // group in an old final snapshot must not hide that group's committed rows.
    const legacy = !stamp || !String(stamp).startsWith('v2:');
    const usable = final && (legacy ? saved.length > 0 : stamp === sourceStamp(groups[i]));
    return usable ? saved : groups[i]?.rows || [];
  }).sort((a,b) => (a.order||0)-(b.order||0) || Number(a.post)-Number(b.post) || a.seq-b.seq);
}
export function reviewSnapshotMatches(group, shownRows, shownStamp, final, groups) {
  const current = groups[GROUPS.indexOf(group)];
  return !!current?.done && sourceStamp(current) === shownStamp &&
    canonicalString(rowsForGroup(combinedRows(final,groups),group)) === canonicalString(shownRows);
}
