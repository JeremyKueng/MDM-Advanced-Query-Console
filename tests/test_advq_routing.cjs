// Run: node tests/test_advq_routing.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({URL,URLSearchParams,navigator:{}});
for(const name of ['core','events']) {
  const source=fs.readFileSync(path.join(root,`outputs/advq/advq.${name}.js`),'utf8').replace(/\ninit\(\);\s*$/, '');
  vm.runInContext(source,context);
}
const base='http://localhost:4173/outputs/'+encodeURIComponent('MDM高级查询工作台.html');
const material='DEMO-MAT-0001';
const run=code=>vm.runInContext(code,context);
function at(url){context.location=new URL(url);}
function build(code,template=''){context.code=code;context.template=template;return run('buildDetailDeepLinkUrl(code,template)');}
function parsed(){return JSON.parse(JSON.stringify(run('parseUrlDetailSpec()')));}
for(const current of [base,base+'/9900000002',base+'?m='+material,base+'?sku='+material,base+'#m='+material+'&tpl=old',base+'#'+material]){
  at(current);assert.equal(build(material),base+'/'+material,current);assert.equal(build(''),base);
}
at(base+'/'+material+'?m=old&tpl=preview');
assert.equal(parsed().material,material,'path takes precedence over an old query');
assert.equal(build(material),base+'/'+material);
at(base+'?keep=1&m='+material+'#m='+material);
const url=new URL(build(material,'template A'));
assert.equal(url.pathname,new URL(base).pathname+'/'+material);
assert.equal(url.searchParams.get('keep'),'1');
assert.equal(url.searchParams.get('tpl'),'template A');
assert.equal(url.searchParams.has('m'),false);
assert.equal(url.hash,'');
for(const legacy of ['?m='+material,'?sku='+material,'#'+material,'#/DEMO-MAT-0001','#m='+material+'&tpl=preview','#sku='+material]){
  at(base+legacy);assert.equal(parsed().material,material,legacy);
}
at(base+'/'+encodeURIComponent('物料 A'));
assert.equal(parsed().material,'物料 A');assert.equal(build('物料 A'),base+'/'+encodeURIComponent('物料 A'));
at('http://localhost:4173/mdm/old');
assert.equal(build(material),'http://localhost:4173/mdm/'+material);
assert.equal(parsed().material,'old');
at(base);assert.equal(parsed(),null);
const calls=[];
context.history={pushState(data,unused,url){calls.push({method:'push',data,url});at(url);},replaceState(data,unused,url){calls.push({method:'replace',data,url});at(url);}};
run(`state.detailPage=true; state.detail='${material}'; state.dpOverrideTplId=''; syncDetailUrl(false);`);
assert.equal(context.location.href,base+'/'+material);
assert.equal(calls[0].method,'push');
run('syncDetailUrl(false)');assert.equal(calls.length,1,'unchanged path does not duplicate browser history');
run('state.detailPage=false; state.detail=null; syncDetailUrl(false)');
assert.equal(context.location.href,base);
at(base+'?m='+material);run(`state.detailPage=true; state.detail='${material}'; syncDetailUrl(true);`);
assert.equal(context.location.href,base+'/'+material);
assert.equal(calls.at(-1).method,'replace','legacy link is normalized without adding a history entry');
console.log('PASS: canonical /material links, legacy query/hash conversion, template parameters, return path and history synchronization.');
