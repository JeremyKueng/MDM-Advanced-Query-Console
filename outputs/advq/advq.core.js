/* ============ MDM 高级查询工作台 · 核心层（数据/状态/计算） ============ */
"use strict";

/* ---------- 内联 SVG 图标库（stroke 风格，零外链） ---------- */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/>',
  "x-circle": '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  "alert-triangle": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  "alert-octagon": '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ruler: '<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  "bar-chart": '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/>',
  route: '<circle cx="6" cy="19" r="2.6"/><circle cx="18" cy="5" r="2.6"/><path d="M8.6 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.4"/>',
  package: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 8l8.7 5 8.7-5M12 22V13"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  scale: '<path d="M12 3v18"/><path d="M5 7l7-3 7 3"/><path d="M5 7l-2.5 6a3.5 3.5 0 0 0 5 0L5 7z"/><path d="M19 7l-2.5 6a3.5 3.5 0 0 0 5 0L19 7z"/><path d="M8 21h8"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  ban: '<circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  grip: '<circle cx="9" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="13" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1.4" fill="currentColor" stroke="none"/>',
  "chevron-left": '<polyline points="15 18 9 12 15 6"/>',
  "chevron-right": '<polyline points="9 18 15 12 9 6"/>',
  swap: '<path d="M7 4v13M3 13l4 4 4-4"/><path d="M17 20V7M13 11l4-4 4 4"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15.5 14"/>',
  calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/><line x1="8" y1="19" x2="16" y2="19"/>',
  droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
};
function ic(name, size, cls) {
  const inner = ICONS[name] || ICONS["check-circle"];
  const s = size || 15;
  return '<svg class="ic ' + (cls || "") + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
}

/* ---------- 分析标记元数据（与主工作台治理归口一致） ---------- */
const FLAG_META = {
  MISS:  { name: "字段缺失",         sev: "mid",  gov: "supplement",    icon: "edit" },
  NUM:   { name: "明显错值",         sev: "high", gov: "numeric",       icon: "hash" },
  BOX:   { name: "盒巾长宽匹配异常", sev: "mid",  gov: "adjudication",  icon: "ruler" },
  PAIR:  { name: "包装数量错值",     sev: "high", gov: "numeric",       icon: "package" },
  LEVEL: { name: "包装层级不一致",   sev: "mid",  gov: "packaging",     icon: "layers" },
  VCONF: { name: "同V码规格冲突",    sev: "mid",  gov: "packaging",     icon: "link" },
  SPEC:  { name: "装数与规格乘积不符", sev: "mid", gov: "packaging",    icon: "calc" },
  ROUTE: { name: "路线逻辑异常",     sev: "high", gov: "packaging",     icon: "route" },
  PFM:   { name: "工艺属性必填缺失", sev: "low",  gov: "supplement",    icon: "edit" },
  PFN:   { name: "工艺属性数值异常", sev: "high", gov: "numeric",       icon: "hash" },
  PFC:   { name: "工艺属性逻辑矛盾", sev: "high", gov: "numeric",       icon: "alert-octagon" },
  PFI:   { name: "工艺属性规范提示", sev: "low",  gov: "supplement",    icon: "tag" },
  PFP:   { name: "工艺属性一致性待核", sev: "mid", gov: "packaging",    icon: "calc" },
};
const BLOCKING_TYPES = ["NUM", "BOX", "PAIR", "PFN", "PFC"];
const GOV_META = {};        // id → {id,name,priority,description,count}
const GOV_COLOR = { numeric: "red", supplement: "blue", packaging: "orange", adjudication: "purple", device: "teal", route: "green" };
const GOV_ICON = { numeric: "sliders", supplement: "edit", packaging: "package", adjudication: "scale", device: "cpu", route: "navigation" };
const SEV_LABEL = { high: "高", mid: "中", low: "低" };

/* 内置分析方法注册表（预设自既有 MDM 质量口径） */
const ANALYSES = [
  { id: "completeness", name: "关键字段完整性",   icon: "pie",      gov: "supplement",   desc: "按品类必填口径检测缺失；填“无”视为已确认" },
  { id: "numeric",      name: "明显错值",         icon: "hash",     gov: "numeric",      desc: "净重、成品定量、层数、原始装数 ≤0 检测" },
  { id: "box",          name: "盒巾/纸盒尺寸口径", icon: "ruler",    gov: "adjudication", desc: "面巾软抽/盒巾取数口径与匹配校验" },
  { id: "packaging",    name: "包装层级与成对校验", icon: "layers",   gov: "packaging",    desc: "包装数组层级、单位数量成对、中包证据对齐" },
  { id: "vcode",        name: "同V码规格一致性",  icon: "link",     gov: "packaging",    desc: "同V码多规格冲突（剔除内部周转）" },
  { id: "spec",         name: "装数与规格乘积",   icon: "calc",     gov: "packaging",    desc: "原始装数与物料规格乘积表达式比对" },
  { id: "pdfrules",     name: "工艺属性自动检查", icon: "clipboard", gov: "numeric",     desc: "示例校验规范 11 类规则：电商/重量三件套/成品定量/不含液净重/节距卷高/卷类名称/纸长纸宽/FSC/抽张片数/小卷包净重/pian" },
  { id: "route",        name: "MPS 工艺路线完整度", icon: "route",  gov: "route",        desc: "每次按新 MDM 源表实时推导机头/裁切/小包/中包/装箱节点" },
  { id: "status",       name: "物料状态与效期",   icon: "clock",    gov: "route",        desc: "物料状态、预失效、创建与更新时间" },
  { id: "issues",       name: "MDM 异常清单",     icon: "list",     gov: "route",        desc: "当前数据实时计算的 MDM 质量与工艺属性异常" },
  { id: "history",      name: "MPS 路线专项校验", icon: "navigation", gov: "route",      desc: "基于当前 MDM 实时重算的包装交叉与设备规则缺口" },
];

/* ---------- 全局数据 ---------- */
let DATASET = null;
let rows = [];               // 行对象数组
let byMaterial = new Map();  // material → row
let lookupCodes = new Set(); // 识别空格分隔的物料编码与 V码
let vconfByVcode = new Map();
let routeIssueMap = new Map();
let schemaByKey = new Map();
let schemaKeys = [];

