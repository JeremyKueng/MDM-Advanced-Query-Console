// Opening the data-source dialog must work before any shared drive is configured, on both platforms.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../outputs/advq/advq.events.js'), 'utf8').replace(/init\(\);\s*$/, '');
function element() {
  const classes = new Set();
  return {style:{},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)}};
}
async function check(platform, info) {
  const mask = element(), box = element();
  const nodes = new Map([['modal-mask',mask],['modal-box',box],['excelUploadInput',element()]]);
  let html = '';
  Object.defineProperty(box,'innerHTML',{get:()=>html,set:value=>{
    html=value;
    for(const match of value.matchAll(/\bid="([^"]+)"/g)) nodes.set(match[1],element());
  }});
  const context = vm.createContext({navigator:{platform},document:{getElementById:id=>nodes.get(id)||null},
    DATASET:{meta:{source:'materials-demo.xlsx',sourceRows:192,sourcePath:'examples/materials-demo.xlsx',shareUnc:''}},
    ic:()=>'',esc:value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    renderSourceLineage:()=>'<div>演示来源</div>',syncBodyScrollLock:()=>{},console});
  vm.runInContext(source,context);
  context.resolveApiBase=async()=>({base:'',info});
  await context.openSourceModal();
  assert.equal(mask.classList.contains('open'),true,platform+' must show its dialog');
  assert.ok(html.includes('更新数据源'));assert.ok(html.includes('materials-demo.xlsx'));
  assert.equal(/id="btnRoute1Pick" disabled/.test(html),!info);
  if(info) assert.ok(html.includes(info.shareUnc.replace(/&/g,'&amp;')),'configured share is read after discovery');
  else assert.ok(html.includes('本地服务未连接'));
  if(platform==='Win32') assert.ok(html.includes(info?'UNC 路径直连':'复制 Windows 共享路径'));
  nodes.get('modalCloseSrc').onclick();
  assert.equal(mask.classList.contains('open'),false);assert.equal(box.style.width,'');
}
async function main() {
  for(const platform of ['Win32','MacIntel']) {
    await check(platform,null);
    await check(platform,{ok:true,shareUnc:'\\\\files.example.invalid\\demo',shareSmb:'smb://files.example.invalid/demo',shareStatus:{overall:'connected',platform:platform==='Win32'?'win':'mac',network:{ok:true},auth:{ok:true},mount:{ok:true,mountPoint:'demo'},files:[]}});
  }
  console.log('PASS: source dialog opens and closes on Windows/macOS, with and without a local service, using discovered share settings.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
