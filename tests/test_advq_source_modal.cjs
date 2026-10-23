// Opening and local import must never wait for a slow/unavailable shared drive.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../outputs/advq/advq.events.js'), 'utf8').replace(/init\(\);\s*$/, '');
const tick = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
const response = info => ({ok:true, json:async () => info});
const healthInfo = {ok:true,service:'mdm-advanced-query-console'};
function shareInfo(platform) {
  return {ok:true, shareUnc:'\\\\files.example.invalid\\demo', shareSmb:'smb://files.example.invalid/demo',
    latestCandidate:{name:'materials-demo.xlsx',path:'examples/materials-demo.xlsx'}, shareCandidates:[],
    shareStatus:{overall:'connected',platform:platform==='Win32'?'win':'mac',network:{ok:true},auth:{ok:true},mount:{ok:true,mountPoint:'demo'},files:[]}};
}
function fixture(platform, fetch, timers = {}) {
  const nodes = new Map();
  function element(id, parent = null) {
    const classes = new Set();
    let html = '';
    const el = {parent,style:{},disabled:false,value:'',textContent:'',classList:{
      add:(...keys)=>keys.forEach(k=>classes.add(k)),remove:(...keys)=>keys.forEach(k=>classes.delete(k)),contains:k=>classes.has(k)}};
    Object.defineProperty(el,'innerHTML',{get:()=>html,set:value=>{
      for(const [key,node] of nodes) {
        for(let owner=node.parent;owner;owner=owner.parent) {
          if(owner===el) { nodes.delete(key); break; }
        }
      }
      html = value;
      for(const match of value.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const child = element(match[1],el);
        child.disabled = /\sdisabled(?:\s|>)/.test(match[0]);
        child.value = (match[0].match(/\bvalue="([^"]*)"/) || [,''])[1];
      }
    }});
    nodes.set(id,el);
    return el;
  }
  const mask=element('modal-mask'), box=element('modal-box');
  element('excelUploadInput');
  const context = vm.createContext({navigator:{platform},location:{protocol:'http:',search:''},
    document:{getElementById:id=>nodes.get(id)||null},fetch,AbortController,setTimeout,clearTimeout,...timers,
    DATASET:{meta:{source:'materials-demo.xlsx',sourceRows:192,sourcePath:'examples/materials-demo.xlsx',shareUnc:''}},
    ic:()=>'',esc:value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    renderSourceLineage:()=>'<div>演示来源</div>',syncBodyScrollLock:()=>{},console});
  vm.runInContext(source,context);
  return {context,nodes,mask,box};
}
async function slowShare(platform) {
  const health=deferred(), scan=deferred(), calls=[];
  const f=fixture(platform,url=>{calls.push(url);return url.endsWith('/api/health')?health.promise:scan.promise;});
  const opening=f.context.openSourceModal();
  assert.ok(f.mask.classList.contains('open'),'dialog opens synchronously, before health responds');
  assert.equal(typeof f.nodes.get('modalCloseSrc').onclick,'function','close is immediately available');
  assert.ok(f.box.innerHTML.includes('materials-demo.xlsx'));
  assert.ok(f.nodes.get('sourceSharePanel').innerHTML.includes('正在检查共享盘'));
  const input=f.nodes.get('srcLocalPathInput'), picker=f.nodes.get('btnRoute1Pick');
  input.value='my-materials.xlsx';
  assert.ok(picker.disabled);
  health.resolve(response(healthInfo));
  await tick();
  assert.equal(picker.disabled,false,'local import is ready while the SMB scan is still pending');
  assert.ok(f.nodes.get('btnRoute2Auto').disabled,'shared import waits for a valid report');
  scan.resolve(response(shareInfo(platform)));
  await opening;
  assert.equal(f.nodes.get('srcLocalPathInput'),input,'background response never rebuilds the local input');
  assert.equal(input.value,'my-materials.xlsx');
  assert.equal(f.nodes.get('btnRoute1Pick'),picker);
  assert.equal(f.nodes.get('btnRoute2Auto').disabled,false);
  assert.ok(f.nodes.get('sourceConnectionDetails').innerHTML.includes(platform==='Win32'?'UNC 路径直连':'本地卷挂载'));
  assert.ok(f.nodes.get('sourceConnectionDetails').innerHTML.includes(shareInfo(platform).shareUnc));
  f.nodes.get('modalCloseSrc').onclick();
  assert.equal(f.mask.classList.contains('open'),false);
  assert.equal(f.box.style.width,'');
  await f.context.openSourceModal();
  assert.equal(calls.filter(url=>url.endsWith('/api/source-info')).length,1,'reopening reuses recent scan results');
}
async function lateResults(platform, closeAtHealth) {
  const health=deferred(), scan=deferred();
  const f=fixture(platform,url=>url.endsWith('/api/health')?health.promise:scan.promise);
  const opening=f.context.openSourceModal();
  if(!closeAtHealth) { health.resolve(response(healthInfo)); await tick(); }
  f.nodes.get('modalCloseSrc').onclick();
  f.box.innerHTML='<h3>另一个窗口</h3>';
  health.resolve(response(healthInfo));
  scan.resolve(response(shareInfo(platform)));
  await opening;
  assert.equal(f.mask.classList.contains('open'),false,'late response must not reopen a closed modal');
  assert.equal(f.box.innerHTML,'<h3>另一个窗口</h3>','late response must not overwrite another modal');
}
async function sharedRequests(platform) {
  const scan=deferred();let scans=0;
  const f=fixture(platform,url=>{
    if(url.endsWith('/api/health')) return Promise.resolve(response(healthInfo));
    scans++;return scan.promise;
  });
  const warm=f.context.warmSourceInfo();
  await tick();
  const first=f.context.openSourceModal();
  await tick();
  f.nodes.get('modalCloseSrc').onclick();
  const second=f.context.openSourceModal();
  await tick();
  const input=f.nodes.get('srcLocalPathInput');input.value='retained.xlsx';
  assert.equal(scans,1,'startup and repeated openings share an in-flight scan');
  scan.resolve(response(shareInfo(platform)));
  await Promise.all([warm,first,second]);
  assert.ok(f.mask.classList.contains('open'));
  assert.equal(input.value,'retained.xlsx');
  assert.equal(f.nodes.get('srcLocalPathInput'),input);
}
async function failureAndRetry(platform) {
  let scans=0;
  const f=fixture(platform,url=>{
    if(url.endsWith('/api/health')) return Promise.resolve(response(healthInfo));
    scans++;
    return scans===1?Promise.reject(new Error('共享盘暂不可达')):Promise.resolve(response(shareInfo(platform)));
  });
  await f.context.openSourceModal();
  assert.equal(f.nodes.get('btnRoute1Pick').disabled,false,'failed diagnostics do not disable local import');
  assert.ok(f.nodes.get('sourceConnectionDetails').innerHTML.includes('共享盘暂不可达'));
  const input=f.nodes.get('srcLocalPathInput');input.value='retry.xlsx';
  await f.nodes.get('btnRetryConnectApi').onclick();
  assert.equal(scans,2);
  assert.equal(f.nodes.get('btnRoute2Auto').disabled,false);
  assert.equal(input.value,'retry.xlsx');
  await f.context.loadSourceInfo('',true);
  assert.equal(scans,3,'explicit recheck bypasses the recent-result cache');
}
async function offline(platform) {
  const calls=[];
  const f=fixture(platform,url=>{calls.push(url);return Promise.reject(new Error('offline'));});
  await f.context.openSourceModal();
  assert.ok(f.mask.classList.contains('open'));
  assert.ok(f.nodes.get('btnRoute1Pick').disabled);
  assert.ok(f.nodes.get('sourceConnectionDetails').innerHTML.includes('后台服务待连接'));
  if(platform==='Win32') assert.ok(f.nodes.get('sourceConnectionDetails').innerHTML.includes('复制 Windows 共享路径'));
  assert.ok(calls.every(url=>url.endsWith('/api/health')),'offline discovery never scans a shared drive');
}
async function timeout() {
  const timers=new Map();let signal,serial=0;
  const f=fixture('Win32',(_url,options)=>{signal=options.signal;return new Promise(()=>{});},
    {setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)});
  const pending=f.context.sourceJson('/api/source-info',15000);
  assert.equal(timers.size,1);
  [...timers.values()][0]();
  await assert.rejects(pending,/超时/);
  assert.ok(signal.aborted,'timed-out fetch is aborted');
  assert.equal(timers.size,0,'timeout is cleaned up');
}
async function serviceIdentity() {
  const calls=[];
  const f=fixture('Win32',url=>{
    calls.push(url);
    return Promise.resolve(response(url.startsWith('http://127.0.0.1:4173')?healthInfo:{ok:true,service:'unrelated-service'}));
  });
  const {base}=await f.context.resolveApiBase();
  assert.equal(base,'http://127.0.0.1:4173','ignore a healthy service belonging to another app');
  assert.equal(calls.length,2);
}
async function changedPathDuringScan() {
  const old=deferred(), fresh=deferred();let count=0;
  const f=fixture('Win32',()=> (++count===1?old.promise:fresh.promise));
  const first=f.context.loadSourceInfo('');
  const second=f.context.loadSourceInfo('',true);
  const current=shareInfo('Win32');current.latestCandidate.path='new-directory/materials.xlsx';
  fresh.resolve(response(current));await second;
  old.resolve(response(shareInfo('Win32')));await first;
  assert.equal(count,2,'a path change starts a fresh scan while the old path is still pending');
  assert.equal(vm.runInContext('LAST_SOURCE_INFO.info.latestCandidate.path',f.context),'new-directory/materials.xlsx','late old-path scans cannot replace the new directory');
}
async function main() {
  for(const platform of ['Win32','MacIntel']) {
    await slowShare(platform);
    await lateResults(platform,true);
    await lateResults(platform,false);
    await sharedRequests(platform);
    await failureAndRetry(platform);
    await offline(platform);
  }
  await changedPathDuringScan();
  await timeout();
  await serviceIdentity();
  console.log('PASS: immediate source dialog, local import before SMB checks, retained input, cache/coalescing, close races, retry, offline and timeout on Windows/macOS branches.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