/* ---------- 状态 ---------- */
const LS_KEY = "mdm_query_console_demo_v1";
/* 任何视图强制保留并冻结在最左侧的核心 4 列：物料编码 + V码 + 物料规格 + 物料说明 */
const PINNED_KEYS = ["material", "vcode", "spec", "desc"];
/* MPS 路线专项与常规工艺治理分别归属；二者的计算指标均不放入普通字段管理。 */
const MPS_ONLY_KEYS = new Set(["route", "routeStatus", "routeMissing", "routeNodes"]);
const PROCESS_CHECK_KEYS = new Set(["pdfCount", "pdfBlock"]);
const MDM_HIDDEN_KEYS = new Set([...MPS_ONLY_KEYS, ...PROCESS_CHECK_KEYS]);
const SEARCH_FIELDS = [
  { key: "all",      label: "全部字段" },
  { key: "material", label: "物料编码" },
  { key: "vcode",    label: "V码" },
  { key: "spec",     label: "物料规格" },
  { key: "desc",     label: "物料说明" },
  { key: "brand",    label: "品牌" },
  { key: "制造类别", label: "制造类别" },
  { key: "formula",  label: "配方大类" },
  { key: "cat",      label: "品类三级" },
  { key: "stock",    label: "库存小类" },
];
const state = {
  view: "table",             // table | card
  tab: "results",            // results | focus | vconf | analyze | rules | mps
  savedViews: [], activeFieldView: "", viewShortcuts: [], fieldViewDraftName: null,
  queryViews: [], activeQueryView: "",
  order: [],                 // 字段 key 顺序（全部字段）
  visible: [],               // 可见字段 key
  filters: {
    mfg: new Set(),          // 制造类别
    formula: new Set(),      // 配方大类
    cats: new Set(),         // 品类三级
    stocks: new Set(),       // 库存小类
    brands: new Set(),       // 品牌
    status: "有效", pre: "", scope: "",
    onlyBlock: false, onlyIssue: false, onlyVconf: false, onlyBasket: false,
    onlyFieldIssue: "", onlyPdf: false, onlyPdfRule: "",
    customLogic: "AND", customConditions: [],
  },
  filterCollapsed: true,     // 日常查询先显示常用筛选，完整分类按需展开
  expandedMore: new Set(),   // 已展开“更多N个”的筛选行 key（展开后隐藏“更多N个”胶囊）
  focusFilter: { group: "", reason: "", q: "", sort: "severity", page: 1, pageSize: 40 },
  analyzeFilter: { q: "", sort: "issue", scopeMode: "scope", valMode: "top", family: "" },
  vconfFilter: { q: "", sort: "materials", expandAll: false, page: 1 },
  processCheckFilter: { onlyIssue: true, page: 1 },
  mpsFilter: { status: "", cat: "", issueType: "", onlyIssue: false, page: 1 },
  q: "",
  qMode: "smart",            // smart（关键词/多码自动识别）| exact（精准等于）
  qField: "all",             // all | material | vcode | spec | desc | brand | 制造类别 | formula | cat | stock
  tokens: [],
  sort: { key: "material", dir: 1 },
  page: 1,
  pageSize: 50,
  basket: [],
  basketExpanded: false,
  analyzeField: "",
  detail: null,              // material
  quickDetailView: null,     // 独立的速览分区、字段与显示偏好
  detailPage: false,         // 全屏详情页（深链/抽屉展开），不持久化
  dpOverrideTplId: "",       // 手动临时预览指定详情模板 ID（为空则按条件路由自动命中）
  dpShowClassicCols: false,  // 在自定义视窗下方是否展开全量字段与校验明细
  dpConfigOpen: false,       // 是否打开单品详情视窗与条件路由配置器
  dpConfigTab: "canvas",     // canvas (画布与区块配置) | rules (条件路由规则层)
  dpEditingTplId: "",        // 当前正在编辑的模板 ID
  dpTemplates: [],           // 单品详情自定义视窗模板列表（支持条件路由、跨域重复字段、跨部门相似字段横向对比）
  compareOpen: false,
  cmpDiffOnly: false,
  fieldDrawer: false,
  sourceModal: false,
  sourceInfo: null,
};
let derived = { filtered: [], sorted: [], pageRows: [], total: 0, pages: 1, exactHints: [] };
const basketSet = new Set();

/* 统一按 state.order 顺序返回当前可见字段，并且任何视图强制前置保留核心 4 列：物料编码 + V码 + 物料规格 + 物料说明（自动剥离 MPS 工艺路线专属字段） */
function orderedVisibleKeys() {
  const pinned = PINNED_KEYS.filter((k) => schemaByKey.has(k));
  const pinnedSet = new Set(pinned);
  const visSet = new Set(state.visible);
  const ordered = [...pinned];
  for (const k of state.order) {
    if (visSet.has(k) && schemaByKey.has(k) && !pinnedSet.has(k) && !MDM_HIDDEN_KEYS.has(k)) ordered.push(k);
  }
  for (const k of state.visible) {
    if (schemaByKey.has(k) && !pinnedSet.has(k) && !MDM_HIDDEN_KEYS.has(k) && !ordered.includes(k)) ordered.push(k);
  }
  return ordered;
}
function syncVisibleOrder() {
  state.visible = orderedVisibleKeys();
}

/* ---------- 单品详情全屏看板：自定义视窗模板与条件路由引擎（类多维表格视窗插件） ---------- */
const DP_OPERATORS = [
  { op: "eq",         label: "等于 (=)" },
  { op: "neq",        label: "不等于 (≠)" },
  { op: "prefix",     label: "开头等于" },
  { op: "contains",   label: "包含" },
  { op: "notContains",label: "不包含" },
  { op: "in",         label: "等于任一项 (多项)" },
  { op: "notEmpty",   label: "不为空" },
  { op: "empty",      label: "为空" },
];

const DATE_OPERATORS = [
  { op: "eq", label: "等于日期" }, { op: "neq", label: "不等于日期" },
  { op: "gte", label: "大于等于 (≥)" }, { op: "gt", label: "大于 (>)" },
  { op: "lte", label: "小于等于 (≤)" }, { op: "lt", label: "小于 (<)" },
  { op: "between", label: "日期区间（含起止）" },
  { op: "notEmpty", label: "不为空" }, { op: "empty", label: "为空" },
];
const CUSTOM_TEXT_OPERATORS = DP_OPERATORS.flatMap((o) => o.op === "contains" ? [o, { op: "containsAny", label: "包含任一项 (OR)" }] : [o]);
const CUSTOM_MAX_DEPTH = 8, CUSTOM_MAX_NODES = 200;
function splitCustomValues(value) { return [...new Set(String(value || "").split(/[;；\r\n]+/).map((v) => v.trim().toLowerCase()).filter(Boolean))]; }
function isDateField(key) { return ["created", "updated"].includes(key) || (schemaByKey.get(key) || {}).type === "date"; }
function filterConditionOperators(key, currentOp) {
  if (!isDateField(key)) return CUSTOM_TEXT_OPERATORS;
  const old = DP_OPERATORS.find((o) => o.op === currentOp);
  return old && !DATE_OPERATORS.some((o) => o.op === currentOp) ? [...DATE_OPERATORS, { ...old, label: "原文本条件：" + old.label, legacy: true }] : DATE_OPERATORS;
}
function isoDate(value) {
  const text = String(value == null ? "" : value).trim().replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  const m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/);
  if (!m) return "";
  const y = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const date = new Date(0); date.setUTCFullYear(y, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return m[1] + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}
