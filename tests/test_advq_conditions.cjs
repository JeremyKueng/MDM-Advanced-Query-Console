// Run: node tests/test_advq_conditions.cjs — demo dataset filtering and configuration migration.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dataset = JSON.parse(fs.readFileSync(path.join(root, 'outputs/advq/dataset.json'), 'utf8'));
const context = vm.createContext({ assert, dataset, console });
for (const name of ['core', 'config']) vm.runInContext(fs.readFileSync(path.join(root, `outputs/advq/advq.${name}.js`), 'utf8'), context);
vm.runInContext(`
DATASET = dataset; buildIndexes();
const validRows = rows.filter(r=>r.status==='有效');
const originalConditions = [{ field: 'updated', op: 'between', val: '2026-10-01', valTo: '2026-10-14' }];
assert.equal(isoDate('20260101'), '2026-01-01');
assert.equal(isoDate('2026/1/2'), '2026-01-02');
assert.equal(isoDate('2024-02-29 23:59:59'), '2024-02-29');
assert.equal(isoDate('2026-02-29'), '');
assert.equal(isoDate('2026-13-01'), '');
assert.equal(isoDate('202601'), '');
const stampRow = { updated: '2026-10-01T23:59:59+08:00' };
assert.equal(evalDpCondition(stampRow, { field: 'updated', op: 'eq', val: '20261001' }), true);
assert.equal(evalDpCondition(stampRow, { field: 'updated', op: 'gt', val: '20261001' }), false);
assert.equal(evalDpCondition({ updated: null }, { field: 'updated', op: 'lt', val: '2026-10-01' }), false);
assert.equal(evalDpCondition({ updated: '无' }, { field: 'updated', op: 'empty' }), true);
for (const field of ['created', 'updated']) {
  for (const op of ['eq', 'neq', 'gte', 'gt', 'lte', 'lt', 'between']) {
    const condition = { field, op, val: '2026-10-01', valTo: '2026-10-14' };
    const boundary = Date.UTC(2026, 9, 1), end = Date.UTC(2026, 9, 14);
    const expected = validRows.filter((r) => {
      const date = Date.parse(r[field]);
      if (!Number.isFinite(date)) return false;
      return { eq: date === boundary, neq: date !== boundary, gte: date >= boundary, gt: date > boundary, lte: date <= boundary, lt: date < boundary, between: date >= boundary && date <= end }[op];
    }).length;
    state.filters.customConditions = [condition]; computeDerived();
    assert.equal(derived.total, expected, field + ' ' + op);
    
  }
}
state.filters.customConditions = [{ field: 'updated', op: 'between', val: '20261001', valTo: '20261001' }];
computeDerived(); assert.equal(derived.total, validRows.filter((r)=>r.updated === '2026-10-01').length, 'same-day inclusive range');
for (const c of [{ field: 'updated', op: 'between', val: '20261014', valTo: '20261001' }, { field: 'updated', op: 'between', val: '20261001', valTo: '' }, { field: 'updated', op: 'gte', val: '202601' }]) {
  assert.equal(customConditionReady(c), false); state.filters.customConditions = [c]; computeDerived(); assert.equal(derived.total, rows.filter((r)=>r.status==='有效').length);
}
state.filters.customConditions = [{ field: 'created', op: 'gte', val: '20261001' }, { field: 'updated', op: 'lt', val: '20261001' }];
for (const logic of ['AND', 'OR']) {
  state.filters.customLogic = logic; computeDerived();
  const expected = validRows.filter((r) => logic === 'OR' ? r.created >= '2026-10-01' || r.updated < '2026-10-01' : r.created >= '2026-10-01' && r.updated < '2026-10-01').length;
  assert.equal(derived.total, expected);
}
const legacy = { field: 'updated', op: 'contains', val: '2026-01' };
assert.equal(normalizeCustomConditions([legacy]).length, 1, 'preserve old text condition');
assert.equal(evalDpCondition({ updated: '2026-01-12' }, legacy), true);
const isolatedKeys = ['route','routeStatus','routeMissing','routeNodes','pdfCount','pdfBlock'];
const settings = { v: 6, order: schemaKeys, visible: schemaKeys, sort: { key: 'pdfCount', dir: -1 }, savedViews: [{ id: 'legacy', name: '旧视图', visible: schemaKeys }], filters: { customConditions: [...originalConditions, { field: 'pdfCount', op: 'eq', val: '1' }] }, dpTemplates: [{ id: 'old', name: '旧模板', conditions: [], blocks: [{ fields: schemaKeys, subBoxes: [{ fields: ['pdfBlock', '净重(kg)'] }], compareRows: [{ fields: ['pdfCount', 'cat'] }] }] }], viewShortcuts: ['preset:工艺属性检查', 'view:legacy'] };
applyUserSettings(decodeUserConfig(settings));
for (const key of isolatedKeys) {
  assert.equal(state.visible.includes(key), false); assert.equal(state.order.includes(key), false); assert.equal(state.savedViews[0].visible.includes(key), false);
  assert.equal(state.dpTemplates[0].blocks[0].fields.includes(key), false);
}
assert.equal(state.dpTemplates[0].blocks[0].subBoxes[0].fields.includes('pdfBlock'), false);
assert.equal(state.dpTemplates[0].blocks[0].compareRows[0].fields.includes('pdfCount'), false);
assert.equal(state.viewShortcuts.includes('preset:工艺属性检查'), false);
assert.equal(state.filters.customConditions.length, 1);
assert.equal(state.filters.customConditions[0].valTo, '2026-10-14');
const saved = captureUserSettings(); applyUserSettings(decodeUserConfig(configDoc(saved)));
assert.equal(state.filters.customConditions[0].valTo, '2026-10-14');
assert.equal(state.sort.key, 'material');
computeDerived(); assert.equal(derived.total, rows.filter((r)=>r.updated>='2026-10-01'&&r.updated<='2026-10-14'&&r.status==='有效').length);
console.log('PASS: date boundaries, compact input, incomplete ranges, AND/OR, legacy conditions, MPS isolation and config round trip.');
`, context);

context.navigator = {};
vm.runInContext(fs.readFileSync(path.join(root, 'outputs/advq/advq.views2.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'outputs/advq/advq.events.js'), 'utf8').replace(/init\(\);\s*$/, ''), context);
vm.runInContext(`
let exported;
download = (name, content) => { exported = { name, content }; };
toast = () => {};
state.filters.customConditions = []; state.filters.customLogic = 'AND'; computeDerived();
state.processCheckFilter.onlyIssue = true;
const nonRoute = derived.filtered.find((r) => !r.route && r.pdfCount > 0);
assert.ok(nonRoute);
assert.equal(processCheckRows().some((r) => r.material === nonRoute.material), true);
exportProcessChecksCsv();
assert.equal(exported.name.startsWith('工艺属性检查-'), true);
assert.equal(exported.content.includes('工艺属性检查问题数,工艺属性阻断数'), true);
assert.equal(exported.content.includes(nonRoute.material), true);
state.processCheckFilter.onlyIssue = false;
assert.equal(processCheckRows().length, derived.total);
exportProcessChecksCsv();
assert.equal(exported.name.includes('-' + derived.total + '条-'), true);
for (const key of MDM_HIDDEN_KEYS) assert.equal(Object.hasOwn(fullRecord(nonRoute), key), false);
exportMpsCsv();
assert.equal(exported.name.startsWith('MPS工艺路线'), true);
console.log('PASS: MDM process governance includes non-route materials; process and MPS exports are separate; calculation fields stay out of raw-field views.');
`, context);
