// Search docking contract: original control identity, focus, scroll continuity and mobile controls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function element(rect){
 const values=new Map(),classes=new Set(),listeners={};
 return {style:{height:'',minHeight:'',getPropertyValue:k=>values.get(k)||'',setProperty:(k,v)=>values.set(k,v)},listeners,
  classList:{toggle:(k,on)=>on?classes.add(k):classes.delete(k),contains:k=>classes.has(k)},
  getBoundingClientRect:rect,addEventListener:(k,f)=>{listeners[k]=f;},setAttribute(){},contains(el){return el===this;}};
}
const win={scrollY:0,innerHeight:720,innerWidth:1280,matchMedia:()=>({matches:win.innerWidth<=900}),addEventListener(){},scrollTo:({top})=>{win.scrollY=top;}};
const doc={activeElement:null,addEventListener(){}};
const input=element(()=>({}));input.value='样例渠道';input.selectionStart=1;input.selectionEnd=2;
input.focus=options=>{doc.activeElement=input;input.focusOptions=options;};
const brand={},actions={};
const header=element(()=>({top:0,bottom:60,height:60,width:win.innerWidth}));header.querySelector=s=>s==='.brand'?brand:actions;
const slot=element(()=>({left:230,width:650}));
const anchor=element(()=>({top:135-win.scrollY}));
const main=element(()=>({height:main.classList.contains('is-docked')?40:60}));main.contains=el=>el===input;
const page=element(()=>({top:60-win.scrollY})),open=element(()=>({})),close=element(()=>({}));
open.focus=()=>{doc.activeElement=open;};
const wrap={scrollTop:400},ids={topbarSearchSlot:slot,qSearchAnchor:anchor,qSearchMain:main,qInput:input,qDockOpen:open,qDockClose:close,mainTableWrap:wrap};
doc.getElementById=k=>ids[k];doc.querySelector=s=>s==='.topbar'?header:s==='main.page'?page:null;
let frames=[];const ctx=vm.createContext({window:win,document:doc,state:{detailPage:false},ic:()=>'',closeQueryOptions(){},requestAnimationFrame:f=>{frames.push(f);return frames.length;},assert});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../outputs/advq/advq.searchdock.js'),'utf8'),ctx);
vm.runInContext('bindSearchDock()',ctx);
const dock=vm.runInContext('searchDock',ctx);
const update=()=>{dock.update();const pending=frames;frames=[];pending.forEach(f=>f());};
assert.equal(main.classList.contains('is-docked'),false);
win.scrollY=74;update();assert.equal(main.classList.contains('is-docked'),false);
win.scrollY=75;doc.activeElement=input;update();assert.equal(main.classList.contains('is-docked'),true);
assert.equal(anchor.style.height,'60px');assert.equal(main.style.getPropertyValue('--dock-top'),'10px');
assert.equal(doc.activeElement,input);assert.equal(input.selectionStart,1);assert.equal(input.selectionEnd,2);
win.scrollY=330;const position=dock.beforeSearch();
assert.equal(position,330);assert.ok(parseFloat(page.style.minHeight)>=990,'empty results must leave space for the current scroll position');
dock.afterSearch(position);assert.equal(win.scrollY,330);assert.equal(wrap.scrollTop,0);
win.innerWidth=390;dock.focus();assert.equal(header.classList.contains('search-expanded'),true);
assert.equal(doc.activeElement,input);assert.equal(input.focusOptions.preventScroll,true);
assert.equal(main.style.getPropertyValue('--dock-width'),'326px');assert.equal(actions.inert,true);
close.listeners.click();assert.equal(header.classList.contains('search-expanded'),false);assert.equal(doc.activeElement,open);
open.listeners.click();assert.equal(header.classList.contains('search-expanded'),true);assert.equal(doc.activeElement,input);
win.scrollY=0;update();assert.equal(main.classList.contains('is-docked'),false);
assert.equal(anchor.style.height,'');assert.equal(page.style.minHeight,'');assert.equal(actions.inert,false);assert.equal(input.value,'样例渠道');
win.scrollY=330;update();ctx.state.detailPage=true;update();assert.equal(main.classList.contains('is-docked'),false);
console.log('PASS: search docking threshold, original input/focus/selection, empty-result scroll continuity, mobile expansion, restoration and full-detail isolation.');