function customConditionReady(c) {
  if (!c) return false;
  if (c.op === "containsAny") return splitCustomValues(c.val).length > 0;
  if (["empty", "notEmpty"].includes(c.op)) return true;
  if (!String(c.val == null ? "" : c.val).trim()) return false;
  if (!isDateField(c.field) || !DATE_OPERATORS.some((o) => o.op === c.op)) return true;
  const start = isoDate(c.val);
  return !!start && (c.op !== "between" || !!isoDate(c.valTo) && start <= isoDate(c.valTo));
}
function customConditionValueLabel(c) { return c.op === "between" ? c.val + " 至 " + c.valTo : c.val; }
function conditionValuePlaceholder(op) {
  return { prefix: "输入开头文本，如 100 或 VD", in: "完整值，多项用逗号分隔", containsAny: "如：面巾；餐巾（任一项匹配）" }[op] || "输入匹配值";
}
function mdmPresetNames() { return Object.keys(DATASET.presets).filter((name) => name !== "工艺属性检查"); }

const DP_BLOCK_TYPES = [
  { type: "banner",        label: "顶部通栏标识卡 (Banner)" },
  { type: "fields",        label: "自由字段网格卡 (可跨域重复)" },
  { type: "pack_SpecBox",  label: "重量体积+中包/外箱嵌套框 (草图右上)" },
  { type: "dept_compare",  label: "跨部门相似字段横向对比卡 (草图左下)" },
  { type: "strip_table",   label: "横向指标条表 (如卷类参数横表/品类三级横表)" },
];

function buildDefaultDpTemplates() {
  return [
    {
      id: "tpl_non_roll",
      name: "非卷类/抽纸面巾纸巾标准看板",
      desc: "当 品类二级=非卷 或 规则品类属于 面巾/纸巾/餐巾 时自动启用（含生产工艺小包机、中包/外箱体积、五级架构vs市场部横向对比、条码）",
      isDefault: false,
      priority: 10,
      logic: "OR",
      conditions: [
        { field: "品类二级", op: "eq", val: "非卷" },
        { field: "ruleCat", op: "in", val: "面巾,纸巾,餐巾" },
      ],
      blocks: [
        {
          id: "b_hero",
          title: "核心标识与分类通栏",
          type: "banner",
          span: 12,
          accentFields: ["制造类别", "cat", "stock"],
          fields: ["制造类别", "cat", "stock", "vcode", "material", "desc", "spec"],
        },
        {
          id: "b_craft_pack",
          title: "生产工艺（小包机 / 折页 / 包装规格）",
          type: "fields",
          span: 6,
          fields: ["压线/压花", "层数", "纸长", "纸宽", "抽(张)/包(盒)", "张/片数", "小包长度", "小包宽度", "单包高度", "纸盒尺寸", "pack"],
        },
        {
          id: "b_weight_vol",
          title: "重量、体积与中包/外包装尺寸",
          type: "pack_SpecBox",
          span: 6,
          fields: ["net", "netNG", "gross", "体积", "load", "unit"],
          subBoxes: [
            { title: "中包：长 × 宽 × 高", fields: ["单提长", "单提宽", "单提高", "中包包装方式", "中包毛重(g)"] },
            { title: "外包装：长 × 宽 × 高", fields: ["长(外包装)", "宽(外包装)", "高(外包装)", "装箱方式"] },
          ],
        },
        {
          id: "b_dept_cmp",
          title: "品牌电商 & 跨部门相似字段横向对比（五级架构 vs MDM vs 市场部/OEM）",
          type: "dept_compare",
          span: 7,
          fields: ["brand", "ecom", "isCombo", "prodType"],
          compareRows: [
            { dim: "品类口径", fields: ["品类（五级架构）", "品类一级", "品类二级", "cat"] },
            { dim: "品牌口径", fields: ["品牌（五级架构）", "brand", "是否OEM"] },
            { dim: "销售大类", fields: ["销售大类（五级架构）", "物料销售类别", "formula"] },
            { dim: "销售小类", fields: ["销售小类（五级架构）", "销售小类（市场部）", "stock"] },
            { dim: "产品系列", fields: ["产品系列（五级架构）", "series"] },
          ],
        },
        {
          id: "b_barcodes",
          title: "条码信息（小包 / 中袋 / 外箱 / 基准）",
          type: "fields",
          span: 5,
          fields: ["小包/袋/盒产品条码", "手抽/中袋条形码", "外包装条形码（选择组织）", "基准条码", "ecom"],
        },
        {
          id: "b_cat_strip",
          title: "品类层级横向一览",
          type: "strip_table",
          span: 12,
          fields: ["品类一级", "品类二级", "cat", "制造类别", "formula", "stock"],
        },
      ],
    },
    {
      id: "tpl_roll",
      name: "卷类（卫卷/公用卷纸）专属看板",
      desc: "当 规则品类=卫卷 或 品类二级=卷纸 或 物料库存类别含卫卷 时自动启用（底部突出卷类专属 6 项指标横表：节距/卷高/节数/米数/净含量/毛重每卷）",
      isDefault: false,
      priority: 20,
      logic: "OR",
      conditions: [
        { field: "ruleCat", op: "eq", val: "卫卷" },
        { field: "品类二级", op: "contains", val: "卷" },
        { field: "stockCat", op: "contains", val: "卫卷" },
      ],
      blocks: [
        {
          id: "b_hero_r",
          title: "核心标识与分类通栏（卷类）",
          type: "banner",
          span: 12,
          accentFields: ["制造类别", "cat", "stock"],
          fields: ["制造类别", "cat", "stock", "vcode", "material", "desc", "spec"],
        },
        {
          id: "b_roll_strip",
          title: "卷类核心工艺指标横表（节距 / 卷高 / 节数 / 米数 / 净含量 / 毛重每卷）",
          type: "strip_table",
          span: 12,
          fields: ["节距", "卷高", "节数", "米数", "净含量", "毛重/卷", "卷径", "筒芯", "层数"],
        },
        {
          id: "b_craft_r",
          title: "生产工艺与包装规格（卷类）",
          type: "fields",
          span: 6,
          fields: ["压线/压花", "层数", "成品定量", "卷径", "筒芯", "rollNet", "rollGross", "pack"],
        },
        {
          id: "b_weight_vol_r",
          title: "重量、体积与中包/外包装尺寸",
          type: "pack_SpecBox",
          span: 6,
          fields: ["net", "netNG", "gross", "体积", "load", "unit"],
          subBoxes: [
            { title: "中包：长 × 宽 × 高", fields: ["单提长", "单提宽", "单提高", "中包包装方式", "中包毛重(g)"] },
            { title: "外包装：长 × 宽 × 高", fields: ["长(外包装)", "宽(外包装)", "高(外包装)", "装箱方式"] },
          ],
        },
        {
          id: "b_dept_cmp_r",
          title: "品牌电商 & 跨部门相似字段横向对比（五级架构 vs MDM vs 市场部/OEM）",
          type: "dept_compare",
          span: 7,
          fields: ["brand", "ecom", "isCombo", "prodType"],
          compareRows: [
            { dim: "品类口径", fields: ["品类（五级架构）", "品类一级", "品类二级", "cat"] },
            { dim: "品牌口径", fields: ["品牌（五级架构）", "brand", "是否OEM"] },
            { dim: "销售大类", fields: ["销售大类（五级架构）", "物料销售类别", "formula"] },
            { dim: "销售小类", fields: ["销售小类（五级架构）", "销售小类（市场部）", "stock"] },
            { dim: "产品系列", fields: ["产品系列（五级架构）", "series"] },
          ],
        },
        {
          id: "b_barcodes_r",
          title: "条码信息（小包 / 中袋 / 外箱 / 基准）",
          type: "fields",
          span: 5,
          fields: ["小包/袋/盒产品条码", "手抽/中袋条形码", "外包装条形码（选择组织）", "基准条码", "ecom"],
        },
      ],
    },
    {
      id: "tpl_default",
      name: "通用成品全景看板（默认兜底模板）",
      desc: "当上方条件均未命中时自动作为默认兜底模板展示",
      isDefault: true,
      priority: 99,
      logic: "AND",
      conditions: [],
      blocks: [
        {
          id: "b_hero_d",
          title: "核心标识与分类通栏",
          type: "banner",
          span: 12,
          accentFields: ["制造类别", "cat", "stock"],
          fields: ["制造类别", "cat", "stock", "vcode", "material", "desc", "spec"],
        },
        {
          id: "b_craft_d",
          title: "生产工艺与包装规格",
          type: "fields",
          span: 6,
          fields: ["压线/压花", "层数", "纸长", "纸宽", "抽(张)/包(盒)", "张/片数", "节距", "卷高", "节数", "米数", "pack"],
        },
        {
          id: "b_weight_vol_d",
          title: "重量、体积与中包/外包装尺寸",
          type: "pack_SpecBox",
          span: 6,
          fields: ["net", "netNG", "gross", "wetNet", "体积", "load", "unit"],
          subBoxes: [
            { title: "中包：长 × 宽 × 高", fields: ["单提长", "单提宽", "单提高", "中包包装方式"] },
            { title: "外包装：长 × 宽 × 高", fields: ["长(外包装)", "宽(外包装)", "高(外包装)", "装箱方式"] },
          ],
        },
        {
          id: "b_dept_cmp_d",
          title: "品牌电商 & 跨部门相似字段横向对比（五级架构 vs MDM vs 市场部/OEM）",
          type: "dept_compare",
          span: 7,
          fields: ["brand", "ecom", "isCombo", "prodType"],
          compareRows: [
            { dim: "品类口径", fields: ["品类（五级架构）", "品类一级", "品类二级", "cat"] },
            { dim: "品牌口径", fields: ["品牌（五级架构）", "brand", "是否OEM"] },
            { dim: "销售大类", fields: ["销售大类（五级架构）", "物料销售类别", "formula"] },
            { dim: "销售小类", fields: ["销售小类（五级架构）", "销售小类（市场部）", "stock"] },
            { dim: "产品系列", fields: ["产品系列（五级架构）", "series"] },
          ],
        },
        {
          id: "b_barcodes_d",
          title: "条码信息",
          type: "fields",
          span: 5,
          fields: ["小包/袋/盒产品条码", "手抽/中袋条形码", "外包装条形码（选择组织）", "基准条码", "ecom"],
        },
      ],
    },
  ];
}

