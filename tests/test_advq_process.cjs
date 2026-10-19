const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dataset=JSON.parse(fs.readFileSync(path.join(root,'outputs/advq/dataset.json'))),defaults=JSON.parse(fs.readFileSync(path.join(root,'outputs/advq/process-rules.defaults.json')));
const context=vm.createContext({console,dataset,assert,PROCESS_DEFAULTS:defaults});
for(const name of ['core','process','config','views','events'])vm.runInContext(fs.readFileSync(path.join(root,`outputs/advq/advq.${name}.js`),'utf8').replace(/init\(\);\s*$/,''),Object.assign(context,{navigator:{}}));
vm.runInContext(`
DATASET=dataset;buildIndexes();validateProcessConfig(PROCESS_DEFAULTS);
const original=rows.map((r)=>({flags:[...r._flags].sort().join('|'),count:r.issueCount,block:r.blocking,route:r.route,pdf:r.pdfCount}));
applyProcessRules(PROCESS_DEFAULTS);
rows.forEach((r,i)=>{assert.equal([...r._flags].sort().join('|'),original[i].flags,r.material);assert.equal(r.issueCount,original[i].count);assert.equal(r.blocking,original[i].block);});
console.log('PASS: default rules exactly match original flags and MDM totals on '+rows.length+' rows.');
const changed=processClone(PROCESS_DEFAULTS);changed.rules.find((r)=>r.no===2).enabled=false;
const trial=prTrial(changed);assert.ok(trial.changed>0);assert.ok(trial.after.hits<=trial.before.hits);
assert.equal(rows[0].issueCount,original[0].count,'trial must not mutate rows');
processConfig=changed;applyProcessRules(changed);computeDerived();
for(const r of rows){assert.equal(r._flags.some((f)=>/^PF.:2:/.test(f)),false);assert.equal(r.pdfCount,r._flags.filter((f)=>f.startsWith('PF')).length);assert.equal(r.issueCount,r._flags.length);assert.equal(r.blocking,Number(r._flags.some((f)=>BLOCKING_TYPES.includes(f.split(':')[0]))));}
const custom=processClone(PROCESS_DEFAULTS);custom.rules.push({id:'custom',no:12,title:'自定义重量上限',enabled:true,scope:{logic:'AND',conditions:[]},checks:[{id:'c1',enabled:true,message:'重量超上限',code:'PFC',when:{field:'净重',op:'gt',value:5}}]});
processConfig=custom;applyProcessRules(custom);const run=compileProcessConfig(custom);rows.forEach((r)=>{const expected=r._processIncluded&&processNumber(r._processContext['净重'])>5;assert.equal(r._flags.includes('PFC:12:重量超上限'),Boolean(expected));});
const s=decodeUserConfig(configDoc(captureUserSettings()));applyUserSettings(s);assert.equal(processConfig.rules.at(-1).id,'custom');assert.equal(rows.filter((r)=>r._flags.includes('PFC:12:重量超上限')).length,rows.filter((r)=>r._processIncluded&&processNumber(r._processContext['净重'])>5).length);
processDraft=processClone(custom);prSet('scope',{logic:'AND',conditions:[]});assert.equal(prGet('scope').conditions.length,0);
const f=processExpression('([净重] + 2) * -3 / 2',new Set(['净重']));assert.equal(f({'净重':4}),-9);assert.equal(processExpression('[净重] / 0')({'净重':1}),null);assert.equal(processExpression('[净重] + 1')({'净重':'待定'}),null);
for(const expr of ['globalThis.alert(1)','[不存在]+1','[净重] +','1e999','[净重] ** 2'])assert.throws(()=>processExpression(expr,new Set(['净重'])));
for(const mutate of [(c)=>c.rules[0].checks[0].when={field:'route',op:'empty'},(c)=>c.rules[0].checks[0].code='NUM',(c)=>c.rules[0].checks[0].message='a|b',(c)=>c.rules[0].no=2,(c)=>c.scope={logic:'OR',conditions:[]},(c)=>c.rules[0].checks=[]]){const c=processClone(PROCESS_DEFAULTS);mutate(c);assert.throws(()=>validateProcessConfig(c));}
for(const field of ['创建时间','最后更新时间']){
  assert.equal(compileProcessNode({field,op:'between',value:'20260101',valueTo:'2026-01-31'})({[field]:'2026-01-31 18:25:00'}),true);
  assert.equal(compileProcessNode({field,op:'gte',value:'2026/1/2'})({[field]:'2026-01-01'}),false);
  const bad=processClone(PROCESS_DEFAULTS);bad.scope={field,op:'between',value:'20260229',valueTo:'20260301'};assert.throws(()=>validateProcessConfig(bad));
}
console.log('PASS: trial is isolated, disable/custom rules, statistics, persistence round trip, arithmetic and invalid-input rejection.');
`,context);
