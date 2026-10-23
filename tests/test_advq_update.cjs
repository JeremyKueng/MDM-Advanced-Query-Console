const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../outputs/advq/advq.update.js'),'utf8');
function fixture(phases,protocol='http:') {
 const calls=[],saved=[],messages=[];
 const nodes=new Map(['btnAppUpdate','appUpdateStatus'].map(id=>[id,{disabled:false,textContent:'',hidden:false,innerHTML:'',classList:{toggle(){}}}]));
 let reloads=0,index=0,posts=0;
 const profile={v:8,savedViews:[{id:'v1',name:'My view'}],processRules:{rules:['keep']},filters:{columnFilters:{brand:['keep']}}};
 const context=vm.createContext({console,AbortController,setTimeout:(fn,ms)=>ms===900?setImmediate(fn):setTimeout(fn,ms),clearTimeout,
  document:{getElementById:id=>nodes.get(id)},location:{protocol,reload:()=>reloads++},ic:()=>'',toast:(...args)=>messages.push(args),
  personalConfig:{available:true,endpoint:'/api/user-config'},configWriting:false,configQueued:null,
  saveState:()=>{},captureUserSettings:()=>profile,configDoc:settings=>({settings}),configRequest:async(_url,options)=>{saved.push(JSON.parse(options.body));return {ok:true};},
  resolveApiBase:async()=>({base:'',info:{ok:true}}),
  fetch:async(url,options)=>{calls.push({url,options});
   if(options.method==='POST') {posts++;return {ok:true,status:202,json:async()=>({ok:true,jobId:'one',phase:'checking',message:'checking'})};}
   const phase=phases[Math.min(index++,phases.length-1)];
   if(phase==='disconnect')throw new Error('service restarting');
   return {ok:true,status:200,json:async()=>({ok:true,jobId:'one',phase,message:phase})};
  }});
 vm.runInContext(source,context);
 return {context,calls,saved,messages,nodes,profile,get reloads(){return reloads;},get posts(){return posts;}};
}
async function main(){
 const f=fixture(['preparing','restarting','disconnect','updated']);
 const pending=f.context.checkWorkbenchUpdate();assert.equal(f.context.checkWorkbenchUpdate(),pending,'double clicks share one update task');
 await pending;assert.equal(f.posts,1);assert.equal(f.reloads,1);assert.equal(f.saved.length,2,'configuration flushes before update and again before reload');
 for(const doc of f.saved)assert.deepEqual(doc.settings,f.profile,'views, rules and active filters survive the reload');
 assert.equal(f.nodes.get('btnAppUpdate').disabled,false);
 const settings=fixture(['latest']);
 for(const id of ['srcSharePathInput','btnSaveSharePath','sourceSettingsStatus']) settings.nodes.set(id,{value:'',disabled:true,textContent:''});
 let resolveSettings, savedPath, refreshed=false;
 settings.context.LAST_SOURCE_INFO={old:true};
 settings.context.fetch=async (_url, options)=>{
  if(options.method==='POST') {savedPath=JSON.parse(options.body).sharePath;return {ok:true,status:200,json:async()=>({ok:true})};}
  return new Promise(resolve=>{resolveSettings=resolve;});
 };
 settings.context.bindSourceSettingsEditor(()=>true,force=>{refreshed=force;});
 await new Promise(setImmediate);
 const input=settings.nodes.get('srcSharePathInput');input.value='Z:/my-reports';input.oninput();
 resolveSettings({ok:true,status:200,json:async()=>({ok:true,settings:{sharePath:'Z:/old-reports',shareDirs:[]}})});
 await new Promise(setImmediate);assert.equal(input.value,'Z:/my-reports','late source settings never overwrite a path being edited');
 await settings.nodes.get('btnSaveSharePath').onclick();assert.equal(savedPath,'Z:/my-reports');assert.equal(refreshed,true);
 assert.equal(settings.context.LAST_SOURCE_INFO,null,'saving a path invalidates the old shared-drive result');
 const latest=fixture(['latest']);await latest.context.checkWorkbenchUpdate();assert.equal(latest.reloads,0,'latest version does not reload or reset a query');
 const failed=fixture(['error']);await failed.context.checkWorkbenchUpdate();assert.equal(failed.reloads,0);assert.equal(failed.nodes.get('btnAppUpdate').disabled,false,'failure allows retry');
 await failed.context.checkWorkbenchUpdate();assert.equal(failed.posts,2);
 const offline=fixture(['latest'],'file:');await offline.context.checkWorkbenchUpdate();assert.equal(offline.posts,0,'file pages cannot start code updates');
 console.log('PASS: update de-duplication, restart reconnection, reload only after success, exact config preservation, latest/no-reload, failure/retry, and file-page guard.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
