// Quick-preview drafts, schema isolation and durable configuration compatibility.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dataset=JSON.parse(fs.readFileSync(path.join(root,'outputs/advq/dataset.json')));
const PROCESS_DEFAULTS=JSON.parse(fs.readFileSync(path.join(root,'outputs/advq/process-rules.defaults.json')));
const ctx=vm.createContext({dataset,PROCESS_DEFAULTS,assert,console,navigator:{},setTimeout:()=>0,clearTimeout:()=>{}});
for(const name of ['core','process','config','views','views2','events'])vm.runInContext(fs.readFileSync(path.join(root,'outputs/advq/advq.'+name+'.js'),'utf8').replace(/init\(\);\s*$/,''),ctx);
vm.runInContext(`
DATASET=dataset;buildIndexes();applyUserSettings({v:6});computeDerived();
const original=JSON.stringify(state.quickDetailView), templates=JSON.stringify(state.dpTemplates), query=JSON.stringify(captureQueryContext());
assert.equal(state.quickDetailView.sections.length,4,'old settings receive the previous four sections');
const custom={version:1,columns:2,hideEmpty:true,showDescription:false,showAnalysis:false,showAllFields:false,sections:[
 {id:'weights',title:' 我的重量 ',enabled:true,fields:['gross','net','gross','route','pdfCount','removed-column']},
 {id:'maintenance',title:'维护',enabled:false,fields:['created','updated']},
 {id:'again',title:'重复引用',enabled:true,fields:['net']},
]};
quickDetailDraft=normalizeQuickDetailView(custom);quickDetailSectionId='weights';
assert.deepEqual(quickDetailDraft.sections[0].fields,['gross','net']);
assert.equal(quickDetailDraft.sections[0].title,'我的重量');
assert.equal(moveQuickDetailItem('field','net','gross'),true);
assert.deepEqual(quickDetailDraft.sections[0].fields,['net','gross']);
assert.equal(moveQuickDetailItem('field','no-such-field','net'),false);
assert.equal(moveQuickDetailItem('section','again','weights'),true);
assert.equal(quickDetailDraft.sections[0].id,'again');
assert.equal(JSON.stringify(state.quickDetailView),original,'editing a draft cannot apply or persist it');
const html=quickDetailSectionsHtml({net:0,gross:null,created:'2026-01-01'},quickDetailDraft);
assert.ok(html.includes('data-field="net"'));assert.ok(html.includes('>0<'),'hide empty must retain numeric zero');
assert.equal(html.includes('data-field="gross"'),false);assert.equal(html.includes('data-field="created"'),false,'a hidden section stays hidden');
assert.equal((html.match(/data-field="net"/g)||[]).length,2,'the same MDM field may appear in separate sections');
assert.ok(html.includes('columns-2'));
let writes=0,renders=0,closed=0,notice='',error={textContent:''};
saveState=()=>{writes++;};renderDetail=()=>{renders++;};closeQuickDetailConfig=()=>{closed++;quickDetailDraft=null;};toast=(message)=>{notice=message;};document={getElementById:()=>error};
personalConfig.available=true;
saveQuickDetailConfig();assert.equal(writes,1);assert.equal(renders,1);assert.equal(closed,1);assert.ok(notice.includes('已保存'));
assert.equal(state.quickDetailView.sections[0].id,'again');
assert.equal(JSON.stringify(state.dpTemplates),templates);assert.equal(JSON.stringify(captureQueryContext()),query,'quick-preview changes cannot alter full-detail templates or the query');
const stored=configDoc(captureUserSettings());applyUserSettings(decodeUserConfig(JSON.parse(JSON.stringify(stored))));
assert.equal(state.quickDetailView.columns,2);assert.deepEqual(state.quickDetailView.sections[1].fields,['net','gross']);
assert.equal(state.quickDetailView.showAnalysis,false);
for(const mutate of [v=>v.columns=4,v=>v.showAnalysis='false',v=>v.sections.push(v.sections[0]),v=>v.sections[0].title='',v=>v.sections[0].fields='net',v=>v.sections=[]]){
 const bad=JSON.parse(JSON.stringify(stored));mutate(bad.settings.quickDetailView);assert.throws(()=>decodeUserConfig(bad));
}
quickDetailDraft=normalizeQuickDetailView(state.quickDetailView);quickDetailDraft.sections.forEach(s=>s.enabled=false);
saveQuickDetailConfig();assert.equal(writes,1);assert.ok(error.textContent.includes('至少保留'));
let copied='';copyQueryText=(text)=>{copied=text;};document.querySelectorAll=()=>[];
state.detail=rows[0].material;
const copyButton={dataset:{act:'detail-copy-info'},closest:()=>null};
onClick({target:{closest:(selector)=>selector==='[data-act]'?copyButton:null}});
assert.ok(copied.includes('净重(kg)'));assert.ok(copied.includes('毛重(kg)'));
assert.equal(copied.includes('创建时间'),false,'copy info follows the saved visible sections rather than query-table columns');
console.log('PASS: quick-preview defaults, draft isolation, field/section order, hidden fields, numeric zero, save/round-trip and malformed-config rejection.');
`,ctx);
