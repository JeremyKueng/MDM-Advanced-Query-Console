const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const counts={};
const page={style:{},getBoundingClientRect:()=>({top:-300})};
const window={scrollY:400,scrollX:0,innerHeight:800,scrollTo:p=>{window.scrollY=p.top;}};
const context=vm.createContext({assert,counts,console,window,document:{querySelector:()=>page},state:{tab:'results'},saveStateDebounced:()=>{},page});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../outputs/advq/advq.views2.js'),'utf8'),context);
vm.runInContext(`
for(const name of ['computeDerived','renderTabs','renderSearchAssist','renderFilters','renderBasket','renderQueryWorkspace','renderResults','renderPager','renderViewSeg','renderResultLine','renderFocus','renderVconf','renderAnalyze','renderRules','renderProcessChecks','renderMps','renderDetail','renderDetailPage','renderDpConfigModal','renderFieldDrawer','renderCompare']) {
 this[name]=()=>{counts[name]=(counts[name]||0)+1;if(name==='renderTabs')window.scrollY=0;};
}
refreshAll();assert.equal(counts.computeDerived,1);assert.equal(counts.renderResults,1);assert.equal(window.scrollY,400);
assert.equal(page.style.minHeight,'1100px');
switchWorkspaceTab('mps');assert.equal(counts.computeDerived,1,'switches do not recompute global filters');
assert.equal(counts.renderResults,1,'switches do not rebuild hidden all-field tables');assert.equal(counts.renderFilters,1,'switches keep the filter DOM');assert.equal(counts.renderMps,1);assert.equal(window.scrollY,400);
switchWorkspaceTab('results');switchWorkspaceTab('mps');assert.equal(counts.renderMps,1,'revisit reuses the unchanged panel');
refreshAll();assert.equal(counts.computeDerived,2);assert.equal(counts.renderMps,2);assert.equal(counts.renderResults,1,'global changes render only the visible panel');
switchWorkspaceTab('results');assert.equal(counts.renderResults,2,'hidden panels invalidate when global data changes');
for(const tab of ['focus','vconf','analyze','rules','process','mps','results'])switchWorkspaceTab(tab);
assert.equal(counts.computeDerived,2);assert.equal(window.scrollY,400);
const toolContent={scrollTop:0};document.getElementById=id=>id==='toolsContent'?toolContent:null;
switchWorkspaceTab('mps');toolContent.scrollTop=155;switchWorkspaceTab('focus');assert.equal(toolContent.scrollTop,0,'a newly opened tool starts at the top');
toolContent.scrollTop=77;switchWorkspaceTab('mps');assert.equal(toolContent.scrollTop,155,'tool scroll positions remain independent');
switchWorkspaceTab('results');switchWorkspaceTab('focus');assert.equal(toolContent.scrollTop,77,'closing tools preserves their scroll state');
console.log('PASS: panel switches skip global recomputation and hidden tables, preserve filter DOM and scroll, reuse cached panels, and invalidate after filter changes.');
`,context);
