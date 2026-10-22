const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dataset=JSON.parse(fs.readFileSync(path.join(root,'outputs/advq/dataset.json'),'utf8'));
const context=vm.createContext({assert,dataset,console});
for(const name of ['core','config','views','views2']) vm.runInContext(fs.readFileSync(path.join(root,`outputs/advq/advq.${name}.js`),'utf8'),context);
vm.runInContext(String.raw`
DATASET=dataset;buildIndexes();
const same=(a,b,message)=>assert.equal(JSON.stringify(a),JSON.stringify(b),message);
const leaf=(field,op,val)=>({field,op,val});
const group=(logic,...conditions)=>({type:'group',logic,conditions});
const valid=rows.filter(r=>r.status==='有效');
const cases=[
 ['AND',[leaf('brand','notEmpty',''),group('OR',leaf('cat','eq','面巾'),leaf('cat','eq','餐巾'))],r=>!!r.brand&&(r.cat==='面巾'||r.cat==='餐巾')],
 ['OR',[group('AND',leaf('cat','eq','面巾'),leaf('pre','eq','Y')),group('AND',leaf('cat','eq','餐巾'),leaf('pre','eq','X'))],r=>r.cat==='面巾'&&r.pre==='Y'||r.cat==='餐巾'&&r.pre==='X'],
 ['AND',[group('OR',leaf('cat','eq','面巾'),group('AND',leaf('cat','eq','餐巾'),group('OR',leaf('pre','eq','Y'),leaf('pre','eq','X'))))],r=>r.cat==='面巾'||r.cat==='餐巾'&&(r.pre==='Y'||r.pre==='X')],
 ['AND',[leaf('desc','containsAny','面巾； 餐巾;不存在')],r=>r.desc.includes('面巾')||r.desc.includes('餐巾')],
 ['AND',[group('OR'),group('AND',leaf('created','gte','202601'))],()=>true],
];
for(const [logic,conditions,expected] of cases){
 state.filters=defaultQueryFilters();state.filters.customLogic=logic;state.filters.customConditions=conditions;
 computeDerived();same(derived.filtered.map(r=>r.material).sort(),valid.filter(expected).map(r=>r.material).sort());
 const ids=rowsInScope(['brands']).map(r=>r.material).sort();same(ids,valid.filter(expected).map(r=>r.material).sort(),'facets use the same nested condition');
}
assert.equal(evalDpCondition({desc:'Alpha Beta 包装' },leaf('desc','containsAny','missing; alpha beta；')) ,true);
assert.equal(evalDpCondition({desc:'Alpha Beta 包装' },leaf('desc','contains','missing; alpha beta')) ,false,'legacy contains stays literal');
assert.equal(evalDpCondition({desc:'面巾，餐巾' },leaf('desc','containsAny','面巾，餐巾')) ,true,'comma can remain literal');
assert.equal(customConditionReady(leaf('desc','containsAny',' ;； ')),false);
same(splitCustomValues('A; a； b\nB'),['a','b']);
state.filters.customConditions=[group('AND',group('OR',leaf('cat','eq','面巾'),leaf('updated','gte','20260101')))];
assert.equal(customFilterNode('0.0.1').field,'updated');
assert.equal(customFilterNode('0.0.9'),null);assert.equal(customFilterNode('0.__proto__'),null);
assert.equal(customFilterChildren('0.0').length,2);
const draft=captureQueryContext();
state.queryViews=[{id:'nested',name:'嵌套查询',context:draft}];
const settings=captureUserSettings();
assert.equal(settings.v,7);validateQueryViews(settings.queryViews);
applyUserSettings(decodeUserConfig(configDoc(settings)));
same(state.filters.customConditions,settings.filters.customConditions);
same(state.queryViews[0].context.filters.customConditions,draft.filters.customConditions);
state.filters.customConditions[0].conditions[0].conditions[0].val='餐巾';
assert.equal(draft.filters.customConditions[0].conditions[0].conditions[0].val,'面巾','saved queries are deep copies');
const html=renderCustomFilters();
assert.ok(html.includes('data-idx="0.0.1"'));assert.ok(html.includes('打开条件 1.1.2 日期日历'));
assert.ok(html.includes('包含任一项 (OR)'));assert.ok(html.includes('data-parent="0.0"'));
for(const bad of [[{type:'group',logic:'XOR',conditions:[]}],[{type:'group',logic:'AND',conditions:'bad'}],[{type:'group',logic:'AND',conditions:[{}]}]])assert.throws(()=>validateCustomConditions(bad));
let tooDeep=leaf('cat','eq','面巾');for(let i=0;i<9;i++)tooDeep=group('OR',tooDeep);
assert.throws(()=>validateCustomConditions([tooDeep]),/嵌套/);
const legacy={v:6,filters:{customLogic:'OR',customConditions:[leaf('cat','eq','面巾'),leaf('cat','eq','餐巾')]}};
applyUserSettings(decodeUserConfig(legacy));computeDerived();
assert.equal(derived.total,valid.filter(r=>r.cat==='面巾'||r.cat==='餐巾').length);
console.log('PASS: AND/OR nesting in both directions, deep groups, multi-value contains, empty drafts, shared facets, date paths, legacy migration and saved-query/config isolation.');
`,context);