function evalDpCondition(r, cond) {
  if (!cond || !cond.field) return true;
  const raw = r[cond.field];
  const sv = String(raw === null || raw === undefined ? "" : raw).trim();
  const target = String(cond.val === null || cond.val === undefined ? "" : cond.val).trim();
  if (isDateField(cond.field) && !["empty", "notEmpty"].includes(cond.op) && DATE_OPERATORS.some((o) => o.op === cond.op)) {
    const date = isoDate(raw), targetDate = isoDate(cond.val), endDate = isoDate(cond.valTo);
    if (!date || !targetDate) return false;
    switch (cond.op) {
      case "eq": return date === targetDate;
      case "neq": return date !== targetDate;
      case "gte": return date >= targetDate;
      case "gt": return date > targetDate;
      case "lte": return date <= targetDate;
      case "lt": return date < targetDate;
      case "between": return !!endDate && targetDate <= endDate && date >= targetDate && date <= endDate;
    }
  }
  switch (cond.op) {
    case "eq": return sv.toLowerCase() === target.toLowerCase();
    case "neq": return sv.toLowerCase() !== target.toLowerCase();
    case "prefix": return target !== "" && sv.toLowerCase().startsWith(target.toLowerCase());
    case "contains": return target !== "" && sv.toLowerCase().includes(target.toLowerCase());
    case "containsAny": return splitCustomValues(target).some((value) => sv.toLowerCase().includes(value));
    case "notContains": return target === "" || !sv.toLowerCase().includes(target.toLowerCase());
    case "in": {
      const set = new Set(target.split(/[,，;；|\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean));
      return set.has(sv.toLowerCase());
    }
    case "notEmpty": return sv !== "" && sv !== "无";
    case "empty": return sv === "" || sv === "无";
    default: return false;
  }
}

/* 查询条件沿用详情模板的字段、运算符与“无”值口径；未填完的条件暂不参与筛选。 */
function validateCustomConditions(conditions) {
  let count = 0;
  function check(items, depth) {
    if (!Array.isArray(items) || depth > CUSTOM_MAX_DEPTH) throw new Error("条件组格式不正确或嵌套过深");
    for (const c of items) {
      if (++count > CUSTOM_MAX_NODES || !c || typeof c !== "object" || Array.isArray(c)) throw new Error("条件配置格式不正确或数量过多");
      if (c.type === "group") {
        if (!["AND", "OR"].includes(c.logic)) throw new Error("条件组必须选择 AND 或 OR");
        check(c.conditions, depth + 1);
      } else if ((c.type && c.type !== "condition") || typeof c.field !== "string" || typeof c.op !== "string") throw new Error("条件配置格式不正确");
    }
  }
  check(conditions, 0);
}
function normalizeCustomConditions(conditions) {
  let count = 0;
  function clean(items, depth) {
    if (!Array.isArray(items) || depth > CUSTOM_MAX_DEPTH) return [];
    const result = [];
    for (const c of items) {
      if (++count > CUSTOM_MAX_NODES) break;
      if (!c || typeof c !== "object") continue;
      if (c.type === "group") {
        result.push({ type: "group", logic: c.logic === "OR" ? "OR" : "AND", conditions: clean(c.conditions, depth + 1) });
      } else if (schemaByKey.has(c.field) && !MDM_HIDDEN_KEYS.has(c.field) && filterConditionOperators(c.field, c.op).some((o) => o.op === c.op)) {
        result.push({ field: c.field, op: c.op, val: String(c.val == null ? "" : c.val).trim(),
          ...(c.op === "between" ? { valTo: String(c.valTo == null ? "" : c.valTo).trim() } : {}) });
      }
    }
    return result;
  }
  return clean(conditions, 0);
}
function customFilterEntries(items = state.filters.customConditions, parent = "") {
  const result = [];
  for (const [index, node] of (items || []).entries()) {
    const path = parent ? parent + "." + index : String(index);
    result.push({ node, path });
    if (node.type === "group") result.push(...customFilterEntries(node.conditions, path));
  }
  return result;
}
function customFilterNode(path) {
  if (!/^\d+(?:\.\d+)*$/.test(String(path))) return null;
  let list = state.filters.customConditions, node;
  for (const part of String(path).split(".")) {
    node = list && list[Number(part)];
    if (!node) return null;
    list = node.type === "group" ? node.conditions : null;
  }
  return node;
}
function customFilterChildren(path = "") {
  if (path === "") return state.filters.customConditions;
  const node = customFilterNode(path);
  return node && node.type === "group" ? node.conditions : null;
}
function customConditionPathLabel(path) { return String(path).split(".").map((p) => Number(p) + 1).join("."); }
function activeCustomConditions() { return customFilterEntries(normalizeCustomConditions(state.filters.customConditions)).filter(({ node }) => node.type !== "group" && customConditionReady(node)).map(({ node }) => node); }
function activeCustomTree(items = normalizeCustomConditions(state.filters.customConditions), logic = state.filters.customLogic) {
  const children = items.map((c) => c.type === "group" ? activeCustomTree(c.conditions, c.logic) : customConditionReady(c) ? c : null).filter(Boolean);
  return children.length ? { type: "group", logic: logic === "OR" ? "OR" : "AND", conditions: children } : null;
}
function customFilterNodeLabel(c) {
  if (c.type === "group") {
    const labels = c.conditions.map(customFilterNodeLabel).filter(Boolean);
    return labels.length ? "（" + labels.join(c.logic === "OR" ? " 或 " : " 且 ") + "）" : "";
  }
  const field = schemaByKey.get(c.field), op = filterConditionOperators(c.field, c.op).find((o) => o.op === c.op);
  return field && op && customConditionReady(c) ? field.label + " " + op.label + (["empty", "notEmpty"].includes(c.op) ? "" : " " + customConditionValueLabel(c)) : "";
}
function prepareCustomFilterMatches() {
  const tree = activeCustomTree();
  state._customMatches = null;
  if (!tree) return;
  const compile = (c) => {
    if (c.type !== "group") {
      if (c.op === "containsAny") { const values = splitCustomValues(c.val); return (r) => values.some((v) => String(r[c.field] ?? "").toLowerCase().includes(v)); }
      return (r) => evalDpCondition(r, c);
    }
    const tests = c.conditions.map(compile);
    return c.logic === "OR" ? (r) => tests.some((test) => test(r)) : (r) => tests.every((test) => test(r));
  };
  const match = compile(tree);
  // 每次查询只计算一次，供各分类胶囊的联动计数共用。
  state._customMatches = new Set(rows.filter(match).map((r) => r.material));
}

function matchDpTemplateForSku(r) {
  const list = state.dpTemplates && state.dpTemplates.length ? state.dpTemplates : buildDefaultDpTemplates();
  if (state.dpOverrideTplId) {
    const manual = list.find((t) => t.id === state.dpOverrideTplId);
    if (manual) return { tpl: manual, reason: "手动切换预览模板", matchedConds: [] };
  }
  const sorted = [...list].sort((a, b) => (a.isDefault ? 1 : 0) - (b.isDefault ? 1 : 0) || (a.priority || 50) - (b.priority || 50));
  for (const tpl of sorted) {
    if (tpl.isDefault || !tpl.conditions || !tpl.conditions.length) continue;
    const logic = (tpl.logic || "OR").toUpperCase();
    const hits = [];
    let pass = logic === "AND";
    for (const c of tpl.conditions) {
      const ok = evalDpCondition(r, c);
      if (ok) {
        const flb = (schemaByKey.get(c.field) || {}).label || c.field;
        const oplb = ([...DP_OPERATORS, ...DATE_OPERATORS].find((o) => o.op === c.op) || {}).label || c.op;
        hits.push(flb + " " + oplb + (c.val ? "「" + c.val + "」" : ""));
      }
      if (logic === "AND" && !ok) { pass = false; break; }
      if (logic === "OR" && ok) { pass = true; }
    }
    if (logic === "OR") pass = hits.length > 0;
    if (pass) {
      return { tpl, reason: "条件路由自动命中：" + hits.join(logic === "AND" ? " 且 " : " 或 "), matchedConds: hits };
    }
  }
  const fallback = sorted.find((t) => t.isDefault) || sorted[0];
  return { tpl: fallback, reason: "默认兜底模板", matchedConds: [] };
}

/* ---------- 工具 ---------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmt(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    if (!isFinite(v)) return "";
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  }
  return String(v);
}
function fmtOrDash(v) { const s = fmt(v); return s === "" ? '<span style="color:var(--subtle)">—</span>' : esc(s); }
function debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); }; }
function toast(msg, isErr) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show" + (isErr ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = ""; }, 2600);
}
function syncBodyScrollLock() {
  try {
    const maskOpen = document.getElementById("modal-mask") && document.getElementById("modal-mask").classList.contains("open");
    const drawerOpen = document.getElementById("drawerMask") && document.getElementById("drawerMask").classList.contains("open");
    const dpOpen = document.getElementById("detailPage") && document.getElementById("detailPage").classList.contains("open");
    const cfgOpen = document.getElementById("dpConfigModal") && document.getElementById("dpConfigModal").classList.contains("open");
    if (maskOpen || drawerOpen || dpOpen || cfgOpen || document.getElementById("processRuleEditor")) {
      document.body.classList.add("scroll-locked");
    } else {
      document.body.classList.remove("scroll-locked");
    }
  } catch (e) { /* ignore */ }
}
function confirmModal(title, msg) {
  return new Promise((resolve) => {
    const mask = document.getElementById("modal-mask");
    const box = document.getElementById("modal-box");
    box.innerHTML = "<h3>" + esc(title) + "</h3><p>" + esc(msg) + '</p><div class="macts">'
      + '<button class="tool-btn" id="modalCancel">取消</button><button class="tool-btn primary" id="modalOk">确认</button></div>';
    mask.classList.add("open");
    syncBodyScrollLock();
    const done = (v) => { mask.classList.remove("open"); syncBodyScrollLock(); resolve(v); };
    document.getElementById("modalCancel").onclick = () => done(false);
    document.getElementById("modalOk").onclick = () => done(true);
    mask.onclick = (e) => { if (e.target === mask) done(false); };
  });
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}
function highlight(text, tokens) {
  let s = esc(text);
  if (!tokens.length) return s;
  for (const t of tokens) {
    if (!t) continue;
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    s = s.replace(re, (m) => "<mark>" + m + "</mark>");
  }
  return s;
}

