import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';

const absence = E.MORNING_ABSENCE_ARTICLE, late = 'Late for morning exercise';
const refs = {
  roster: ['가상학생', '시험학생', '예시학생'].map(name => ({ name, grade: 1 })),
  articles: [{ art: absence, pts: 6 }, { art: late, pts: 2 }],
};
const sunday = '2026-11-08';
const post = text => ({ id: '1', user: '담당교사', date: sunday, title: '아침기 기소', text });
const read = (C, p) => E.extractWeek(C, [p], '2026-11-02', sunday).rows;

test('pasted morning post carries the title and each date to the relevant names', () => {
  const C = E.makeCtx(refs, sunday);
  const pasted = ['글', '1', sunday, '12:00', '담당교사', '아침기 기소', '',
    '11/2⏎가상학생⏎11/3 시험학생⏎예시학생⏎(11.4) 가상학생⏎[11월 5일] 시험학생'].join('\t');
  const rows = read(C, E.parsePasted(pasted)[0]);
  assert.deepEqual(rows.map(r => [r.name, r.date, r.art, r.pts]), [
    ['가상학생', '2026-11-02', absence, 6],
    ['시험학생', '2026-11-03', absence, 6],
    ['예시학생', '2026-11-03', absence, 6],
    ['가상학생', '2026-11-04', absence, 6],
    ['시험학생', '2026-11-05', absence, 6],
  ]);
});

test('same-line date groups keep their own article and undated names are flagged', () => {
  const C = E.makeCtx(refs, sunday);
  const p = post('예시학생\n11/2 아침기 지각 가상학생; 11/3 아침기 불참 시험학생');
  const rows = E.compute(C, read(C, p)).rows;
  assert.deepEqual(rows.map(r => [r.name, r.date, r.art]), [
    ['예시학생', '', absence],
    ['가상학생', '2026-11-02', late],
    ['시험학생', '2026-11-03', absence],
  ]);
  assert(rows[0].flags.some(([kind]) => kind === 'date'));
});

test('existing morning rows are recovered without discarding manual edits', () => {
  const C = E.makeCtx(refs, sunday);
  const p = post('11/2 가상학생\n11/3 시험학생\n예시학생');
  C.sourcePosts = [p];
  const old = read(C, p).map(r => ({
    ...r, date: '2026-11-02', art: '', pts: 0, unassigned: true,
  }));
  old[0].date = '2026-11-05';
  old[0].edited = ['date'];
  old[2].art = late;
  old[2].pts = 4;
  old[2].edited = ['art', 'pts'];

  const actual = E.compute(C, old).rows;
  assert.deepEqual(actual.map(r => [r.id, r.date, r.art, r.pts]), [
    [old[0].id, '2026-11-05', absence, 6],
    [old[1].id, '2026-11-03', absence, 6],
    [old[2].id, '2026-11-03', late, 4],
  ]);
  assert.deepEqual([old[1].date, old[1].art], ['2026-11-02', '']);
});

test('bulk edits save only selected rows and preserve individually edited points', async () => {
  const { readFile } = await import('node:fs/promises');
  const vm = await import('node:vm');
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  let saved;
  const rows = [
    { id: 'a', date: '2026-11-02', art: absence, pts: 10, edited: ['pts'] },
    { id: 'b', date: '2026-11-03', art: absence, pts: 6 },
    { id: 'c', date: '2026-11-03', art: absence, pts: 6 },
  ];
  const boxes = ['a', 'b'].map(id => ({
    checked: true,
    closest: () => ({ dataset: { id, scope: 'group' } }),
  }));
  const fields = {
    '[data-bulk-date]': { value: '', validity: { valid: true } },
    '[data-bulk-art]': { value: late },
  };
  const table = {
    dataset: { bulkTable: 'group' },
    querySelector: selector => fields[selector],
    querySelectorAll: () => boxes,
  };
  const context = vm.createContext({
    S: { saving: 0 }, scopeRows: () => structuredClone(rows), defaultPts: () => 2,
    saveScope: async (scope, draft) => { assert.equal(scope, 'group'); saved = draft; return true; },
    app: { querySelectorAll: () => boxes }, render() {}, toast() {},
  });
  vm.runInContext(appSource.slice(appSource.indexOf('function markEdited('),
    appSource.indexOf('function editField(')), context);
  await context.applyBulkEdits(table);
  assert.deepEqual(saved.map(r => [r.date, r.art, r.pts]), [
    ['2026-11-02', late, 10], ['2026-11-03', late, 2], ['2026-11-03', absence, 6],
  ]);
  assert(boxes.every(box => !box.checked));

  fields['[data-bulk-date]'].value = '2026-11-04';
  fields['[data-bulk-art]'].value = '';
  await context.applyBulkEdits(table);
  assert.deepEqual(saved.map(r => [r.date, r.art]), [
    ['2026-11-04', absence], ['2026-11-04', absence], ['2026-11-03', absence],
  ]);
});

test('day-only morning headings keep the names below each day and avoid false duplicates', () => {
  const sunday = '2026-11-22';
  const C = E.makeCtx(refs, sunday);
  const p = { ...post('13일\n가상학생\n시험학생\n\n16일\n가상학생\n예시학생'), date: sunday };
  const { rows } = E.extractWeek(C, [p], '2026-11-16', sunday);
  assert.deepEqual(E.compute(C, rows).rows.map(r => [r.name, r.date, r.status]), [
    ['가상학생', '2026-11-13', 'ok'],
    ['시험학생', '2026-11-13', 'ok'],
    ['가상학생', '2026-11-16', 'ok'],
    ['예시학생', '2026-11-16', 'ok'],
  ]);
});

test('saved morning rows move to the new day heading and retain manually edited dates', () => {
  const sunday = '2026-11-22';
  const C = E.makeCtx(refs, sunday);
  const p = { ...post('11월 13일\n가상학생\n[16일] 가상학생\n예시학생'), date: sunday };
  const { rows } = E.extractWeek(C, [p], '2026-11-16', sunday);
  const saved = rows.map(r => ({ ...r, date: '2026-11-13' }));
  saved[2].date = '2026-11-17';
  saved[2].edited = ['date'];
  C.sourcePosts = [p];
  assert.deepEqual(E.compute(C, saved).rows.map(r => [r.date, r.status]), [
    ['2026-11-13', 'ok'], ['2026-11-16', 'ok'], ['2026-11-17', 'ok'],
  ]);
  assert.equal(saved[1].date, '2026-11-13');
});

test('day-only headings use the posting date to resolve a month or year boundary', () => {
  const date = '2026-01-04';
  const C = E.makeCtx(refs, date);
  const p = { ...post('31일(수) 가상학생\n2일 (금) 시험학생'), date };
  const rows = E.mentionsToRows(C, E.parsePost(C, p)).rows;
  assert.deepEqual(rows.map(r => [r.name, r.date]), [
    ['가상학생', '2025-12-31'], ['시험학생', '2026-01-02'],
  ]);
});
