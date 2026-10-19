// User-facing lookup regressions: scope explanations, batch reconciliation and saved-query isolation.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dataset = JSON.parse(fs.readFileSync(path.join(root, 'outputs/advq/dataset.json')));
const PROCESS_DEFAULTS = JSON.parse(fs.readFileSync(path.join(root, 'outputs/advq/process-rules.defaults.json')));
const ctx = vm.createContext({ dataset, PROCESS_DEFAULTS, assert, console, URL, location: {href:'http://localhost:4190/outputs/workbench.html'}, navigator: {}, setTimeout: () => 0, clearTimeout: () => {} });
for (const name of ['core', 'process', 'config', 'views', 'views2', 'events']) vm.runInContext(fs.readFileSync(path.join(root, `outputs/advq/advq.${name}.js`), 'utf8').replace(/init\(\);\s*$/, ''), ctx);
vm.runInContext(`
DATASET = dataset; buildIndexes(); applyUserSettings({v:6});
assert.equal(state.filterCollapsed, true);
assert.deepEqual(orderedVisibleKeys(), QUERY_FIELD_BUNDLES['日常查料']);
assert.equal(state.basket.length, 0);
// Auto-detected batches must not stick to future ordinary searches.
assert.equal(parseQuerySpec('9900000002\\n9900000003', 'smart', 'all').mode, 'batch');
assert.equal(parseQuerySpec('示例商店 面巾', 'smart', 'all').mode, 'smart');
assert.equal(parseQuerySpec('DEMO-V0001 DEMO-V0002', 'smart', 'all').mode, 'batch');
assert.equal(parseQuerySpec('DEMO-MAT-0001 DEMO-MAT-0002', 'smart', 'all').mode, 'batch');
assert.equal(parseQuerySpec('1x3x12 130mm', 'smart', 'all').mode, 'smart', 'specifications and dimensions are search terms');
applyUserSettings({v:6,qMode:'batch',q:'DEMO-V0001 DEMO-V0002'});
assert.equal(state.qMode,'smart','legacy batch preference migrates to automatic smart search');
computeDerived(); assert.equal(state._qSpec.mode,'batch');
applyUserSettings({v:6});
// A code is the full-detail permalink; the separate quick-preview action remains on the description.
const detailCell = cellHtml('material', rows[0], 0, true);
assert.ok(detailCell.includes('data-act="open-detail-page"'));
assert.ok(detailCell.includes('href="'));
assert.ok(cellHtml('desc', rows[0], 3, true).includes('data-act="view-detail"'));
derived.pageRows = [rows[0]];
assert.ok(renderCards(orderedVisibleKeys()).includes('data-act="open-detail-page"'));
const grouped = new Map();
for (const r of rows) if (r.vcode) { const list = grouped.get(r.vcode) || []; list.push(r); grouped.set(r.vcode, list); }
const shared = [...grouped].find(([,list]) => list.length > 1);
const single = rows.find((r) => r.vcode !== shared[0] && !shared[1].some((a) => a.material === r.material));
state.filters = defaultQueryFilters('');
state.q = [shared[0], single.material, 'NO-SUCH-MDM-TEST-CODE', single.material].join('\\n'); state.qMode = 'smart'; state.qField = 'all'; computeDerived();
let report = querySearchReport();
assert.equal(report.batch.total, 3); assert.equal(report.batch.repeated, 1);
assert.equal(report.batch.found.length, 2); assert.equal(report.batch.missing.length, 1);
assert.ok(report.batch.ambiguous.some((x) => x.code === shared[0].toUpperCase()));
state.filters.brands.add('不存在的品牌'); computeDerived(); report = querySearchReport();
assert.equal(derived.total, 0); assert.ok(report.globalTotal > 0);
assert.equal(report.batch.excluded.length, 2); assert.equal(report.batch.missing.length, 1);
// Save a task with custom date conditions and a specified field set.
state.filters = defaultQueryFilters(''); state.filters.customConditions = [{field:'created',op:'gte',val:'20260101'}];
state.q = '示例商店'; state.qMode = 'smart'; state.qField = 'all';
state.visible = QUERY_FIELD_BUNDLES['维护信息']; state.order = [...state.visible, ...schemaKeys.filter((k) => !state.visible.includes(k))];
state.sort = {key:'updated',dir:-1}; computeDerived();
const expectedIds = derived.filtered.map((r) => r.material);
const stored = {id:'q1',name:'维护核对',context:normalizeQueryContext(captureQueryContext())};
state.queryViews = [stored]; state.activeQueryView = stored.id;
const oldViews = [{id:'legacy',name:'旧字段视图',visible:['brand','cat'],order:['brand','cat']}];
state.savedViews = oldViews;
const saved = decodeUserConfig(configDoc(captureUserSettings()));
const legacyQuery = JSON.parse(JSON.stringify(saved.queryViews[0].context)); legacyQuery.qMode='batch';
assert.equal(normalizeQueryContext(legacyQuery).qMode,'smart');
const templates = JSON.stringify(state.dpTemplates), rules = JSON.stringify(processConfig);
applyUserSettings(saved); assert.equal(state.queryViews.length, 1);
assert.equal(state.savedViews[0].name, '旧字段视图'); assert.equal(queryViewDirty(state.queryViews[0]), false);
// Restore only the saved query, leaving rules, templates, basket and MPS-local preferences intact.
state.q = '不存在'; state.filters = defaultQueryFilters(); state.sort = {key:'material',dir:1};
state.basket = [single.material]; basketSet.add(single.material); state.mpsFilter.cat = '卫卷';
let input = {value:'',style:{},scrollHeight:44}; document = {getElementById:()=>input};
resizeSearchInput = ()=>{}; toast = ()=>{}; refreshAll = ()=>computeDerived();
applyQueryView('q1');
assert.equal(state.q, '示例商店'); assert.equal(state.sort.key, 'updated'); assert.equal(state.sort.dir, -1);
assert.deepEqual(derived.filtered.map((r)=>r.material), expectedIds);
assert.equal(JSON.stringify(state.dpTemplates), templates); assert.equal(JSON.stringify(processConfig), rules);
assert.equal(state.basket[0], single.material); assert.equal(state.mpsFilter.cat, '卫卷');
assert.equal(queryViewDirty(state.queryViews[0]), false);
// Old field-only views must keep the current query and filters.
syncSavedViewControls=()=>{}; renderViewShortcuts=()=>{};
applyVisibleListOrder=(keys)=>{state.visible=[...PINNED_KEYS,...keys.filter((k)=>!PINNED_KEYS.includes(k))];};
const oldQuery = JSON.stringify(captureQueryContext().filters); applyFieldView('view:legacy');
assert.equal(state.q, '示例商店'); assert.equal(JSON.stringify(captureQueryContext().filters), oldQuery);
assert.equal(queryViewDirty(state.queryViews[0]), true);
// Malformed imported tasks must be rejected before replacing a usable configuration.
for (const mutate of [s=>s.queryViews[0].context.filters.brands='示例品牌13', s=>s.queryViews[0].context.qMode='invalid', s=>s.queryViews.push(s.queryViews[0])]) {
 const bad = JSON.parse(JSON.stringify(saved)); mutate(bad); assert.throws(()=>decodeUserConfig(bad));
}
// Clearing a keyword from either search position keeps scope, matching mode and business filters.
state.q='样例渠道';state.qField='desc';state.qMode='exact';state.page=3;
state.filters.brands.add('示例品牌13');state.filterCollapsed=true;state._autoCollapsedBySearch=true;
const clearFields=JSON.stringify(state.visible),clearFilters=JSON.stringify(captureQueryContext().filters);
let focusOptions=null;input.value=state.q;input.focus=(options)=>{focusOptions=options;};
document.querySelectorAll=()=>[];
const clearButton={dataset:{act:'clear-q'},closest:()=>null};
onClick({target:{closest:(selector)=>selector==='[data-act]'?clearButton:null}});
assert.equal(state.q,'');assert.equal(input.value,'');assert.equal(state.page,1);
assert.equal(state.qField,'desc');assert.equal(state.qMode,'exact');
assert.equal(JSON.stringify(captureQueryContext().filters),clearFilters);assert.equal(JSON.stringify(state.visible),clearFields);
assert.equal(state.filterCollapsed,true);assert.equal(focusOptions.preventScroll,true);
console.log('PASS: daily defaults, transient batch detection, deduplication, missing/excluded/ambiguous codes, saved-query round trip and restoration isolation, legacy field views and malformed imports.');
`, ctx);
