const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(__dirname, '..'), dataset = JSON.parse(fs.readFileSync(path.join(root, 'outputs/advq/dataset.json'), 'utf8'));
const context = vm.createContext({ assert, dataset, console });
for (const name of ['core', 'config', 'views', 'columns']) vm.runInContext(fs.readFileSync(path.join(root, `outputs/advq/advq.${name}.js`), 'utf8'), context);
vm.runInContext(`
DATASET=dataset; buildIndexes(); applyUserSettings({v:7});
const ids=rs=>rs.map(r=>r.material).sort().join(',');
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
assert.equal(Object.keys(state.filters.columnFilters).length,0,'legacy config starts without column filters');
const valid=rows.filter(r=>r.status==='有效');
const brand=valid.find(r=>r.brand)?.brand, cat=valid.find(r=>r.brand===brand)?.cat;
state.filters.columnFilters={brand:[columnValueKey(brand)]};computeDerived();
assert.equal(ids(derived.filtered),ids(valid.filter(r=>columnValueKey(r.brand)===brand)));
assert.equal(columnFilterOptions('brand').reduce((a,o)=>a+o.count,0),valid.length,'options ignore own column filter');
state.filters.columnFilters.cat=[columnValueKey(cat)];computeDerived();
assert.equal(ids(derived.filtered),ids(valid.filter(r=>columnValueKey(r.brand)===brand&&columnValueKey(r.cat)===cat)),'columns intersect');
assert.equal(columnFilterOptions('brand').reduce((a,o)=>a+o.count,0),valid.filter(r=>r.cat===cat).length,'options honor other column filters');
state.filters.columnFilters.brand=[brand,'missing-value'];computeDerived();
assert.equal(columnFilterOptions('brand').find(o=>o.value==='missing-value').count,0,'out-of-scope selections remain editable');
state.filters.customConditions=[{field:'pre',op:'eq',val:'Y'}];computeDerived();
assert.equal(ids(derived.filtered),ids(valid.filter(r=>r.brand===brand&&r.cat===cat&&r.pre==='Y')),'custom groups and column filters intersect');
assert.ok(buildActiveFilterLinkageTags('sm').some(h=>h.includes('column-filter-clear')),'removable chips survive hidden columns and empty results');
const saved=captureQueryContext(), settings=captureUserSettings(); settings.queryViews=[{id:'column',name:'表头查询',context:saved}];
assert.equal(settings.v,8);applyUserSettings(decodeUserConfig(configDoc(settings)));
same(state.filters.columnFilters,saved.filters.columnFilters);
state.filters.columnFilters.brand.push('changed');assert.ok(!saved.filters.columnFilters.brand.includes('changed'),'saved query column values are deep copies');
assert.ok(!settings.filters.columnFilters.brand.includes('changed'),'personal configuration snapshot is a deep copy');
state.filters=defaultQueryFilters();computeDerived();assert.equal(derived.total,valid.length,'reset clears columns');
assert.equal(columnValueKey(null),'');assert.equal(columnValueKey(''), '');assert.equal(columnValueKey(0),'0');assert.notEqual(columnValueKey('无'),'');
assert.equal(columnValueKey(1.234567), '1.2346','filters use displayed precision');
assert.ok(compareColumnValues('2','10','number')<0);assert.ok(compareColumnValues('2026-01-01','2026-02-01','date')<0);assert.ok(compareColumnValues(null,2,'number',-1)>0,'blank values stay last in descending order');
for(const bad of [null,[],{brand:'A'},{brand:[1]},{constructor:['bad']}])assert.throws(()=>validateColumnFilters(bad));
const clean=normalizeColumnFilters({brand:['A','A'],routeStatus:['完整'],unknown:['x']});same(clean,{brand:['A']},'unknown and MPS-only fields are excluded');
const sample=valid.find(r=>r.vcode);state.q=sample.vcode;state.qMode='smart';state.qField='all';state.sort={key:'material',dir:-1,explicit:true};computeDerived();
const sorted=[...derived.filtered].sort((a,b)=>compareColumnValues(a.material,b.material,'text',-1));assert.equal(ids(sorted),ids(derived.filtered));same(derived.filtered.map(r=>r.material),sorted.map(r=>r.material),'explicit header sorting overrides search relevance');
const restored=captureUserSettings();applyUserSettings(decodeUserConfig(configDoc(restored)));assert.equal(state.sort.explicit,true);
// Frozen columns, central columns, clipped edge columns and narrow viewports keep the selected column clear.
for(const [rect, viewport, side] of [
 [{left:20,right:160},1280,'right'],
 [{left:500,right:800},1280,'right'],
 [{left:1050,right:1200},1280,'left'],
 [{left:300,right:1000},1280,'left'],
 [{left:-60,right:160},1280,'right'],
 [{left:1150,right:1500},1280,'left'],
 [{left:20,right:150},390,'inline'],
 [{left:180,right:560},640,'inline']]) {
 const p=columnMenuPlacement(rect,340,viewport);assert.equal(p.side,side);
 if(p.side==='inline')continue;
 assert.ok(p.left>=12 && p.left+p.width<=viewport-12,'menu stays inside the viewport');
 assert.ok(p.left>=rect.right+10 || p.left+p.width<=rect.left-10,'menu never covers the current column');
}
const menu={query:'a b',options:[{value:'A xx B'},{value:'A only'},{value:''}]};same(columnMenuMatches(menu).map(o=>o.value),['A xx B']);menu.query='空白';assert.equal(columnMenuMatches(menu).length,1);
rows=[{...valid[0],material:'001',vcode:'ZX'},{...valid[0],material:'999',vcode:'ZX-more'}];
state.q='ZX';state.qField='vcode';state.sort={key:'material',dir:-1};computeDerived();assert.equal(derived.filtered[0].material,'001','default sorting promotes the exact code');
state.sort.explicit=true;computeDerived();assert.equal(derived.filtered[0].material,'999','chosen descending order overrides an exact search hit');
console.log('PASS: column-value grouping, intersections, self-excluding facets, zero-count values, reset, configuration/query isolation, explicit sorting, and menu search.');
`, context);
