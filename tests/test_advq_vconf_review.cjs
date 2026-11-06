const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const dataset=JSON.parse(fs.readFileSync(path.join(root,'outputs/advq/dataset.json'),'utf8'));
const cases=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/vcode-review.json'),'utf8'));
const fixture=cases.flatMap(g=>g.members.map((m,i)=>({material:g.vcode+'-'+i,vcode:g.vcode,load:g.load,flags:'NUM:层数|VCONF',...m})));
const py=JSON.parse(cp.execFileSync('python3',['-c',"import json,sys;sys.path.insert(0,'scripts');from vcode_conflicts import rebuild_vcode_conflicts;print(json.dumps(rebuild_vcode_conflicts(json.load(sys.stdin))))"],{cwd:root,input:JSON.stringify(fixture),encoding:'utf8'}));
const ctx=vm.createContext({assert,dataset,cases,fixture,py,console,TextEncoder,navigator:{},setTimeout:()=>0,clearTimeout:()=>{}});
for(const name of ['core','config','views','views2','xlsx','events'])vm.runInContext(fs.readFileSync(path.join(root,`outputs/advq/advq.${name}.js`),'utf8').replace(/init\(\);\s*$/,''),ctx);
vm.runInContext(`
DATASET={...dataset,rows:fixture.map(f=>{const r={status:'有效',pre:'Y',spec:f.specC,specP:f.load,...f};return dataset.schema.map(s=>r[s.key]??null);})};
buildIndexes();applyUserSettings({v:8});computeStats();computeDerived();
for(const c of cases){
 const g=vconfByVcode.get(c.vcode), p=py.find(x=>x.vcode===c.vcode);
 assert.equal(g.reviewStatus,c.expectedStatus);assert.equal(g.conflictType,c.expectedType);
 for(const k of ['reviewStatus','conflictType','reviewReason','descriptionSpecs'])assert.equal(JSON.stringify(g[k]),JSON.stringify(p[k]),'Python/JS parity '+k);
 const row=byMaterial.get(c.vcode+'-0');assert.ok(row._flags.includes('NUM:层数'));assert.equal(row._flags.includes('VREVIEW'),c.expectedStatus==='待确认');
 assert.match(flagsChips(row),c.expectedStatus==='待确认' ? /同V码待确认/ : /同V码冲突/);
}
assert.equal(buildScopedVconfGroups().length,cases.length);
state.vconfFilter.status='待确认';assert.equal(filteredVconfGroups().length,2);
assert.equal(vconfExportTable().groups.length,2);
state.vconfFilter.q='REVIEW-A';assert.equal(vconfExportTable().rowCount,2);
state.vconfFilter.q='';state.vconfFilter.status='';state.vconfFilter.sort='vcode';
let exported;download=(name,content,mime)=>{exported={name,content,mime};};toast=()=>{};
exportVconfXlsx();assert.match(exported.name,/\\.xlsx$/);globalThis.exportBytes=exported.content;
assert.equal(vconfExportTable().headers[1],'冲突类型');assert.equal(vconfExportTable().rowCount,20);
const dom={innerHTML:''};document={getElementById:id=>id==='vconfBody'?dom:null};renderScopeLinkageBar=()=>'';buildDetailDeepLinkUrl=m=>'/'+m;renderVconf();
assert.match(dom.innerHTML,/待确认/);assert.match(dom.innerHTML,/同装数不同排列/);assert.match(dom.innerHTML,/is-review/);
state.q='REVIEW-A-0';computeDerived();assert.equal(vconfByVcode.size,0,'filtering to one specification clears both conflict and review');
assert.ok(rows.every(r=>!r._flags.includes('VREVIEW')));
`,ctx);
const book=Buffer.from(ctx.exportBytes).toString('base64');
const verify=`import base64,io,sys,zipfile,openpyxl
raw=base64.b64decode(sys.stdin.read()); z=zipfile.ZipFile(io.BytesIO(raw)); assert z.testzip() is None
w=openpyxl.load_workbook(io.BytesIO(raw));s=w.active
assert s.max_row==21 and s.max_column==18
assert s.freeze_panes=='B2' and s.auto_filter.ref=='A1:R21'
assert s['A2'].data_type=='s' and s['F2'].data_type=='s' and s['J2'].data_type=='n'
assert s['A2'].fill.fgColor.rgb==s['A3'].fill.fgColor.rgb
assert s['A3'].fill.fgColor.rgb!=s['A4'].fill.fgColor.rgb
assert s['C2'].value=='待确认' and s['B2'].value=='同装数不同排列'
assert s['Q2'].value=='2×46' and '说明均为' in s['R2'].value
assert s['A2'].alignment.wrap_text
print('PASS: native XLSX structure, text identifiers, numeric counts, grouped bands, filters and evidence.')`;
console.log(cp.execFileSync('python3',['-c',verify],{input:book,encoding:'utf8'}).trim());
console.log('PASS: conservative downgrade, Python/browser parity, filtered export, status chips and scoped recomputation.');