/* ---------- 数据加载 ---------- */
async function loadDataset() {
  const b64 = DATASET_B64;
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持 DecompressionStream，请使用较新版本的 Chrome / Edge / Safari 打开");
  }
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

function buildIndexes() {
  const ds = DATASET;
  schemaKeys = ds.schema.map((s) => s.key);
  ds.schema.forEach((s) => schemaByKey.set(s.key, s));
  ds.gov.forEach((g) => { GOV_META[g.id] = g; });
  ds.vconf.forEach((g) => vconfByVcode.set(g.vcode, g));
  Object.entries(ds.routeIssues || {}).forEach(([m, list]) => routeIssueMap.set(m, list));
  rows = ds.rows.map((r) => {
    const o = {};
    for (let i = 0; i < schemaKeys.length; i++) o[schemaKeys[i]] = r[i];
    o._flags = o.flags ? String(o.flags).split("|") : [];
    o._st = searchTextOf(o);
    return o;
  });
  rows.forEach((r) => byMaterial.set(r.material, r));
  lookupCodes = new Set(rows.flatMap((r) => [r.material, r.vcode]).filter(Boolean).map((v) => String(v).trim().toLowerCase()));
}
function searchTextOf(o) {
  const parts = [o.material, o.vcode, o.desc, o.cat, o.stock, o.spec, o.specC, o.brand, o.series, o.unit, o.npt, o.pack];
  for (const k of schemaKeys) {
    if (k.startsWith("_") || MDM_HIDDEN_KEYS.has(k)) continue;
    const v = o[k];
    if (typeof v === "string" && v) parts.push(v);
  }
  return parts.join(" ").toLowerCase();
}

