// Preset order, result shortcuts and selected state must describe the same view.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dataset = JSON.parse(fs.readFileSync(path.join(root, 'outputs/advq/dataset.json')));
const ctx = vm.createContext({dataset, assert, console, navigator:{}, setTimeout:()=>0, clearTimeout:()=>{}});
for (const name of ['core', 'config', 'views', 'sorting', 'events']) {
  vm.runInContext(fs.readFileSync(path.join(root, `outputs/advq/advq.${name}.js`), 'utf8').replace(/init\(\);\s*$/, ''), ctx);
}
vm.runInContext(`
DATASET=dataset; buildIndexes();
const same=(a,b,msg="view order")=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const presets=Object.keys(DATASET.presets).filter(n=>n!=='工艺属性检查');
const selected=['preset:核心视图','view:mine','preset:包装视图','preset:123列全表头'];
const custom={id:'mine',name:'我的核对',visible:['brand'],order:['brand']};
applyUserSettings({v:8,savedViews:[custom],viewShortcuts:selected,presetViewOrder:['123列全表头',...presets.filter(n=>n!=='123列全表头')],activeFieldView:'preset:核心视图',visible:DATASET.presets['核心视图'],order:DATASET.presets['核心视图'],q:'保留搜索'});
same(state.viewShortcuts,['preset:123列全表头','view:mine','preset:核心视图','preset:包装视图'],'previously saved preset order also reorders result shortcuts');
let saves=0;
const result={innerHTML:''};
const nodes=presets.map(name=>({dataset:{v:name},attrs:{},active:false,classList:{toggle(key,on){this.owner.active=on;}},setAttribute(k,v){this.attrs[k]=v;}}));
nodes.forEach(n=>n.classList.owner=n);
const pool={children:nodes,appendChild(n){this.children.splice(this.children.indexOf(n),1);this.children.push(n);},contains(){return false;}};
document={activeElement:null,getElementById(id){return id==='resultViewShortcuts'?result:id==='fdPresetList'?pool:null;}};
saveState=()=>{saves++;}; toast=()=>{};
const rendered=()=>[...result.innerHTML.matchAll(/data-act="field-view-apply" data-v="([^"]+)"/g)].map(m=>m[1]);
const assertLinked=()=>{
 renderViewShortcuts(); syncPresetViewControls();
 same(rendered(),state.viewShortcuts,'result entry order matches saved order');
 same(pool.children.map(n=>n.dataset.v),mdmPresetNames(),'drawer order matches shared preset order');
};
assertLinked();
assert.equal(nodes.find(n=>n.dataset.v==='核心视图').attrs['aria-pressed'],'true');
assert.ok(result.innerHTML.includes('aria-pressed="true" data-act="field-view-apply" data-v="preset:核心视图"'));
const fields=JSON.stringify(orderedVisibleKeys()),filters=JSON.stringify(captureUserSettings().filters);
shortcutDraft=[...state.viewShortcuts,'preset:质量视图'];
assert.equal(movePresetView('包装视图','123列全表头'),true); assertLinked();
same(state.viewShortcuts,['preset:包装视图','view:mine','preset:123列全表头','preset:核心视图']);
assert.ok(shortcutDraft.includes('preset:质量视图'),'drag keeps pending shortcut selections');
assert.equal(state.q,'保留搜索'); assert.equal(JSON.stringify(orderedVisibleKeys()),fields); assert.equal(JSON.stringify(captureUserSettings().filters),filters);
assert.equal(state.activeFieldView,'preset:核心视图','drag does not apply the dragged view');
assert.equal(saves,1);
// The shortcut editor must update the drawer order in the other direction.
shortcutDraft=['preset:核心视图','view:mine','preset:包装视图','preset:123列全表头'];
onClick({target:{closest:()=>({dataset:{act:'save-shortcuts'},closest:()=>null})}}); assertLinked();
same(rendered(),shortcutDraft); assert.equal(saves,2);
const expectedShortcuts=[...shortcutDraft], stored=decodeUserConfig(configDoc(captureUserSettings()));
applyUserSettings(stored); assertLinked(); same(state.viewShortcuts,expectedShortcuts);
assert.equal(state.savedViews[0].id,'mine');
// Legacy configurations keep their deliberate shortcut order.
applyUserSettings({v:8,savedViews:[custom],viewShortcuts:['preset:包装视图','view:mine','preset:核心视图']}); assertLinked();
same(rendered(),['preset:包装视图','view:mine','preset:核心视图']);
assert.ok(mdmPresetNames().includes('工艺视图'),'unselected presets remain available');
for(const bad of [null,'核心视图',[1]])assert.throws(()=>decodeUserConfig({v:8,presetViewOrder:bad}));
console.log('PASS: preset/shortcut order linkage in both directions, selected-state parity, persistence, legacy order and query isolation.');
`, ctx);
