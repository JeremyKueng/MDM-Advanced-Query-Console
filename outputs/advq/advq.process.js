/* 工艺属性条件引擎。只解析字段、数字、四则运算；配置与物料数据独立保存。 */
let processConfig = null, processDraft = null, processSelected = '', processPreview = null;
const PROCESS_NA = new Set(['无','无要求','无节距','不适用','n/a','na','N/A','-','—','/']);
const PROCESS_OPS = {eq:'等于',neq:'不等于',contains:'包含',notContains:'不包含',prefix:'开头是',notPrefix:'开头不是',in:'属于（多项）',notIn:'不属于（多项）',empty:'为空 / 不适用',notEmpty:'不为空',junk:'非数字文字',gt:'大于 >',gte:'大于等于 ≥',lt:'小于 <',lte:'小于等于 ≤',between:'在区间内（含边界）',numberIn:'数值属于（多项）',nonzero:'可解析为非零数字',icontains:'包含（忽略大小写）',grossName:'包含“毛重:N克/g”',difference:'计算结果超出容差'};
const PROCESS_DATE_FIELDS = new Set(['创建时间','最后更新时间']);
const PROCESS_CODES = {PFM:'必填缺失 · 提示',PFN:'数值异常 · 阻断',PFC:'逻辑矛盾 · 阻断',PFI:'规范提示 · 提示',PFP:'一致性待核 · 待确认'};
const processClone = (v) => JSON.parse(JSON.stringify(v));
function processClean(v) {
  if (v == null || typeof v === 'number' && !Number.isFinite(v)) return null;
  const s = String(v).trim();
  return !s || PROCESS_NA.has(s.replace(/^[（）()]+|[（）()]+$/g,'').trim()) ? null : typeof v === 'string' ? s : v;
}
function processNumber(v) {
  v = processClean(v); if (v === null) return null;
  const s = String(v).replace(/,/g,'').trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
function processFields() {
  const aliases = DATASET.processAliases || {};
  return [...Object.keys(aliases).map((key) => ({key,label:key})), ...(DATASET.mdmFields || []).map((key) => ({key,label:key})), {key:'$ruleCat',label:'规则品类（计算）'},{key:'$specP',label:'物料规格乘积（计算）'}];
}
function processContext(row, idx) {
  const out = {};
  for (const [raw,key] of Object.entries(DATASET.processAliases || {})) out[raw] = row[key];
  for (const key of DATASET.mdmFields || []) out[key] = row[key];
  const values = (DATASET.processRawRows || [])[idx];
  if (values) (DATASET.processRawKeys || []).forEach((key,i) => { out[key] = values[i]; });
  out.$ruleCat = row.ruleCat; out.$specP = row.specP;
  return out;
}
function processExpression(source, known) {
  if (typeof source !== 'string' || !source.trim() || source.length > 300) throw new Error('计算式为空或过长');
  const tokens = source.match(/\[[^\[\]]+\]|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[()+*/-]|\S/g) || []; let pos=0;
  function parse(min=0) {
    if (pos>=tokens.length) throw new Error('计算式不完整');
    const t=tokens[pos++]; let node;
    if (t==='+' || t==='-') node={type:'unary',op:t,value:parse(3)};
    else if (t==='(') { node=parse(); if (tokens[pos++]!==')') throw new Error('计算式括号未闭合'); }
    else if (t.startsWith('[')) { const key=t.slice(1,-1); if (known && !known.has(key)) throw new Error('未知计算字段：'+key); node={type:'field',key}; }
    else { const n=processNumber(t); if (n===null) throw new Error('计算式只支持字段、数字和四则运算'); node={type:'number',value:n}; }
    while (['+','-','*','/'].includes(tokens[pos])) { const op=tokens[pos], prec=['*','/'].includes(op)?2:1; if (prec<min) break; pos++; node={type:'binary',op,left:node,right:parse(prec+1)}; }
    return node;
  }
  const ast=parse(); if (pos!==tokens.length) throw new Error('计算式含未识别内容');
  function calc(n,row) {
    if (n.type==='field') return processNumber(row[n.key]);
    if (n.type==='number') return n.value;
    if (n.type==='unary') { const v=calc(n.value,row); return v===null?null:n.op==='-'?-v:v; }
    const l=calc(n.left,row), r=calc(n.right,row); if (l===null || r===null || n.op==='/' && r===0) return null;
    const v=n.op==='+'?l+r:n.op==='-'?l-r:n.op==='*'?l*r:l/r; return Number.isFinite(v)?v:null;
  }
  return (row) => calc(ast,row);
}
function compileProcessNode(node) {
  if (node.logic) {
    const cs=node.conditions.map(compileProcessNode);
    return node.logic==='NOT'?(r)=>!cs[0](r):node.logic==='OR'?(r)=>cs.some((c)=>c(r)):(r)=>cs.every((c)=>c(r));
  }
  const {op,field}=node;
  if (op==='difference') {
    const left=processExpression(node.left), right=processExpression(node.right);
    return (r)=>{const l=left(r),v=right(r),ref=node.reference?processNumber(r[node.reference]):v;return l!==null&&v!==null&&ref!==null&&Math.abs(l-v)>Math.max(node.absolute||0,Math.abs(ref)*(node.relative||0));};
  }
  const parts=String(node.value??'').split(/[、,，;；\n]/).map((x)=>x.trim()).filter(Boolean);
  return (r)=>{
    const v=processClean(r[field]), s=v===null?'':String(v), rhs=node.otherField?processClean(r[node.otherField]):node.value??'', t=rhs===null?'':String(rhs);
    if(PROCESS_DATE_FIELDS.has(field)&&['eq','neq','gt','gte','lt','lte','between'].includes(op)){
      const date=isoDate(v), other=isoDate(rhs), to=isoDate(node.valueTo);if(!date||!other)return false;
      return op==='eq'?date===other:op==='neq'?date!==other:op==='gt'?date>other:op==='gte'?date>=other:op==='lt'?date<other:op==='lte'?date<=other:!!to&&date>=other&&date<=to;
    }
    if(op==='empty')return v===null;if(op==='notEmpty')return v!==null;
    if(op==='junk')return v!==null&&!/\p{Nd}/u.test(s);
    if(op==='grossName')return /毛重[：:]?\s*\d+(?:\.\d+)?\s*[克g]/.test(s);
    if(op==='eq')return s===t;if(op==='neq')return s!==t;
    if(op==='contains')return s.includes(t);if(op==='notContains')return !s.includes(t);if(op==='icontains')return s.toLowerCase().includes(t.toLowerCase());
    if(op==='prefix')return s.startsWith(t);if(op==='notPrefix')return !s.startsWith(t);
    const items=node.otherField?t.split(/[、,，;；\n]/).map((x)=>x.trim()).filter(Boolean):parts;
    if(op==='in')return items.includes(s);if(op==='notIn')return !items.includes(s);
    const n=processNumber(v);if(op==='nonzero')return n!==null&&n!==0;
    if(op==='numberIn')return v!==null&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)&&items.map(Number).includes(Number(s));
    const other=processNumber(rhs);if(n===null||other===null)return false;if(op==='between'){const to=processNumber(node.valueTo);return to!==null&&n>=other&&n<=to;}const eps=node.epsilon||0;
    return op==='gt'?n>other+eps:op==='gte'?n>=other-eps:op==='lt'?n<other-eps:op==='lte'?n<=other+eps:false;
  };
}
function validateProcessConfig(config) {
  if(!config||config.version!==1||!Array.isArray(config.rules)||config.rules.length>100)throw new Error('工艺规则配置格式不正确（最多100组）');
  const known=new Set(processFields().map((f)=>f.key));let count=0;
  function node(c,depth=0) {
    if(++count>4000||depth>10||!c||typeof c!=='object')throw new Error('规则条件过多或嵌套过深');
    if(c.logic!==undefined){if(!['AND','OR','NOT'].includes(c.logic)||!Array.isArray(c.conditions))throw new Error('条件组合无效');if(c.logic==='NOT'&&c.conditions.length!==1)throw new Error('取反条件须有且只有一项');if(c.logic==='OR'&&!c.conditions.length)throw new Error('任一条件组不能为空');c.conditions.forEach((x)=>node(x,depth+1));return;}
    if(!Object.hasOwn(PROCESS_OPS,c.op))throw new Error('不支持的条件运算');if(c.op==='between'&&c.otherField)throw new Error('区间请使用两个固定边界');
    if(c.op==='difference'){processExpression(c.left,known);processExpression(c.right,known);for(const k of ['absolute','relative'])if(typeof(c[k]??0)!=='number'||!Number.isFinite(c[k]??0)||(c[k]??0)<0)throw new Error('容差须为非负数字');if(c.reference&&!known.has(c.reference))throw new Error('未知容差字段');return;}
    if(!known.has(c.field))throw new Error('请选择有效字段：'+(c.field||''));if(c.otherField&&!known.has(c.otherField))throw new Error('请选择有效比较字段');
    if(typeof(c.epsilon??0)!=='number'||!Number.isFinite(c.epsilon??0)||(c.epsilon??0)<0)throw new Error('数值精度无效');
    if(!['empty','notEmpty','junk','grossName','nonzero'].includes(c.op)&&!c.otherField){if(String(c.value??'').trim()==='')throw new Error('请填写条件值');if(['eq','neq','gt','gte','lt','lte','between'].includes(c.op)&&PROCESS_DATE_FIELDS.has(c.field)){if(!isoDate(c.value))throw new Error('日期请输入完整的 YYYYMMDD 或 YYYY-MM-DD');}
      else if(['gt','gte','lt','lte','between'].includes(c.op)&&processNumber(c.value)===null)throw new Error('大小比较必须填写数字');
      if(c.op==='between'){const from=PROCESS_DATE_FIELDS.has(c.field)?isoDate(c.value):processNumber(c.value),to=PROCESS_DATE_FIELDS.has(c.field)?isoDate(c.valueTo):processNumber(c.valueTo);if(to===null||to===''||from>to)throw new Error('请填写完整且起止正确的区间');} 
      if(c.op==='numberIn'&&String(c.value).split(/[、,，;；\n]/).some((x)=>processNumber(x)===null))throw new Error('可选数值列表含无效数字');}
  }
  node(config.scope);const ids=new Set(),nos=new Set();
  for(const rule of config.rules){
    if(typeof rule.id!=='string'||!rule.id||ids.has(rule.id)||!Number.isInteger(rule.no)||rule.no<=0||nos.has(rule.no))throw new Error('规则标识或编号无效/重复');ids.add(rule.id);nos.add(rule.no);
    if(typeof rule.title!=='string'||!rule.title.trim()||rule.title.length>100)throw new Error('请填写规则名称（最多100字）');
    if(typeof rule.enabled!=='boolean'||!Array.isArray(rule.checks)||rule.checks.length>100)throw new Error('规则检查项格式错误');node(rule.scope);
    if(rule.enabled&&!rule.checks.some((c)=>c&&c.enabled))throw new Error('启用的规则至少需要一个启用检查项：'+rule.title);
    const cids=new Set();for(const c of rule.checks){if(!c||typeof c.id!=='string'||!c.id||cids.has(c.id))throw new Error('检查项标识重复或无效');cids.add(c.id);if(typeof c.enabled!=='boolean'||!Object.hasOwn(PROCESS_CODES,c.code))throw new Error('检查项级别无效');if(typeof c.message!=='string'||!c.message.trim()||c.message.length>180||/[|:\n\r]/.test(c.message))throw new Error('问题提示须为1–180字，不能包含冒号、竖线或换行');node(c.when);}
  }
  return config;
}
function compileProcessConfig(config) {
  const scope=compileProcessNode(config.scope), groups=config.rules.filter((r)=>r.enabled).map((r)=>({no:r.no,scope:compileProcessNode(r.scope),checks:r.checks.filter((c)=>c.enabled).map((c)=>({...c,test:compileProcessNode(c.when)}))}));
  return (r)=>{const flags=[];if(scope(r))for(const g of groups)if(g.scope(r))for(const c of g.checks)if(c.test(r)){const f=c.code+':'+g.no+':'+c.message;if(!flags.includes(f))flags.push(f);}return flags;};
}
function processActiveConfig() { return processConfig || PROCESS_DEFAULTS; }
function processInScope(r) { return r._processIncluded !== undefined ? r._processIncluded : compileProcessNode(processActiveConfig().scope)(r._processContext || processContext(r,rows.indexOf(r))); }
function applyProcessRules(config) {
  validateProcessConfig(config); const run=compileProcessConfig(config), inScope=compileProcessNode(config.scope);
  rows.forEach((r,i)=>{
    r._processContext=processContext(r,i);r._processIncluded=inScope(r._processContext);const pf=run(r._processContext);
    r._flags=[...r._flags.filter((f)=>!f.startsWith('PF')),...pf];r.flags=r._flags.join('|');r.pdfCount=pf.length;r.pdfBlock=pf.filter((f)=>/^(PFN|PFC):/.test(f)).length;
    r.issueCount=r._flags.length;r._st=searchTextOf(r);r.blocking=r._flags.some((f)=>BLOCKING_TYPES.includes(f.split(':')[0]))?1:0;
  });
  const metas=[{no:0,id:'pdf-scope',title:'适用范围',gov:'supplement',desc:processNodeText(config.scope)}].concat(config.rules.map((r)=>({no:r.no,id:r.id,title:r.title+(r.enabled?'':'（已停用）'),enabled:r.enabled,gov:'numeric',desc:processRuleText(r)})));
  DATASET.pdfRules=metas; DATASET.rules=(DATASET.rules||[]).filter((r)=>r.no===undefined).concat(metas.map((r)=>({...r,group:'工艺属性自动检查（可配置规则）'})));
  if(state.filters.onlyPdfRule&&!config.rules.some((r)=>r.enabled&&String(r.no)===state.filters.onlyPdfRule))state.filters.onlyPdfRule='';
  computeStats();
}
function processNodeText(n) {
  if(n.logic){const text=n.conditions.map(processNodeText).join(n.logic==='OR'?' 或 ':' 且 ');return n.logic==='NOT'?'不满足（'+text+'）':text?'（'+text+'）':'全部物料';}
  if(n.op==='difference')return n.left+' 与 '+n.right+' 差异超出容差（绝对 '+n.absolute+'，比例 '+(n.relative*100)+'%'+(n.reference?'，基准 '+n.reference:'')+'）';
  return n.field+' '+PROCESS_OPS[n.op]+(['empty','notEmpty','junk','nonzero','grossName'].includes(n.op)?'':' '+(n.otherField?'['+n.otherField+']':n.value));
}
function processRuleText(r) {return '适用：'+processNodeText(r.scope)+'；'+(r.checks.filter((c)=>c.enabled).map((c)=>processNodeText(c.when)+' → '+c.message+'（'+PROCESS_CODES[c.code]+'）').join('；')||r.description||'尚未添加检查项');}
/* 编辑器只写草稿；试算不改结果，保存后统一生效。 */
const prId=()=> 'pr_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
function prGet(path) {if(!path)return processDraft;return path.split('.').reduce((o,k)=>o[k],processDraft);}
function prSet(path,value) {const parts=path.split('.'),key=parts.pop();prGet(parts.join('.'))[key]=value;}
function prFieldOptions(value) {return '<option value="">选择字段</option>'+processFields().map((f)=>'<option value="'+esc(f.key)+'"'+(f.key===value?' selected':'')+'>'+esc(f.label)+'</option>').join('');}
function prInput(path,value,placeholder='',type='text') {return '<input type="'+type+'" data-pr-path="'+path+'" value="'+esc(value??'')+'" placeholder="'+esc(placeholder)+'"'+(type==='number'?' min="0" step="any"':'')+'>';}
function prSelect(path,options,value) {return '<select data-pr-path="'+path+'">'+Object.entries(options).map(([key,label])=>'<option value="'+esc(key)+'"'+(key===value?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select>';}
function prButton(action,path,label,cls='mini-btn') {return '<button type="button" class="'+cls+'" data-pr-action="'+action+'" data-pr-path="'+path+'">'+label+'</button>';}
function prNode(n,path,root=false) {
  const remove=!root?prButton('remove-node',path,'×'):'';
  if(n.logic) return '<div class="pr-group"><div class="pr-group-head">'+prSelect(path+'.logic',{AND:'全部满足（AND）',OR:'任一满足（OR）',NOT:'不满足以下条件'},n.logic)+'<span class="pr-node-actions">'+(n.logic==='NOT'?'':prButton('add-condition',path,'＋条件')+prButton('add-group',path,'＋条件组'))+remove+'</span></div><div class="pr-group-items">'+(n.conditions.length?n.conditions.map((c,i)=>prNode(c,path+'.conditions.'+i)).join(''):'<span class="pr-hint">无附加条件，适用全部物料</span>')+'</div></div>';
  const unary=['empty','notEmpty','junk','grossName','nonzero'].includes(n.op);
  let body;
  if(n.op==='difference')body='<div class="pr-formula"><label>左侧计算式'+prInput(path+'.left',n.left,'例如 [小卷/包净重(g)] * [原始装数]')+'</label><label>右侧计算式'+prInput(path+'.right',n.right,'例如 [不含赠品净重] * 1000')+'</label><div class="pr-tolerances"><label>绝对容差'+prInput(path+'.absolute',n.absolute,'0','number')+'</label><label>相对容差（%）<input type="number" min="0" step="any" data-pr-percent="true" data-pr-path="'+path+'.relative" value="'+esc((n.relative??0)*100)+'"></label><label>相对容差基准<select data-pr-path="'+path+'.reference"><option value="">右侧计算结果</option>'+prFieldOptions(n.reference).replace('<option value="">选择字段</option>','')+'</select></label></div><div class="pr-hint">差值大于两种容差中的较大值时记为异常。计算式使用 [字段名]、数字和 + − * / ( )；空值、非数字或除零时不比较。</div><details><summary>查看可用计算字段</summary><div class="pr-formula-fields">'+processFields().map((f)=>'<code>['+esc(f.key)+']</code>').join(' ')+'</div></details></div>';
  else {
    const rhs = n.op==='between' ? prInput(path+'.value',n.value,PROCESS_DATE_FIELDS.has(n.field)?'开始日期 YYYYMMDD':'最小值')+'<span>至</span>'+prInput(path+'.valueTo',n.valueTo,PROCESS_DATE_FIELDS.has(n.field)?'结束日期 YYYYMMDD':'最大值') : !unary ? '<select class="pr-mode" data-pr-mode="'+path+'"><option value="value"'+(n.otherField===undefined?' selected':'')+'>固定值</option><option value="field"'+(n.otherField!==undefined?' selected':'')+'>另一个字段</option></select>'+(n.otherField!==undefined?'<select class="pr-value" data-pr-path="'+path+'.otherField">'+prFieldOptions(n.otherField)+'</select>':prInput(path+'.value',n.value,['in','notIn','numberIn'].includes(n.op)?'多项用顿号分隔':PROCESS_DATE_FIELDS.has(n.field)?'日期 YYYYMMDD':'输入比较值')) : '';
    return '<div class="pr-condition"><div class="pr-line"><select class="pr-field" data-pr-path="'+path+'.field">'+prFieldOptions(n.field)+'</select>'+prSelect(path+'.op',PROCESS_OPS,n.op)+rhs+'<span class="pr-node-actions">'+(root?prButton('wrap-node',path,'＋组合条件'):'')+remove+'</span></div>'+(n.epsilon?'<small class="pr-hint">沿用浮点比较精度 '+n.epsilon+'</small>':'')+'</div>';
  }
  return '<div class="pr-condition"><div class="pr-condition-top">'+prSelect(path+'.op',PROCESS_OPS,n.op)+'<span class="pr-node-actions">'+(root?prButton('wrap-node',path,'＋组合条件'):'')+remove+'</span></div>'+body+'</div>';
}
function prSelectedRule(){return processDraft.rules.find((r)=>r.id===processSelected);}
function renderProcessEditor() {
  const host=document.getElementById('processRuleEditor');if(!host)return;
  const list=host.querySelector('.pr-list'),body=host.querySelector('.pr-body'),scroll=body.scrollTop;
  list.innerHTML='<button data-pr-action="select" data-pr-id="scope" class="pr-list-item'+(processSelected==='scope'?' active':'')+'"><b>总适用范围</b><small>所有规则的共同前提</small></button>'+processDraft.rules.map((r)=>'<button data-pr-action="select" data-pr-id="'+esc(r.id)+'" class="pr-list-item'+(processSelected===r.id?' active':'')+'"><span><b>'+r.no+'. '+esc(r.title)+'</b><small class="'+(r.enabled?'pr-on':'')+'">'+(r.enabled?'启用':'停用')+'</small></span><small>'+r.checks.filter((c)=>c.enabled).length+' 个检查项</small></button>').join('')+'<button class="tool-btn" data-pr-action="new">＋新增规则</button>';
  const r=prSelectedRule(),idx=r?processDraft.rules.indexOf(r):-1,p='rules.'+idx;
  if(processSelected==='scope')body.innerHTML='<h3>总适用范围</h3><p class="pr-hint">每个物料先满足这里的条件，再执行各项规则。默认仅检查有效物料，排除进口品及 1900 开头编码。</p>'+prNode(processDraft.scope,'scope',true);
  else if(r)body.innerHTML='<div class="pr-rule-title"><label class="pr-labeled pr-rule-name">规则名称'+prInput(p+'.title',r.title,'填写规则名称')+'</label><label class="pr-enable"><input type="checkbox" data-pr-path="'+p+'.enabled"'+(r.enabled?' checked':'')+'>启用规则</label><div>'+prButton('copy','', '复制规则','tool-btn')+prButton('delete','', '删除规则','tool-btn')+prButton('restore','', '恢复此项默认','tool-btn')+'</div></div><details class="pr-original"><summary>查看原规范说明</summary><p>'+esc(r.description||'自定义规则')+'</p></details><h4>1. 适用条件 <small>在总适用范围内进一步限定物料</small></h4>'+prNode(r.scope,p+'.scope',true)+'<h4>2. 异常判断 <small>满足以下条件时生成对应问题</small></h4>'+r.checks.map((c,i)=>'<section class="pr-check"><div class="pr-check-head"><label><input type="checkbox" data-pr-path="'+p+'.checks.'+i+'.enabled"'+(c.enabled?' checked':'')+'>检查项 '+(i+1)+'</label>'+prButton('remove-check',p+'.checks.'+i,'删除')+'</div><div class="pr-check-meta"><label>问题提示'+prInput(p+'.checks.'+i+'.message',c.message,'例如 净重超过毛重')+'</label><label>问题级别'+prSelect(p+'.checks.'+i+'.code',PROCESS_CODES,c.code)+'</label></div>'+prNode(c.when,p+'.checks.'+i+'.when',true)+'</section>').join('')+prButton('add-check',p,'＋添加检查项','tool-btn primary');
  else body.innerHTML='<div class="empty">从左侧选择或新增一条规则</div>';
  body.scrollTop=scroll; updateProcessEditorStatus();
}
function updateProcessEditorStatus() {
  const el=document.getElementById('prStatus');if(!el)return;
  const dirty=JSON.stringify(processDraft)!==JSON.stringify(processActiveConfig());
  el.textContent=dirty?'草稿 · 尚未生效':'当前已生效规则';
  document.getElementById('prSave').disabled=!dirty;
  const preview=document.getElementById('prPreview');
  if(!processPreview){preview.innerHTML='<span class="pr-hint">试算覆盖当前数据集的全部 '+rows.length.toLocaleString()+' 条物料。编辑过程中查询结果保持当前规则。</span>';return;}
  if(processPreview.error){preview.innerHTML='<span class="pr-error">'+esc(processPreview.error)+'</span>';return;}
  const p=processPreview;
  preview.innerHTML='<b>全量试算</b><span>有问题 '+p.before.hits.toLocaleString()+' → <b>'+p.after.hits.toLocaleString()+'</b></span><span>含阻断 '+p.before.blocks.toLocaleString()+' → <b>'+p.after.blocks.toLocaleString()+'</b></span><span>结果变化 <b>'+p.changed.toLocaleString()+'</b> 条</span>'+(p.samples.length?'<details><summary>查看变化样本</summary><div class="pr-samples">'+p.samples.map((s)=>'<div><b>'+esc(s.material)+'</b> '+s.before+' → '+s.after+' 项 · '+esc(s.text)+'</div>').join('')+'</div></details>':'');
}
function openProcessEditor() {
  if(document.getElementById('processRuleEditor'))return;
  processDraft=processClone(processActiveConfig());processSelected=processDraft.rules[0]?.id||'scope';processPreview=null;
  const mask=document.createElement('div');mask.id='processRuleEditor';mask.className='pr-mask';mask.innerHTML='<section class="pr-editor" role="dialog" aria-modal="true" aria-labelledby="prTitle"><header><div><h2 id="prTitle">工艺属性规则配置</h2><p>产品组 · MDM 主数据治理；保存适用条件与异常判断后统一重算。</p></div><button class="tool-btn" data-pr-action="close" aria-label="关闭规则配置">×</button></header><div class="pr-workspace"><nav class="pr-list" aria-label="工艺属性规则列表"></nav><main class="pr-body"></main></div><footer><div id="prPreview" aria-live="polite"></div><div class="pr-footer-actions"><span id="prStatus"></span><span class="pr-storage" id="prConfigStatus" title="'+esc(personalConfig.path)+'">'+esc(personalConfig.status)+'</span><button class="tool-btn" data-pr-action="export">导出规则</button><button class="tool-btn" data-pr-action="import">导入规则</button><button class="tool-btn" data-pr-action="preview">试算影响</button><button class="tool-btn primary" id="prSave" data-pr-action="save">保存并生效</button></div></footer></section>';
  document.body.appendChild(mask);syncBodyScrollLock();
  mask.addEventListener('input',prEditorInput);mask.addEventListener('change',prEditorChange);mask.addEventListener('click',prEditorClick);mask.addEventListener('keydown',prEditorKey);renderProcessEditor();mask.querySelector('[data-pr-action="close"]').focus();
}
function closeProcessEditor() {document.getElementById('processRuleEditor')?.remove();processDraft=null;processPreview=null;syncBodyScrollLock();document.querySelector('[data-act="process-rules-config"]')?.focus();}
function prEditorKey(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();prTryClose();}if(e.key==='Tab'){const items=[...e.currentTarget.querySelectorAll('button:not([disabled]),input,select,summary')].filter((x)=>x.getClientRects().length);if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
async function prConfirm(message) {
  const editor=document.getElementById('processRuleEditor');
  if(!editor || editor.querySelector('.pr-confirm'))return false;
  const previous=document.activeElement,overlay=document.createElement('div');overlay.className='pr-confirm';
  overlay.innerHTML='<section role="alertdialog" aria-modal="true" aria-labelledby="prConfirmMessage"><p id="prConfirmMessage">'+esc(message)+'</p><div><button class="tool-btn" data-pr-confirm="cancel">取消</button><button class="tool-btn primary" data-pr-confirm="ok">确定</button></div></section>';
  editor.appendChild(overlay);
  return new Promise((resolve)=>{
    const done=(value)=>{overlay.remove();previous?.focus();resolve(value);};
    overlay.addEventListener('click',(e)=>{e.stopPropagation();const b=e.target.closest('[data-pr-confirm]');if(b)done(b.dataset.prConfirm==='ok');});
    overlay.addEventListener('keydown',(e)=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();done(false);}if(e.key==='Tab'){e.preventDefault();const target=document.activeElement?.dataset.prConfirm==='cancel'?'ok':'cancel';overlay.querySelector('[data-pr-confirm="'+target+'"]').focus();}});
    overlay.querySelector('[data-pr-confirm="cancel"]').focus();
  });
}
async function prTryClose(){if(JSON.stringify(processDraft)!==JSON.stringify(processActiveConfig())&&!(await prConfirm('规则有尚未保存的修改，关闭并放弃这些修改？')))return;closeProcessEditor();}

function prEditorInput(e) {
  const el=e.target,path=el.dataset.prPath;if(!path||el.tagName==='SELECT'||el.tagName==='BUTTON')return;
  let value=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?null:Number(el.value)):el.value;
  if(el.dataset.prPercent&&value!==null)value/=100;
  prSet(path,value);processPreview=null;updateProcessEditorStatus();
  if(path.endsWith('.title')||path.endsWith('.enabled')){
    const r=prSelectedRule(),button=document.querySelector('.pr-list-item.active');
    if(r&&button){button.querySelector('b').textContent=r.no+'. '+r.title;const small=button.querySelector('span>small');small.textContent=r.enabled?'启用':'停用';small.className=r.enabled?'pr-on':'';}
  }
}
function prEditorChange(e) {
  const el=e.target;if(el.dataset.prMode){const n=prGet(el.dataset.prMode);if(el.value==='field'){n.otherField='';delete n.value;}else{delete n.otherField;n.value='';}processPreview=null;renderProcessEditor();return;}
  const path=el.dataset.prPath;if(!path||el.tagName!=='SELECT')return;
  const prev=prGet(path);prSet(path,el.value);
  if(path.endsWith('.logic')&&el.value==='NOT'){const n=prGet(path.slice(0,-6));if(n.conditions.length!==1)n.conditions=[{logic:prev==='OR'?'OR':'AND',conditions:n.conditions}];}
  if(path.endsWith('.op')&&el.value==='between')delete prGet(path.slice(0,-3)).otherField;
  if(path.endsWith('.op')){const n=prGet(path.slice(0,-3));if(el.value==='difference'){n.left=n.left||'['+(n.field||'净重')+']';n.right=n.right||'0';n.absolute??=0;n.relative??=0;}else{n.field??='';n.value??='';}}
  processPreview=null;renderProcessEditor();
}
function prNewCondition(){return {field:'',op:'eq',value:''};}
function prNewCheck(){return {id:prId(),enabled:true,message:'',code:'PFI',when:{logic:'AND',conditions:[prNewCondition()]}};}
function prTrial(config) {
  validateProcessConfig(config);const run=compileProcessConfig(config),result={before:{hits:0,blocks:0},after:{hits:0,blocks:0},changed:0,samples:[]};
  rows.forEach((r,i)=>{const pf=run(r._processContext||processContext(r,i)),before=r._flags.filter((f)=>f.startsWith('PF'));if(before.length)result.before.hits++;if(r.pdfBlock)result.before.blocks++;if(pf.length)result.after.hits++;if(pf.some((f)=>/^(PFN|PFC):/.test(f)))result.after.blocks++;if([...before].sort().join('|')!==[...pf].sort().join('|')){result.changed++;if(result.samples.length<8)result.samples.push({material:r.material,before:before.length,after:pf.length,text:pf.join('；')||'无工艺属性问题'});}});
  return result;
}
async function prEditorClick(e) {
  const b=e.target.closest('[data-pr-action]');if(!b)return;e.stopPropagation();const act=b.dataset.prAction,path=b.dataset.prPath,r=prSelectedRule();
  if(act==='close'){prTryClose();return;}
  if(act==='select'){processSelected=b.dataset.prId;document.querySelector('.pr-body').scrollTop=0;renderProcessEditor();return;}
  if(act==='preview'){try{processPreview=prTrial(processDraft);}catch(err){processPreview={error:err.message};}updateProcessEditorStatus();return;}
  if(act==='save'){
    try{const impact=prTrial(processDraft);processConfig=processClone(processDraft);applyProcessRules(processConfig);saveState();refreshAll();processPreview=impact;updateProcessEditorStatus();syncBodyScrollLock();toast(personalConfig.available?'规则已生效，正在保存到本机':'规则已生效，暂存浏览器，等待本机服务恢复');}catch(err){processPreview={error:err.message};updateProcessEditorStatus();}return;
  }
  if(act==='export'){try{validateProcessConfig(processDraft);download('工艺属性规则-'+stamp()+'.json',JSON.stringify({type:'mdm-process-rules',schemaVersion:1,rules:processDraft},null,2),'application/json');}catch(err){processPreview={error:err.message};updateProcessEditorStatus();}return;}
  if(act==='import'){
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const f=input.files[0];if(!f)return;if(f.size>2*1024*1024)throw new Error('规则文件超过2MB');const doc=JSON.parse(await f.text());if(doc.type!=='mdm-process-rules'||doc.schemaVersion!==1)throw new Error('不是工艺属性规则文件');validateProcessConfig(doc.rules);processDraft=processClone(doc.rules);processSelected=processDraft.rules[0]?.id||'scope';processPreview=null;renderProcessEditor();toast('规则已导入草稿，请试算后保存');}catch(err){processPreview={error:err.message};updateProcessEditorStatus();}};input.click();return;
  }
  if(act==='new'||act==='copy'){const no=Math.max(11,...processDraft.rules.map((r)=>r.no))+1,item=act==='copy'&&r?processClone(r):{title:'新规则',description:'',enabled:true,scope:{logic:'AND',conditions:[]},checks:[prNewCheck()]};item.id=prId();item.no=no;if(act==='copy')item.title+=' 副本';processDraft.rules.push(item);processSelected=item.id;}
  if(act==='delete'&&r){if(!(await prConfirm('从草稿中删除「'+r.title+'」？保存后生效。')))return;processDraft.rules=processDraft.rules.filter((x)=>x!==r);processSelected=processDraft.rules[0]?.id||'scope';}
  if(act==='restore'&&r){const d=PROCESS_DEFAULTS.rules.find((x)=>x.id===r.id);if(!d){toast('自定义规则没有内置默认值',true);return;}if(!(await prConfirm('将此项草稿恢复为内置规则？保存后生效。')))return;processDraft.rules[processDraft.rules.indexOf(r)]=processClone(d);}
  if(act==='add-check')prGet(path).checks.push(prNewCheck());
  if(act==='remove-check'){const parts=path.split('.'),i=Number(parts.pop());prGet(parts.join('.')).splice(i,1);}
  if(act==='add-condition')prGet(path).conditions.push(prNewCondition());
  if(act==='add-group')prGet(path).conditions.push({logic:'OR',conditions:[prNewCondition()]});
  if(act==='wrap-node')prSet(path,{logic:'AND',conditions:[prGet(path),prNewCondition()]});
  if(act==='remove-node'){const parts=path.split('.'),i=Number(parts.pop()),parent=prGet(parts.slice(0,-1).join('.'));if(parent.logic==='NOT')parent.conditions=[{logic:'AND',conditions:[]}];else prGet(parts.join('.')).splice(i,1);}
  processPreview=null;renderProcessEditor();
}