/* ---------- 搜索匹配与精准定位辅助 ---------- */
function normalizeSearchMode(mode) { return mode === "exact" ? "exact" : "smart"; }
function looksLikeLookupCode(token) {
  if (lookupCodes.has(token) || /^\d{7,14}$/.test(token)) return true;
  if (/^\d+(?:x\d+)+$/i.test(token) || /^\d+(?:\.\d+)?(?:mm|cm|m|kg|g|ml|l)$/i.test(token)) return false;
  return /^(?=.*\d)[a-z0-9][a-z0-9_-]{2,}$/i.test(token);
}
function parseQuerySpec(qRaw, qMode, qField) {
  const q = (qRaw || "").trim();
  if (!q) return { empty: true, mode: qMode, field: qField, tokens: [], batchSet: null, prefixField: null, rawVal: "" };

  /* 支持快捷前缀语法：如 v:DEMO-V0003 / m:9900000001 / 品牌=示例品牌13 / 规格=130mm */
  let effField = qField || "all";
  let effMode = qMode || "smart";
  let body = q;
  const prefixMatch = q.match(/^(物料编码|编码|code|m|v码|vcode|v|物料规格|规格|spec|s|物料说明|说明|desc|d|品牌|brand|b|制造类别|mfg|品类三级|品类|cat|库存小类|stock|配方大类|formula)\s*[:=：]\s*(.+)$/i);
  if (prefixMatch) {
    const p = prefixMatch[1].toLowerCase();
    body = prefixMatch[2].trim();
    if (["物料编码", "编码", "code", "m"].includes(p)) effField = "material";
    else if (["v码", "vcode", "v"].includes(p)) effField = "vcode";
    else if (["物料规格", "规格", "spec", "s"].includes(p)) effField = "spec";
    else if (["物料说明", "说明", "desc", "d"].includes(p)) effField = "desc";
    else if (["品牌", "brand", "b"].includes(p)) effField = "brand";
    else if (["制造类别", "mfg"].includes(p)) effField = "制造类别";
    else if (["品类三级", "品类", "cat"].includes(p)) effField = "cat";
    else if (["库存小类", "stock"].includes(p)) effField = "stock";
    else if (["配方大类", "formula"].includes(p)) effField = "formula";
    if (q.includes("=")) effMode = "exact";
  }

  /* 精确等于语法：双引号包裹 "xxx" 或 Leading =xxx */
  if ((body.startsWith('"') && body.endsWith('"') && body.length > 2) || (body.startsWith("“") && body.endsWith("”") && body.length > 2)) {
    body = body.slice(1, -1).trim();
    effMode = "exact";
  } else if (body.startsWith("=")) {
    body = body.slice(1).trim();
    effMode = "exact";
  }

  const hasNewline = /[\r\n]/.test(body);
  const tokens = body.split(/[\s,，;；、\r\n\t]+/).filter(Boolean).map((t) => t.toLowerCase());
  /* 当输入包含换行符（如从 Excel 整列复制粘贴）或全部为 2 个以上物料编码/V码时，自动启用多码批查集合 */
  if (hasNewline && tokens.length >= 2 && effMode === "smart") {
    effMode = "batch";
  } else if (tokens.length >= 2 && effMode === "smart" && tokens.every(looksLikeLookupCode)) {
    effMode = "batch";
  }
  const batchSet = new Set(tokens);
  return { empty: !tokens.length, mode: effMode, field: effField, tokens, batchSet, hasNewline, rawVal: body.toLowerCase() };
}

