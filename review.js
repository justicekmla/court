import { GROUPS, uploadGroupOf, postKey } from './engine.js?v=post-routing-20261122';
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
export function memberReviewStage(doc) {
  if (!doc) return null;
  if (doc.noPosts || (doc.firstDoneAt && doc.done)) return 'complete';
  // A completion from before the two grades were introduced is the first review.
  return doc.firstDoneAt || doc.done ? 'second' : 'first';
}
export const rowsForGroup = (rows, group) => rows.filter(row => uploadGroupOf(row) === group);
export const ownedRows = (rows, group) => rows.map(row => uploadGroupOf(row) === group ? row : { ...row, uploadGroup: group });

function sourceOwners(groups) {
  const owners = new Map();
  GROUPS.forEach((group, i) => {
    const doc = groups[i];
    for (const row of doc?.draft || doc?.rows || []) {
      const id = String(row.post);
      if (!owners.has(id)) owners.set(id, new Set());
      owners.get(id).add(group);
    }
  });
  return owners;
}

export function scopedPosts(posts, groups) {
  const owners = sourceOwners(groups), scoped = new Map();
  for (const post of posts) {
    const storedGroup = uploadGroupOf(post);
    const matches = owners.get(String(post.id));
    const targets = matches && (!GROUPS.includes(post.uploadGroup) || !matches.has(storedGroup)) ? matches : [storedGroup];
    for (const group of targets) {
      const key = postKey(post.id, group);
      if (!scoped.has(key) || post.uploadGroup === group) scoped.set(key, { ...post, uploadGroup: group });
    }
  }
  return [...scoped.values()];
}

export function planPostUpload(posts, group, existing, groups, final) {
  const scoped = scopedPosts(existing, groups);
  const placements = new Map(scoped.map(p => [postKey(p.id, p.uploadGroup), p.mark === '제외' ? 'excluded' : 'included']));
  const committed = combinedRows(final, groups);
  GROUPS.forEach((owner, i) => {
    const rows = groups[i]?.draft || rowsForGroup(committed, owner);
    const statuses = new Map();
    for (const row of rows) {
      const key = postKey(row.post, owner);
      const status = row.excluded ? 'excluded' : 'included';
      const seen = statuses.get(key);
      statuses.set(key, seen && seen !== status ? 'partial' : status);
    }
    for (const [key, status] of statuses) placements.set(key, status);
  });
  const added = [], conflicts = [], duplicates = [];
  for (const post of posts) {
    const locations = GROUPS.flatMap(owner => {
      const status = placements.get(postKey(post.id, owner));
      return status ? [{ group: owner, status }] : [];
    });
    const detail = { id: post.id, title: post.title, locations };
    if (locations.some(location => location.group === group)) { duplicates.push(detail); continue; }
    if (locations.length) conflicts.push(detail);
    added.push(post);
  }
  return { added, conflicts, duplicates };
}
export function currentStamps(groups) {
  return Object.fromEntries(GROUPS.map((g,i) => [GKEY[g],sourceStamp(groups[i])]));
}
export function combinedRows(final, groups) {
  const owners = sourceOwners(groups);
  const ownerByRow = new Map(GROUPS.flatMap((group, i) => (groups[i]?.rows || []).map(row => [row.id, group])));
  const finalRows = (final?.rows || []).map(row => {
    const matches = owners.get(String(row.post));
    const group = ownerByRow.get(row.id) || (!GROUPS.includes(row.uploadGroup) && matches?.size === 1 ? [...matches][0] : uploadGroupOf(row));
    return uploadGroupOf(row) === group ? row : { ...row, uploadGroup: group };
  });
  return GROUPS.flatMap((g,i) => {
    const saved = rowsForGroup(finalRows,g);
    const stamp = final?.sourceStamps?.[GKEY[g]];
    // Keep chief edits from the previous release. Its order-sensitive tokens
    // cannot be migrated reliably; approvals must be recorded again. A missing
    // group in an old final snapshot must not hide that group's committed rows.
    const legacy = !stamp || !String(stamp).startsWith('v2:');
    const usable = final && (legacy ? saved.length > 0 : stamp === sourceStamp(groups[i]));
    return usable ? saved : ownedRows(groups[i]?.rows || [], g);
  }).sort((a,b) => (a.order||0)-(b.order||0) || Number(a.post)-Number(b.post) || a.seq-b.seq);
}
export function reviewSnapshotMatches(group, shownRows, shownStamp, final, groups) {
  const current = groups[GROUPS.indexOf(group)];
  return !!current?.done && sourceStamp(current) === shownStamp &&
    canonicalString(rowsForGroup(combinedRows(final,groups),group)) === canonicalString(ownedRows(shownRows, group));
}
