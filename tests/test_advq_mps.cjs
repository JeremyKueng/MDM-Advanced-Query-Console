// MPS facet counts must describe the next selection, using the other active filters.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dataset = JSON.parse(fs.readFileSync(path.join(root, 'outputs/advq/dataset.json')));
const PROCESS_DEFAULTS = JSON.parse(fs.readFileSync(path.join(root, 'outputs/advq/process-rules.defaults.json')));
const ctx = vm.createContext({dataset, PROCESS_DEFAULTS, assert, console, navigator:{}, setTimeout:()=>0, clearTimeout:()=>{}});
for (const name of ['core','process','config','views','views2','events']) vm.runInContext(fs.readFileSync(path.join(root, 'outputs/advq/advq.' + name + '.js'),'utf8').replace(/init\(\);\s*$/,''), ctx);
vm.runInContext(`
DATASET = dataset; buildIndexes(); applyUserSettings({v:6}); computeDerived();
const originalIssues = routeIssueMap;
const routeRow = (material,ruleCat,routeStatus,route='路线') => ({material,ruleCat,routeStatus,route});
const fixture = [routeRow('A','面巾','完整'),routeRow('B','面巾','待补设备规则'),routeRow('C','面巾','逻辑异常'),routeRow('D','卫卷','待补MDM'),routeRow('E','卫卷','完整'),routeRow('F','纸巾','待补MDM+设备规则'),routeRow('G','餐巾','完整'),routeRow('H','面巾','待补设备规则','')];
routeIssueMap = new Map([
 ['B',[['中','设备规则未覆盖'],['中','设备规则未覆盖'],['中','临时规则应用']]],
 ['C',[['高','包装层级冲突'],['高','包装层级冲突']]],
 ['D',[['中','包装数组缺失']]],['E',[['中','临时规则应用']]],
 ['F',[['中','设备规则未覆盖'],['中','包装数组缺失']]],['H',[['中','设备规则未覆盖']]],
]);
derived.filtered = fixture;
state.mpsFilter = {status:'',cat:'面巾',issueType:'',onlyIssue:false,page:1};
let panel = mpsPanelData();
assert.equal(panel.list.length,3);
assert.equal(new Map(panel.issueTypes).get('设备规则未覆盖'),1,'two equipment issues on one SKU count once');
assert.equal(panel.statusCounts['完整'],1);
state.mpsFilter.status='逻辑异常';panel=mpsPanelData();
assert.equal(panel.list.length,1);assert.equal(new Map(panel.issueTypes).get('设备规则未覆盖'),0);
assert.equal(panel.catCounts['面巾'],1);assert.equal(panel.catCounts['卫卷']||0,0);
assert.equal(panel.resultStatusCounts['完整']||0,0);
// Preserve a legacy impossible selection, reporting zero and allowing it to be removed.
state.mpsFilter.issueType='设备规则未覆盖';panel=mpsPanelData();
assert.equal(panel.list.length,0);assert.equal(panel.statusCounts['待补设备规则'],1);
assert.equal(new Map(panel.issueTypes).get('包装层级冲突'),1);
assert.equal(new Map(panel.issueTypes).get('设备规则未覆盖'),0);
let rendered = {innerHTML:''};document = {getElementById:id=>id==='mpsBody'?rendered:null};syncTableXnav=()=>{};
renderMps();
assert.ok(rendered.innerHTML.includes('data-mps-total="0"'));
const selectedIssue = rendered.innerHTML.match(/<button[^>]*data-act="mps-issue-type"[^>]*data-v="设备规则未覆盖"[^>]*>/)[0];
assert.ok(selectedIssue.includes(' on'));
assert.equal(selectedIssue.includes('disabled'),false,'a zero-result selected option must remain removable');
let exported,notice;download=(name,content)=>{exported={name,content};};toast=(message)=>{notice=message;};
exportMpsCsv();assert.equal(exported,undefined);assert.ok(notice.includes('没有可导出'));
state.mpsFilter.status='';exportMpsCsv();
assert.ok(exported.name.includes('-1条-'));assert.ok(exported.content.includes('B,'));assert.equal(exported.content.includes('C,'),false);
state.mpsFilter={status:'',cat:'',issueType:'已消失的问题',onlyIssue:false,page:1};
assert.equal(new Map(mpsPanelData().issueTypes).get('已消失的问题'),0);
// Changing the global scope must feed every facet, while MPS stays independent of process governance.
derived.filtered=[fixture[0],fixture[1]];state.mpsFilter={status:'',cat:'',issueType:'',onlyIssue:true,page:1};
panel=mpsPanelData();assert.equal(panel.scoped.length,2);assert.equal(panel.list.length,1);assert.equal(panel.catCounts['卫卷']||0,0);assert.equal(panel.withRouteIssue,1);

routeIssueMap=originalIssues;computeDerived();
const globalRows=[...derived.filtered], issues=[...new Set(globalRows.flatMap(r=>(routeIssueMap.get(r.material)||[]).map(x=>x[1])))];
const expected = (source,f) => source.filter(r=>r.route && (!f.status || r.routeStatus===f.status) && (!f.cat || r.ruleCat===f.cat) && (!f.issueType || (routeIssueMap.get(r.material)||[]).some(x=>x[1]===f.issueType)) && (!f.onlyIssue || r.routeStatus!=='完整' || (routeIssueMap.get(r.material)||[]).length));
let combinations=0;
for(const source of [globalRows,globalRows.filter(r=>r.pre==='Y').slice(0,1800)]) {
 derived.filtered=source;
 for(const status of ['', '完整','待补MDM','待补设备规则','待补MDM+设备规则','逻辑异常']) for(const cat of ['', '面巾','卫卷','纸巾','餐巾']) for(const issueType of ['',...issues]) for(const onlyIssue of [false,true]) {
  const f=state.mpsFilter={status,cat,issueType,onlyIssue,page:1}, p=mpsPanelData(), actual=expected(source,f);
  assert.equal(p.list.length,actual.length);
  assert.equal(Object.values(p.resultStatusCounts).reduce((s,n)=>s+n,0),actual.length);
  for(const s of ['完整','待补MDM','待补设备规则','待补MDM+设备规则','逻辑异常']) assert.equal(p.statusCounts[s]||0,expected(source,{...f,status:s}).length);
  for(const c of ['面巾','卫卷','纸巾','餐巾']) assert.equal(p.catCounts[c]||0,expected(source,{...f,cat:c}).length);
  for(const [t,count] of p.issueTypes) assert.equal(count,expected(source,{...f,issueType:t}).length);
  assert.equal(p.statusScope.length,expected(source,{...f,status:''}).length);
  assert.equal(p.catScope.length,expected(source,{...f,cat:''}).length);
  assert.equal(p.issueScope.length,expected(source,{...f,issueType:''}).length);
  assert.equal(p.withRouteIssue,expected(source,{...f,onlyIssue:true}).length);
  combinations++;
 }
}
// Construct enough fictional logical issues to test paging independently of demo distribution.
const pageFixture=[...globalRows,...Array.from({length:60},(_,i)=>({...globalRows.find(r=>r.route),material:'DEMO-PAGE-'+i,routeStatus:'逻辑异常'}))];
derived.filtered=pageFixture;state.mpsFilter={status:'逻辑异常',cat:'',issueType:'',onlyIssue:false,page:9999};
const fullMatches=expected(pageFixture,state.mpsFilter);assert.ok(fullMatches.length>50);
renderMps();assert.equal(state.mpsFilter.page,Math.ceil(fullMatches.length/50));
assert.ok(rendered.innerHTML.includes('data-mps-total="'+fullMatches.length+'"'));
exportMpsCsv();assert.ok(exported.name.includes('-'+fullMatches.length+'条-'),'export all filtered rows, not just the current page');
console.log('PASS: MPS cross-facets, SKU deduplication, KPI/result agreement, zero-result recovery and matching exports; '+combinations+' combinations across global scopes.');
`,ctx);