function matchSearchQuery(r, qSpec) {
  if (!qSpec || qSpec.empty) return true;
  const { mode, field, tokens, batchSet, rawVal } = qSpec;

  const getFieldStr = (k) => String(r[k] === null || r[k] === undefined ? "" : r[k]).trim().toLowerCase();

  if (mode === "batch") {
    /* 多码精确批查：任一 token 精确匹配 物料编码 / V码 / 指定字段 */
    if (field !== "all") {
      const fv = getFieldStr(field);
      return batchSet.has(fv);
    }
    const m = getFieldStr("material"), v = getFieldStr("vcode");
    return batchSet.has(m) || (v !== "" && batchSet.has(v));
  }

  if (mode === "exact") {
    /* 精准等于匹配：指定字段完全等于输入值（或多词任一完全等于），若全字段则检查核心字段完全等于 */
    if (field !== "all") {
      const fv = getFieldStr(field);
      return fv === rawVal || (tokens.length > 1 && batchSet.has(fv));
    }
    const exactFields = ["material", "vcode", "spec", "desc", "brand", "制造类别", "formula", "cat", "stock"];
    for (const k of exactFields) {
      const fv = getFieldStr(k);
      if (fv && (fv === rawVal || (tokens.length > 1 && batchSet.has(fv)))) return true;
    }
    return false;
  }

  /* 默认 smart 模式（全局模糊搜索 + 字段限定模糊） */
  if (field !== "all") {
    const fv = getFieldStr(field);
    for (const t of tokens) {
      if (fv.indexOf(t) < 0) return false;
    }
    return true;
  }
  for (const t of tokens) {
    if (r._st.indexOf(t) < 0) return false;
  }
  return true;
}

/* 计算行与当前搜索词的精准匹配度得分（用于 smart 模式下将精准命中的编码/V码/规格/品牌自动置顶） */
function exactMatchRank(r, qSpec) {
  if (!qSpec || qSpec.empty) return 0;
  const rv = qSpec.rawVal;
  if (!rv) return 0;
  const m = String(r.material || "").toLowerCase();
  const v = String(r.vcode || "").toLowerCase();
  const sp = String(r.spec || "").toLowerCase();
  const ds = String(r.desc || "").toLowerCase();
  const br = String(r.brand || "").toLowerCase();
  if (m === rv) return 100;
  if (v && v === rv) return 95;
  if (ds === rv) return 90;
  if (sp === rv) return 85;
  if (br === rv) return 80;
  if (m.startsWith(rv) || (v && v.startsWith(rv))) return 60;
  return 0;
}

/* ---------- 计算层 ---------- */
const NO_SKIP = new Set();
function passFilters(r, skip) {
  const f = state.filters;
  if (!skip.has("custom") && state._customMatches && !state._customMatches.has(r.material)) return false;
  const cutoff = (DATASET.meta && DATASET.meta.createdCutoff) || "0000-00-00";
  if (!skip.has("status") && f.status && r.status !== f.status) return false;
  if (!skip.has("pre") && f.pre && r.pre !== f.pre) return false;
  if (!skip.has("scope")) {
    if (f.scope === "created2y" && String(r.created || "") < cutoff) return false;
    if (f.scope === "route" && !r.route) return false;
  }
  if (!skip.has("mfg") && f.mfg.size && !f.mfg.has(r["制造类别"] || "未填")) return false;
  if (!skip.has("formula") && f.formula.size && !f.formula.has(r.formula || "未填")) return false;
  if (!skip.has("cats") && f.cats.size && !f.cats.has(r.cat)) return false;
  if (!skip.has("stocks") && f.stocks.size && !f.stocks.has(r.stock || "未填")) return false;
  if (!skip.has("brands") && f.brands.size && !f.brands.has(r.brand || "未填")) return false;
  if (!skip.has("onlyBlock") && f.onlyBlock && !r.blocking) return false;
  if (!skip.has("onlyIssue") && f.onlyIssue && !(r.issueCount > 0)) return false;
  if (!skip.has("onlyVconf") && f.onlyVconf && !r.vconf) return false;
  if (!skip.has("onlyPdf") && f.onlyPdf && !(r.pdfCount > 0)) return false;
  if (!skip.has("onlyBasket") && f.onlyBasket && !basketSet.has(r.material)) return false;
  if (!skip.has("onlyPdfRule") && f.onlyPdfRule) {
    let hit = false;
    for (const fl of r._flags) { const p = fl.split(":"); if (p.length >= 3 && p[0].startsWith("PF") && p[1] === f.onlyPdfRule) { hit = true; break; } }
    if (!hit) return false;
  }
  if (!skip.has("onlyFieldIssue") && f.onlyFieldIssue) {
    const fk = (DATASET.flagFieldToKey || {});
    let hit = false;
    for (const fl of r._flags) { const seg = fl.split(":").pop(); if ((fk[seg] || seg) === f.onlyFieldIssue) { hit = true; break; } }
    if (!hit) return false;
  }
  if (!skip.has("q") && state.q) {
    if (!matchSearchQuery(r, state._qSpec)) return false;
  }
  return true;
}
/* rowsInScope(跳过组)：给筛选标签做"点它会命中多少"的联动计数 */
function rowsInScope(skipArr) {
  const skip = new Set(skipArr || []);
  const out = [];
  for (const r of rows) if (passFilters(r, skip)) out.push(r);
  return out;
}

/* 当用户在搜索框输入词时，探测在当前筛选下有哪些字段存在“精准完全命中”或“字段包含命中”，生成一键精准锁定胶囊 */
function computeExactHints(qSpec) {
  if (!qSpec || qSpec.empty) return [];
  const baseRows = rowsInScope(["q"]);
  const rv = qSpec.rawVal;
  if (!rv) return [];
  const checkCols = [
    { key: "material", label: "物料编码" },
    { key: "vcode",    label: "V码" },
    { key: "spec",     label: "物料规格" },
    { key: "brand",    label: "品牌" },
    { key: "cat",      label: "品类三级" },
    { key: "stock",    label: "库存小类" },
    { key: "制造类别", label: "制造类别" },
    { key: "desc",     label: "物料说明" },
  ];
  const hints = [];
  for (const col of checkCols) {
    let exactCnt = 0;
    let containsCnt = 0;
    let sampleExactVal = "";
    for (const r of baseRows) {
      const raw = r[col.key];
      if (raw === null || raw === undefined || raw === "") continue;
      const sv = String(raw).trim();
      const low = sv.toLowerCase();
      if (low === rv || (qSpec.tokens.length > 1 && qSpec.batchSet.has(low))) {
        exactCnt++;
        if (!sampleExactVal) sampleExactVal = sv;
      } else if (low.indexOf(rv) >= 0) {
        containsCnt++;
      }
    }
    if (exactCnt > 0) {
      hints.push({ kind: "exact", field: col.key, label: col.label, val: sampleExactVal || state.q, count: exactCnt });
    } else if (containsCnt > 0 && ["material", "vcode", "spec", "brand", "desc"].includes(col.key)) {
      hints.push({ kind: "field", field: col.key, label: col.label, val: state.q, count: containsCnt });
    }
  }
  return hints;
}

/* 规则命中按物料去重，问题明细与治理归口按标记条数统计，与源表构建口径一致。 */
function computeScopedRuleStats(records) {
  const pdfRules = {};
  const govCounts = {};
  const pdfScope = { total: records.length, inScope: 0, excludedInvalid: 0, excludedImportType: 0, excluded1900: 0 };
  for (const rule of DATASET.pdfRules || []) pdfRules[String(rule.no)] = { hits: 0, block: 0, details: new Map() };
  for (const r of records) {
    if (typeof processInScope === "function") { if (processInScope(r)) pdfScope.inScope++; }
    else if (r.status === "有效" && !String(r.prodType || "").includes("进口") && !String(r.material).startsWith("1900")) pdfScope.inScope++;
    const hit = new Set(), block = new Set();
    for (const flag of r._flags) {
      const [type, no, detail] = flag.split(":");
      const meta = FLAG_META[type];
      if (meta && meta.gov) govCounts[meta.gov] = (govCounts[meta.gov] || 0) + 1;
      if (!type.startsWith("PF") || !pdfRules[no] || detail === undefined) continue;
      hit.add(no);
      if (BLOCKING_TYPES.includes(type)) block.add(no);
      const key = type + "·" + detail;
      pdfRules[no].details.set(key, (pdfRules[no].details.get(key) || 0) + 1);
    }
    hit.forEach((no) => pdfRules[no].hits++);
    block.forEach((no) => pdfRules[no].block++);
  }
  for (const stats of Object.values(pdfRules)) {
    stats.top = [...stats.details].sort((a, b) => b[1] - a[1]).slice(0, 4);
    delete stats.details;
  }
  return { pdfRules, govCounts, pdfScope };
}

function computeDerived() {
  state._qSpec = parseQuerySpec(state.q, state.qMode, state.qField);
  state.tokens = state._qSpec.tokens || [];
  prepareCustomFilterMatches();
  const out = [];
  for (const r of rows) if (passFilters(r, NO_SKIP)) out.push(r);
  const key = state.sort.key, dir = state.sort.dir;
  const type = schemaByKey.get(key) ? schemaByKey.get(key).type : "text";
  const hasQ = !state._qSpec.empty;
  out.sort((a, b) => {
    /* 若有搜索词且在默认排序下，自动把完全精准匹配的行排在最前，解决“全局模糊搜出一堆、精准命中的反而被淹没”的痛点 */
    if (hasQ) {
      const ra = exactMatchRank(a, state._qSpec);
      const rb = exactMatchRank(b, state._qSpec);
      if (ra !== rb) return rb - ra;
    }
    const va = a[key], vb = b[key];
    const na = va === null || va === undefined || va === "", nb = vb === null || vb === undefined || vb === "";
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    if (type === "number") return (va - vb) * dir;
    if (type === "date") return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    return String(va).localeCompare(String(vb), "zh-Hans-CN") * dir;
  });
  const pages = Math.max(1, Math.ceil(out.length / state.pageSize));
  if (state.page > pages) state.page = pages;
  /* 范围统计：所有汇总数字的口径 = 当前筛选命中的物料 */
  let sValid = 0, sInvalid = 0, sBlocking = 0, sIssues = 0, sPdf = 0, sPdfBlock = 0, sRoute = 0, sVconf = 0;
  const vconfVcodes = new Set();
  for (const r of out) {
    if (r.status === "有效") sValid++; else sInvalid++;
    if (r.blocking) sBlocking++;
    if (r.issueCount > 0) sIssues++;
    if (r.pdfCount > 0) sPdf++;
    if (r.pdfBlock > 0) sPdfBlock++;
    if (r.route) sRoute++;
    if (r.vconf) {
      sVconf++;
      if (r.vcode) vconfVcodes.add(r.vcode);
    }
  }
  const exactHints = hasQ ? computeExactHints(state._qSpec) : [];
  derived = {
    filtered: out, sorted: out, total: out.length, pages,
    pageRows: out.slice((state.page - 1) * state.pageSize, state.page * state.pageSize),
    exactHints,
    ruleStats: computeScopedRuleStats(out),
    stats: { total: out.length, valid: sValid, invalid: sInvalid, blocking: sBlocking, withIssues: sIssues, pdfHits: sPdf, pdfBlock: sPdfBlock, routeCovered: sRoute, vconf: sVconf, vconfGroups: vconfVcodes.size },
  };
}

/* 全库命中与当前范围分别统计，避免把“被筛掉”误报成“没有这个料”。 */
function querySearchReport() {
  const spec = state._qSpec || parseQuerySpec(state.q, state.qMode, state.qField);
  const allMatches = spec.empty ? rows : rows.filter((r) => matchSearchQuery(r, spec));
  const report = { globalTotal: allMatches.length, excluded: allMatches.length - derived.total, batch: null };
  if (spec.empty || spec.mode !== "batch") return report;
  const counts = new Map([...new Set(spec.tokens)].map((token) => [token, { all: new Set(), scoped: new Set() }]));
  const scoped = new Set(derived.filtered.map((r) => r.material));
  const keys = spec.field === "all" ? ["material", "vcode"] : [spec.field];
  for (const r of allMatches) for (const key of keys) {
    const entry = counts.get(String(r[key] == null ? "" : r[key]).trim().toLowerCase());
    if (entry) { entry.all.add(r.material); if (scoped.has(r.material)) entry.scoped.add(r.material); }
  }
  const batch = { total: counts.size, repeated: spec.tokens.length - counts.size, found: [], missing: [], excluded: [], ambiguous: [] };
  for (const [token, entry] of counts) {
    const code = token.toUpperCase();
    if (!entry.all.size) batch.missing.push(code);
    else if (!entry.scoped.size) batch.excluded.push(code);
    else { batch.found.push(code); if (entry.scoped.size > 1) batch.ambiguous.push({ code, count: entry.scoped.size }); }
  }
  report.batch = batch;
  return report;
}
