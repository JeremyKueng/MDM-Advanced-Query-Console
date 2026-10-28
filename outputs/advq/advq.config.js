/* 个人配置独立于构建产物；旧版浏览器配置只迁移，不因代码版本更新重置。 */
const CONFIG_FORMAT = "mdm-workbench-config";
const personalConfig = { ready: false, available: false, endpoint: "", path: "", status: "正在读取个人配置…", error: "", lastAt: "", hasStored: false };
let configSnapshot = "", configDocument = null, configWriting = false, configQueued = null, shortcutDraft = null;
const stringsOnly = (v) => Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string"))] : [];
const QUERY_FIELD_BUNDLES = {
  "日常查料": ["material", "vcode", "spec", "desc", "brand", "cat", "status", "unit"],
  "重量尺寸": ["material", "vcode", "spec", "desc", "net", "gross", "netNG", "wetNet", "体积", "重量单位", "体积单位", "长(外包装)", "宽(外包装)", "高(外包装)"],
  "维护信息": ["material", "vcode", "spec", "desc", "created", "updated", "申请人", "部门", "prodType", "status", "pre"],
};
function fieldViewOptions() {
  return [...Object.keys(QUERY_FIELD_BUNDLES), ...mdmPresetNames()].map((name) => ({ id: "preset:" + name, name, builtin: true }))
    .concat(state.savedViews.map((v) => ({ id: "view:" + v.id, name: v.name, builtin: false })));
}
function defaultShortcuts() { return ["日常查料", "包装视图", "重量尺寸", "维护信息"].map((name) => "preset:" + name); }
function defaultQuickDetailView() {
  return { version: 1, columns: 3, hideEmpty: false, showDescription: true, showAnalysis: true, showAllFields: true, sections: [
    { id: "identity", title: "识别与分类", enabled: true, fields: ['vcode','spec','brand','cat','stock','制造类别','formula','status','pre','unit'] },
    { id: "packaging", title: "包装与装数", enabled: true, fields: ['load','pack','纸盒尺寸','中包包装方式','单提长','单提宽','单提高'] },
    { id: "dimensions", title: "重量与尺寸", enabled: true, fields: ['net','gross','netNG','wetNet','体积','长(外包装)','宽(外包装)','高(外包装)'] },
    { id: "maintenance", title: "创建与维护", enabled: true, fields: ['created','updated','申请人','部门','prodType'] },
  ] };
}
function validateQuickDetailView(view) {
  if (!view || typeof view !== "object" || Array.isArray(view) || view.version !== 1 || ![2, 3].includes(view.columns) || !Array.isArray(view.sections) || !view.sections.length || view.sections.length > 20) throw new Error("速览配置格式不正确");
  for (const key of ["hideEmpty", "showDescription", "showAnalysis", "showAllFields"]) if (typeof view[key] !== "boolean") throw new Error("速览显示选项格式不正确");
  const ids = new Set();
  for (const section of view.sections) {
    if (!section || typeof section !== "object" || typeof section.id !== "string" || !section.id || ids.has(section.id) || typeof section.title !== "string" || !section.title.trim() || section.title.length > 60 || typeof section.enabled !== "boolean" || !Array.isArray(section.fields) || section.fields.some((key) => typeof key !== "string")) throw new Error("速览分区缺少有效名称、字段或唯一标识");
    ids.add(section.id);
  }
}
function normalizeQuickDetailView(view) {
  const source = view || defaultQuickDetailView();
  return { version: 1, columns: source.columns, hideEmpty: source.hideEmpty, showDescription: source.showDescription, showAnalysis: source.showAnalysis, showAllFields: source.showAllFields,
    sections: source.sections.map((s) => ({ id: s.id, title: s.title.trim(), enabled: s.enabled, fields: [...new Set(s.fields)].filter((key) => schemaByKey.has(key) && !MDM_HIDDEN_KEYS.has(key)) })) };
}
function captureUserSettings() {
  const f = state.filters;
  return {
    v: 8, view: state.view, tab: state.tab, order: [...state.order], visible: orderedVisibleKeys(),
    savedViews: state.savedViews, activeFieldView: state.activeFieldView, viewShortcuts: state.viewShortcuts, presetViewOrder: [...state.presetViewOrder],
    q: state.q, qMode: state.qMode, qField: state.qField, filterCollapsed: state.filterCollapsed, queryUiVersion: 1,
    queryViews: state.queryViews, activeQueryView: state.activeQueryView,
    expandedMore: [...state.expandedMore], sort: state.sort, pageSize: state.pageSize, basket: state.basket,
    analyzeField: state.analyzeField, cmpDiffOnly: state.cmpDiffOnly,
    processRules: typeof processConfig !== "undefined" ? processConfig : null,
    dpTemplates: state.dpTemplates, dpShowClassicCols: state.dpShowClassicCols, quickDetailView: normalizeQuickDetailView(state.quickDetailView),
    filters: { ...f, mfg: [...f.mfg], formula: [...f.formula], cats: [...f.cats], stocks: [...f.stocks], brands: [...f.brands], customConditions: normalizeCustomConditions(f.customConditions), columnFilters: normalizeColumnFilters(f.columnFilters) },
    focusFilter: { ...state.focusFilter, page: 1 }, analyzeFilter: { ...state.analyzeFilter },
    vconfFilter: { ...state.vconfFilter, page: 1 }, processCheckFilter: { ...state.processCheckFilter, page: 1 }, mpsFilter: { ...state.mpsFilter, page: 1 },
  };
}
function decodeUserConfig(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("配置内容不是有效对象");
  let s = doc;
  if (doc.type === CONFIG_FORMAT) {
    if (doc.schemaVersion !== 1) throw new Error("配置格式版本暂不支持，请保留原文件");
    s = doc.settings;
  } else if (doc.type && doc.type !== "wb_mdm_advq_backup") throw new Error("不是工作台个人配置文件");
  if (!s || !Number.isInteger(s.v) || s.v < 1 || s.v > 8) throw new Error("配置版本无效或暂不支持");
  const arrayKeys = ["order", "visible", "basket", "expandedMore", "viewShortcuts", "presetViewOrder"];
  for (const k of arrayKeys) if (k in s && (!Array.isArray(s[k]) || s[k].some((x) => typeof x !== "string"))) throw new Error(k + " 配置格式不正确");
  if (s.filters && (typeof s.filters !== "object" || Array.isArray(s.filters))) throw new Error("筛选配置格式不正确");
  for (const k of ["mfg", "formula", "cats", "stocks", "brands", "customConditions"]) if (s.filters && k in s.filters && !Array.isArray(s.filters[k])) throw new Error("筛选项 " + k + " 格式不正确");
  if ("savedViews" in s && (!Array.isArray(s.savedViews) || s.savedViews.some((v) => !v || typeof v.id !== "string" || !v.id || typeof v.name !== "string" || !v.name.trim() || !Array.isArray(v.visible) || v.visible.some((k) => typeof k !== "string") || (v.order && (!Array.isArray(v.order) || v.order.some((k) => typeof k !== "string")))))) throw new Error("自定义视图格式不正确");
  if (s.savedViews && new Set(s.savedViews.map((v) => v.id)).size !== s.savedViews.length) throw new Error("自定义视图标识重复");
  validateQueryViews(s.queryViews);
  if ("dpTemplates" in s && (!Array.isArray(s.dpTemplates) || s.dpTemplates.some((t) => !t || typeof t.id !== "string" || typeof t.name !== "string" || !Array.isArray(t.blocks) || t.blocks.some((b) => !b || typeof b !== "object" || (b.fields && (!Array.isArray(b.fields) || b.fields.some((k) => typeof k !== "string"))))))) throw new Error("详情模板格式不正确");
  if ("quickDetailView" in s) validateQuickDetailView(s.quickDetailView);
  const checkConditions = (items) => {
    if (items !== undefined && (!Array.isArray(items) || items.some((c) => !c || typeof c.field !== "string" || typeof c.op !== "string"))) throw new Error("条件配置格式不正确");
  };
  if (s.filters) validateColumnFilters(s.filters.columnFilters);
  if (s.sort && "explicit" in s.sort && typeof s.sort.explicit !== "boolean") throw new Error("排序配置格式不正确");
  if (s.filters && s.filters.customConditions !== undefined) validateCustomConditions(s.filters.customConditions);
  for (const t of s.dpTemplates || []) {
    checkConditions(t.conditions);
    for (const b of t.blocks) {
      for (const k of ["accentFields"]) if (k in b && (!Array.isArray(b[k]) || b[k].some((x) => typeof x !== "string"))) throw new Error("模板字段格式不正确");
      for (const k of ["subBoxes", "compareRows"]) if (k in b && (!Array.isArray(b[k]) || b[k].some((x) => !x || typeof x !== "object" || (x.fields && (!Array.isArray(x.fields) || x.fields.some((v) => typeof v !== "string")))))) throw new Error("模板子区块格式不正确");
    }
  }
  if (s.processCheckFilter && (typeof s.processCheckFilter !== "object" || Array.isArray(s.processCheckFilter) || ("onlyIssue" in s.processCheckFilter && typeof s.processCheckFilter.onlyIssue !== "boolean"))) throw new Error("工艺属性检查筛选配置格式不正确");
  if (s.processRules && typeof validateProcessConfig === "function") validateProcessConfig(s.processRules);
  if (JSON.stringify(doc).length > 2 * 1024 * 1024) throw new Error("配置文件超过 2 MB");
  return JSON.parse(JSON.stringify(s));
}
function applyUserSettings(s) {
  state.quickDetailView = normalizeQuickDetailView(s.quickDetailView);
  if (typeof applyProcessRules === "function") {
    processConfig = s.processRules || null;
    applyProcessRules(processActiveConfig());
  }
  const valid = new Set(schemaKeys.filter((k) => !MDM_HIDDEN_KEYS.has(k)));
  const clean = (a) => stringsOnly(a).filter((k) => valid.has(k));
  const pinned = PINNED_KEYS.filter((k) => valid.has(k));
  const order = (a) => [...pinned, ...clean(a).filter((k) => !pinned.includes(k)), ...[...valid].filter((k) => !pinned.includes(k) && !clean(a).includes(k))];
  const visible = (a) => [...pinned, ...clean(a).filter((k) => !pinned.includes(k))];
  state.order = order(s.order || QUERY_FIELD_BUNDLES["日常查料"]);
  state.visible = visible(Array.isArray(s.visible) ? s.visible : QUERY_FIELD_BUNDLES["日常查料"]);
  syncVisibleOrder();
  state.savedViews = (s.savedViews || []).map((v) => ({ id: v.id, name: v.name.trim().slice(0, 40), order: order(v.order || v.visible), visible: visible(v.visible) }));
  state.presetViewOrder = stringsOnly(s.presetViewOrder).filter((name) => name !== "工艺属性检查" && Object.prototype.hasOwnProperty.call(DATASET.presets, name));
  const options = new Set(fieldViewOptions().map((o) => o.id));
  state.activeFieldView = options.has(s.activeFieldView) ? s.activeFieldView : Array.isArray(s.visible) ? "" : "preset:日常查料";
  state.viewShortcuts = (Array.isArray(s.viewShortcuts) ? stringsOnly(s.viewShortcuts) : defaultShortcuts()).filter((k) => options.has(k));
  state.view = s.view === "card" ? "card" : "table";
  state.tab = ["results", "focus", "vconf", "process", "analyze", "rules", "mps"].includes(s.tab) ? s.tab : "results";
  state.q = typeof s.q === "string" ? s.q : "";
  state.qMode = normalizeSearchMode(s.qMode);
  state.qField = s.qField === "all" || valid.has(s.qField) ? s.qField : "all";
  state.filterCollapsed = s.queryUiVersion === 1 ? s.filterCollapsed !== false : true;
  state.queryViews = (s.queryViews || []).map((v) => ({ id: v.id, name: v.name.trim().slice(0, 40), context: normalizeQueryContext(v.context) }));
  state.activeQueryView = state.queryViews.some((v) => v.id === s.activeQueryView) ? s.activeQueryView : "";
  state.expandedMore = new Set(stringsOnly(s.expandedMore));
  state.sort = s.sort && valid.has(s.sort.key) ? { key: s.sort.key, dir: s.sort.dir === -1 ? -1 : 1, ...(s.sort.explicit !== undefined ? { explicit: s.sort.explicit } : {}) } : { key: "material", dir: 1 };
  state.pageSize = [50, 100, 200].includes(s.pageSize) ? s.pageSize : 50;
  state.page = 1;
  state.basket = stringsOnly(s.basket).filter((m) => byMaterial.has(m)).slice(0, 8);
  state.basketExpanded = false;
  basketSet.clear(); state.basket.forEach((m) => basketSet.add(m));
  state.analyzeField = valid.has(s.analyzeField) ? s.analyzeField : valid.has("纸盒尺寸") ? "纸盒尺寸" : state.visible[0];
  state.cmpDiffOnly = !!s.cmpDiffOnly;
  state.dpShowClassicCols = !!s.dpShowClassicCols;
  state.dpTemplates = s.dpTemplates && s.dpTemplates.length ? s.dpTemplates : buildDefaultDpTemplates();
  state.dpTemplates.forEach((t) => t.blocks.forEach((b) => {
    if (Array.isArray(b.fields)) b.fields = b.fields.filter((k) => !MDM_HIDDEN_KEYS.has(k));
    for (const group of ["subBoxes", "compareRows"]) for (const item of b[group] || []) if (Array.isArray(item.fields)) item.fields = item.fields.filter((k) => !MDM_HIDDEN_KEYS.has(k));
  }));
  state.dpEditingTplId = state.dpTemplates[0] ? state.dpTemplates[0].id : "";
  const f = s.filters || {};
  for (const k of ["mfg", "formula", "cats", "stocks", "brands"]) state.filters[k] = new Set(stringsOnly(f[k]));
  for (const k of ["onlyBlock", "onlyIssue", "onlyVconf", "onlyBasket", "onlyPdf"]) state.filters[k] = !!f[k];
  state.filters.status = typeof f.status === "string" ? f.status : "有效";
  for (const k of ["pre", "onlyFieldIssue", "onlyPdfRule"]) state.filters[k] = typeof f[k] === "string" ? f[k] : "";
  state.filters.scope = f.scope === "created2y" ? f.scope : "";
  state.filters.customLogic = f.customLogic === "OR" ? "OR" : "AND";
  state.filters.customConditions = normalizeCustomConditions(f.customConditions);
  state.filters.columnFilters = normalizeColumnFilters(f.columnFilters);
  state.focusFilter = { group: "", reason: "", q: "", sort: "severity", page: 1, pageSize: 40 };
  state.analyzeFilter = { q: "", sort: "issue", scopeMode: "scope", valMode: "top", family: "" };
  state.vconfFilter = { q: "", sort: "materials", expandAll: false, page: 1 };
  state.processCheckFilter = { onlyIssue: typeof s.mpsFilter?.attributeOnlyIssue === "boolean" ? s.mpsFilter.attributeOnlyIssue : true, page: 1 };
  state.mpsFilter = { status: "", cat: "", issueType: "", onlyIssue: false, page: 1 };
  // 旧版在 MPS 子页查看工艺属性的用户，迁移到主数据治理的独立页。
  if (s.tab === "mps" && s.mpsFilter?.view === "attributes") state.tab = "process";
  for (const group of ["focusFilter", "analyzeFilter", "vconfFilter", "processCheckFilter", "mpsFilter"]) {
    const src = s[group];
    if (!src || typeof src !== "object") continue;
    for (const k of Object.keys(state[group])) if (k !== "page" && typeof src[k] === typeof state[group][k]) state[group][k] = src[k];
  }
  state.fieldViewDraftName = null;
  shortcutDraft = null;
}
function configDoc(settings) { return { type: CONFIG_FORMAT, schemaVersion: 1, savedAt: new Date().toISOString(), settings }; }
function cacheConfig(doc, pending) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ...doc, _diskPending: pending })); return true; }
  catch (e) { personalConfig.error = "浏览器缓存写入失败：" + e.message; return false; }
}
async function configRequest(endpoint, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(endpoint, { ...options, cache: "no-store", signal: controller.signal });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "个人配置服务不可用");
    return data;
  } finally { clearTimeout(timer); }
}
async function loadState() {
  let cached = null, cachedSettings = null, disk = null;
  try { cached = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (cached) cachedSettings = decodeUserConfig(cached); }
  catch (e) {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) localStorage.setItem(LS_KEY + "_unreadable", raw); } catch (err) { /* 原内容仍在原缓存中 */ }
    personalConfig.error = "原浏览器配置读取失败：" + e.message;
  }
  const endpoint = location.protocol === "http:" || location.protocol === "https:" ? location.origin + "/api/user-config" : "http://127.0.0.1:4173/api/user-config";
  personalConfig.endpoint = endpoint;
  try {
    disk = await configRequest(endpoint);
    personalConfig.available = true;
    personalConfig.path = disk.configPath || "";
    if (disk.exists) decodeUserConfig(disk.config);
  } catch (e) { personalConfig.error = e.message; personalConfig.available = false; }
  const preferPending = cachedSettings && cached._diskPending && (!disk || !disk.exists || (cached.savedAt || "") > (disk.config.savedAt || ""));
  const selected = preferPending ? cachedSettings : disk && disk.exists && personalConfig.available ? decodeUserConfig(disk.config) : cachedSettings;
  applyUserSettings(selected || { v: 6 });
  personalConfig.hasStored = !!selected;
  personalConfig.ready = true;
  configSnapshot = JSON.stringify(captureUserSettings());
  configDocument = configDoc(JSON.parse(configSnapshot));
  if (selected) {
    personalConfig.lastAt = preferPending ? cached.savedAt || "" : disk && disk.exists ? disk.config.savedAt : cached.savedAt || "";
    configDocument.savedAt = personalConfig.lastAt || configDocument.savedAt;
    const migrate = personalConfig.available && (preferPending || !disk.exists);
    cacheConfig(configDocument, !!migrate || (!personalConfig.available && !!(cached && cached._diskPending)));
    if (migrate) queueConfigWrite(configDocument);
  }
  personalConfig.status = personalConfig.available ? disk && disk.recovered ? "已从上一份本机配置恢复" : selected ? "已读取个人配置" : "设置修改后自动保存到本机" : "本机配置服务不可用，暂存浏览器";
  return !selected;
}
function saveState() {
  if (!personalConfig.ready) return;
  const settings = JSON.parse(JSON.stringify(captureUserSettings())), snapshot = JSON.stringify(settings);
  if (snapshot === configSnapshot) return;
  configSnapshot = snapshot;
  configDocument = configDoc(settings);
  personalConfig.hasStored = true;
  const cached = cacheConfig(configDocument, true);
  personalConfig.status = cached ? "已暂存浏览器，正在保存到本机…" : "正在保存到本机…";
  updatePersonalConfigStatus();
  queueConfigWrite(configDocument);
}
const saveStateDebounced = debounce(saveState, 300);
async function queueConfigWrite(doc) {
  configQueued = doc;
  if (configWriting) return;
  configWriting = true;
  while (configQueued) {
    const current = configQueued; configQueued = null;
    try {
      const result = await configRequest(personalConfig.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current), keepalive: false });
      personalConfig.available = true; personalConfig.path = result.configPath || personalConfig.path;
      personalConfig.error = ""; personalConfig.lastAt = current.savedAt;
      if (configDocument === current) {
        cacheConfig(current, false);
        personalConfig.status = "已保存到本机";
      }
    } catch (e) {
      personalConfig.available = false; personalConfig.error = e.message;
      personalConfig.status = "未写入本机，请重试保存或导出配置";
    }
    updatePersonalConfigStatus();
  }
  configWriting = false;
}
function updatePersonalConfigStatus() {
  for (const id of ["fdConfigStatus", "personalConfigStatus", "prConfigStatus", "quickConfigStatus"]) {
    const el = document.getElementById(id); if (el) { el.textContent = personalConfig.status; el.title = personalConfig.error || personalConfig.path; }
  }
}
function exportPersonalConfig() {
  saveState();
  download("MDM个人配置-" + stamp() + ".json", JSON.stringify(configDoc(captureUserSettings()), null, 2), "application/json");
  toast("已导出个人配置（含我的查询、字段视图、速览配置、详情模板和工艺属性规则）");
}
function openPersonalConfig() {
  const mask = document.getElementById("modal-mask"), box = document.getElementById("modal-box");
  box.innerHTML = '<h3>个人配置</h3><p>我的查询、字段显示与顺序、自定义字段视图、常用视图入口、搜索筛选、速览配置、详情模板及生效条件、工艺属性规则、每页条数等会保存。原始物料数据另行管理。</p>'
    + '<p><b id="personalConfigStatus">' + esc(personalConfig.status) + '</b><br><small>' + esc(personalConfig.path || "本机配置服务连接后显示保存位置") + '</small></p>'
    + '<p>配置文件独立存放，更新代码或重新生成页面后继续使用。换电脑时可导出后导入。</p>'
    + '<div class="macts"><button class="tool-btn" data-act="config-retry">重试保存</button><button class="tool-btn" data-act="config-export">导出配置</button><button class="tool-btn" data-act="config-import">导入配置</button><button class="tool-btn primary" id="configClose">关闭</button></div>';
  mask.classList.add("open");
  const close = () => { mask.classList.remove("open"); mask.onclick = null; syncBodyScrollLock(); };
  document.getElementById("configClose").onclick = close;
  mask.onclick = (e) => { if (e.target === mask) close(); };
  syncBodyScrollLock();
}
function fieldViewKeys(id) {
  if (id.startsWith("preset:")) return QUERY_FIELD_BUNDLES[id.slice(7)] || DATASET.presets[id.slice(7)] || [];
  const v = state.savedViews.find((v) => "view:" + v.id === id);
  return v ? v.visible : [];
}
function fieldViewIsDirty() {
  if (!state.activeFieldView) return false;
  const keys = fieldViewKeys(state.activeFieldView);
  const validKeys = [...new Set([...PINNED_KEYS, ...keys])].filter((k) => schemaByKey.has(k) && !MDM_HIDDEN_KEYS.has(k));
  return JSON.stringify(orderedVisibleKeys()) !== JSON.stringify(validKeys);
}
function renderViewShortcuts() {
  const el = document.getElementById("resultViewShortcuts"); if (!el) return;
  const all = new Map(fieldViewOptions().map((v) => [v.id, v]));
  const selected = state.activeFieldView && !fieldViewIsDirty() ? state.activeFieldView : "";
  el.innerHTML = '<span class="view-shortcut-label">展示字段</span><div class="view-shortcut-list">' + state.viewShortcuts.filter((id) => all.has(id)).map((id) => '<button class="tool-btn' + (selected === id ? ' active' : '') + '" data-act="field-view-apply" data-v="' + esc(id) + '" title="只切换字段，不改变搜索和筛选">' + esc(all.get(id).name) + '</button>').join("")
    + '</div><select class="field-view-picker" data-act="field-view-select" aria-label="更多字段组合"><option value="">更多字段…</option>'
    + [...all.values()].map((v) => '<option value="' + esc(v.id) + '">' + esc(v.name) + '</option>').join("") + '</select>'
    + '<button class="view-shortcut-config" data-act="configure-shortcuts" title="选择常用字段组合及排列顺序">' + ic("settings", 13) + '</button>';
}
function syncSavedViewControls() {
  const sel = document.getElementById("fdSavedViewSel"); if (!sel) return;
  const active = state.savedViews.find((v) => "view:" + v.id === state.activeFieldView);
  sel.innerHTML = '<option value="">新增自定义视图</option>' + state.savedViews.map((v) => '<option value="view:' + esc(v.id) + '">' + esc(v.name) + '</option>').join("");
  sel.value = active ? "view:" + active.id : "";
  const name = document.getElementById("fdViewName");
  if (name && document.activeElement !== name) name.value = state.fieldViewDraftName != null ? state.fieldViewDraftName : active ? active.name : "";
  const status = document.getElementById("fdViewStatus");
  status.textContent = active ? fieldViewIsDirty() || name && name.value.trim() !== active.name ? "未保存修改" : "已保存视图" : "勾选字段后命名保存";
  document.getElementById("fdViewDelete").disabled = !active;
  document.getElementById("fdViewNew").disabled = !active;
  updatePersonalConfigStatus();
  renderViewShortcuts();
}
function renderShortcutEditor() {
  const el = document.getElementById("fdShortcutOptions"); if (!el) return;
  if (!shortcutDraft) shortcutDraft = [...state.viewShortcuts];
  const options = fieldViewOptions();
  const arranged = [...shortcutDraft.map((id) => options.find((o) => o.id === id)).filter(Boolean), ...options.filter((o) => !shortcutDraft.includes(o.id))];
  el.innerHTML = arranged.map((o) => {
    const idx = shortcutDraft.indexOf(o.id), on = idx >= 0;
    return '<div class="fd-shortcut-option"><label><input type="checkbox" data-act="shortcut-toggle" data-v="' + esc(o.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(o.name) + '</span><small>' + (o.builtin ? '系统预设' : '我的视图') + '</small></label>'
      + (on ? '<span class="fd-shortcut-order"><small>' + (idx + 1) + '</small><button class="mini-btn" data-act="shortcut-up" data-v="' + esc(o.id) + '"' + (idx === 0 ? ' disabled' : '') + ' aria-label="上移 ' + esc(o.name) + '">↑</button><button class="mini-btn" data-act="shortcut-down" data-v="' + esc(o.id) + '"' + (idx === shortcutDraft.length - 1 ? ' disabled' : '') + ' aria-label="下移 ' + esc(o.name) + '">↓</button></span>' : '') + '</div>';
  }).join("");
  const changed = JSON.stringify(shortcutDraft) !== JSON.stringify(state.viewShortcuts);
  document.getElementById("fdShortcutStatus").textContent = changed ? "未保存修改" : "已保存 · 按勾选顺序显示";
}
function applyFieldView(id) {
  const option = fieldViewOptions().find((v) => v.id === id); if (!option) return;
  const custom = state.savedViews.find((v) => "view:" + v.id === id);
  state.activeFieldView = id;
  state.fieldViewDraftName = null;
  if (custom) state.order = [...custom.order];
  applyVisibleListOrder(fieldViewKeys(id));
  syncSavedViewControls(); renderViewShortcuts();
  toast("已切换到「" + option.name + "」");
}
function saveNamedFieldView(asNew = false) {
  const input = document.getElementById("fdViewName"), name = (input.value || "").trim().slice(0, 40);
  if (!name) { toast("请填写自定义视图名称", true); input.focus(); return; }
  let active = !asNew && state.savedViews.find((v) => "view:" + v.id === state.activeFieldView);
  if (state.savedViews.some((v) => v.name === name && v !== active)) { toast("已有同名视图，请换一个名称", true); input.focus(); return; }
  const v = { id: active ? active.id : "fv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6), name, order: [...state.order], visible: orderedVisibleKeys() };
  if (active) state.savedViews[state.savedViews.indexOf(active)] = v;
  else state.savedViews.push(v);
  state.activeFieldView = "view:" + v.id;
  state.fieldViewDraftName = null;
  saveState(); syncSavedViewControls(); renderShortcutEditor();
  toast("已保存视图「" + name + "」");
}

/* 查询视图保存完整查询上下文；字段视图继续只换列，兼容原有配置。 */
function validateQueryViews(views) {
  if (views === undefined) return;
  if (!Array.isArray(views)) throw new Error("我的查询配置必须为列表");
  const ids = new Set();
  for (const v of views) {
    if (!v || typeof v.id !== "string" || !v.id || ids.has(v.id) || typeof v.name !== "string" || !v.name.trim()) throw new Error("我的查询名称或标识无效");
    ids.add(v.id);
    const c = v.context;
    if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.q !== "string" || !["smart", "exact", "batch"].includes(c.qMode) || typeof c.qField !== "string") throw new Error("我的查询搜索配置无效");
    for (const key of ["visible", "order"]) if (!Array.isArray(c[key]) || c[key].some((x) => typeof x !== "string")) throw new Error("我的查询字段配置无效");
    if (!c.sort || typeof c.sort.key !== "string" || ![1, -1].includes(c.sort.dir) || !["table", "card"].includes(c.view)) throw new Error("我的查询展示配置无效");
    if (!c.filters || typeof c.filters !== "object" || Array.isArray(c.filters)) throw new Error("我的查询筛选配置无效");
    for (const k of ["mfg", "formula", "cats", "stocks", "brands"]) if (!Array.isArray(c.filters[k]) || c.filters[k].some((x) => typeof x !== "string")) throw new Error("我的查询分类筛选无效");
    validateCustomConditions(c.filters.customConditions);
    validateColumnFilters(c.filters.columnFilters);
    if ("explicit" in c.sort && typeof c.sort.explicit !== "boolean") throw new Error("排序配置格式不正确");
    for (const k of ["status", "pre", "scope", "onlyFieldIssue", "onlyPdfRule"]) if (typeof c.filters[k] !== "string") throw new Error("我的查询状态筛选无效");
    for (const k of ["onlyBlock", "onlyIssue", "onlyVconf", "onlyBasket", "onlyPdf"]) if (typeof c.filters[k] !== "boolean") throw new Error("我的查询质量筛选无效");
    if (!["AND", "OR"].includes(c.filters.customLogic)) throw new Error("我的查询条件关系无效");
  }
}
function defaultQueryFilters(status = "有效") {
  return { mfg: new Set(), formula: new Set(), cats: new Set(), stocks: new Set(), brands: new Set(), status, pre: "", scope: "", onlyBlock: false, onlyIssue: false, onlyVconf: false, onlyBasket: false, onlyFieldIssue: "", onlyPdf: false, onlyPdfRule: "", customLogic: "AND", customConditions: [], columnFilters: {} };
}
function queryFiltersFrom(saved) {
  const f = defaultQueryFilters();
  for (const key of Object.keys(f)) {
    if (f[key] instanceof Set) f[key] = new Set(stringsOnly(saved[key]));
    else if (key === "columnFilters") f[key] = normalizeColumnFilters(saved[key]);
    else if (key === "customConditions") f[key] = normalizeCustomConditions(saved[key]);
    else if (typeof saved[key] === typeof f[key]) f[key] = saved[key];
  }
  f.scope = f.scope === "created2y" ? f.scope : "";
  f.customLogic = f.customLogic === "OR" ? "OR" : "AND";
  return f;
}
function captureQueryContext() {
  const f = state.filters;
  return { q: state.q, qMode: state.qMode, qField: state.qField, view: state.view,
    visible: orderedVisibleKeys(), order: [...state.order], sort: { ...state.sort },
    filters: { ...f, mfg: [...f.mfg], formula: [...f.formula], cats: [...f.cats], stocks: [...f.stocks], brands: [...f.brands], customConditions: normalizeCustomConditions(f.customConditions), columnFilters: normalizeColumnFilters(f.columnFilters) } };
}
function normalizeQueryContext(c) {
  const valid = (a) => stringsOnly(a).filter((k) => schemaByKey.has(k) && !MDM_HIDDEN_KEYS.has(k));
  const f = queryFiltersFrom(c.filters);
  const visible = [...new Set([...PINNED_KEYS, ...valid(c.visible)])];
  return { q: c.q, qMode: normalizeSearchMode(c.qMode), qField: c.qField === "all" || schemaByKey.has(c.qField) && !MDM_HIDDEN_KEYS.has(c.qField) ? c.qField : "all", view: c.view,
    visible, order: [...visible, ...valid(c.order).filter((k) => !visible.includes(k)), ...schemaKeys.filter((k) => !visible.includes(k) && !c.order.includes(k) && !MDM_HIDDEN_KEYS.has(k))],
    sort: schemaByKey.has(c.sort.key) && !MDM_HIDDEN_KEYS.has(c.sort.key) ? { ...c.sort } : { key: "material", dir: 1 },
    filters: { ...f, mfg: [...f.mfg], formula: [...f.formula], cats: [...f.cats], stocks: [...f.stocks], brands: [...f.brands] } };
}
function queryViewDirty(view) { return JSON.stringify(normalizeQueryContext(captureQueryContext())) !== JSON.stringify(view.context); }
function renderQueryWorkspace() {
  const el = document.getElementById("queryWorkspace"); if (!el) return;
  const active = state.queryViews.find((v) => v.id === state.activeQueryView);
  el.innerHTML = '<label for="queryViewSelect">我的查询</label><select id="queryViewSelect" data-act="query-view-select"><option value="" disabled' + (!active ? ' selected' : '') + '>选择已保存的查询…</option>'
    + state.queryViews.map((v) => '<option value="' + esc(v.id) + '"' + (v === active ? ' selected' : '') + '>' + esc(v.name) + (v === active && queryViewDirty(v) ? ' · 已调整' : '') + '</option>').join("") + '</select>'
    + '<button class="tool-btn" data-act="query-view-save-open">' + ic("plus", 13) + ' 保存当前查询</button>'
    + (active ? '<button class="view-shortcut-config" data-act="query-view-reload" title="恢复这份查询保存时的条件和字段">恢复已保存</button>' : '')
    + '<span class="query-workspace-note">保存搜索、筛选、字段和排序，下次直接使用</span>';
}
function applyQueryView(id) {
  const view = state.queryViews.find((v) => v.id === id); if (!view) return;
  const c = normalizeQueryContext(view.context);
  clearTimeout(customFilterTimer);
  state.activeQueryView = id; state.activeFieldView = ""; state.fieldViewDraftName = null;
  state.q = c.q; state.qMode = c.qMode; state.qField = c.qField; state.filters = queryFiltersFrom(c.filters);
  state.order = c.order; state.visible = c.visible; state.sort = c.sort; state.view = c.view; state.tab = "results";
  const input = document.getElementById("qInput"); input.value = state.q; resizeSearchInput(input);
  refreshFilteredViews(); toast("已恢复查询「" + view.name + "」，当前筛选范围已同步显示");
}
function closeQuerySave() {
  const mask = document.getElementById("modal-mask"); mask.classList.remove("open"); mask.onclick = null; syncBodyScrollLock();
}
function openQuerySave() {
  const queryInput = document.getElementById("qInput");
  if (state.q !== queryInput.value.trim()) { state.q = queryInput.value.trim(); refreshFilteredViews(); }
  const active = state.queryViews.find((v) => v.id === state.activeQueryView);
  const box = document.getElementById("modal-box"), mask = document.getElementById("modal-mask");
  box.innerHTML = '<h3>保存当前查询</h3><p>一起保存搜索词、筛选条件、展示字段及排序。原有字段视图继续只切换字段。</p>'
    + '<label class="query-save-label" for="queryViewName">查询名称</label><input id="queryViewName" maxlength="40" placeholder="例如：面巾包装核对" value="' + esc(active ? active.name : '') + '">'
    + '<div class="query-save-preview"><b>当前范围</b><div>' + (buildActiveFilterLinkageTags("sm").join("") || '全部物料') + '</div><p>搜索：' + esc(state.q || '未限定') + ' · ' + orderedVisibleKeys().length + ' 个字段 · ' + derived.total.toLocaleString() + ' 条结果</p></div>'
    + '<div class="macts"><button class="tool-btn" data-act="query-save-close">取消</button>'
    + (active ? '<button class="tool-btn danger" data-act="query-view-delete">删除此查询</button><button class="tool-btn" data-act="query-view-save" data-v="new">另存为</button>' : '')
    + '<button class="tool-btn primary" data-act="query-view-save" data-v="' + (active ? 'update' : 'new') + '">' + (active ? '更新此查询' : '保存查询') + '</button></div>';
  // 预览中的条件仅供核对，不在保存窗口里改变查询。
  box.querySelectorAll('.query-save-preview [data-act]').forEach((b) => { b.removeAttribute('data-act'); b.disabled = true; });
  mask.classList.add("open"); mask.onclick = (e) => { if (e.target === mask) closeQuerySave(); }; syncBodyScrollLock();
  document.getElementById("queryViewName").focus();
}
function saveQueryView(asNew) {
  const input = document.getElementById("queryViewName"), name = input.value.trim().slice(0, 40);
  if (!name) { toast("请填写查询名称", true); input.focus(); return; }
  const previous = !asNew && state.queryViews.find((v) => v.id === state.activeQueryView);
  if (state.queryViews.some((v) => v.name === name && v !== previous)) { toast("已有同名查询，请换一个名称", true); return; }
  const view = { id: previous ? previous.id : "qv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7), name, context: normalizeQueryContext(captureQueryContext()) };
  if (previous) state.queryViews[state.queryViews.indexOf(previous)] = view; else state.queryViews.push(view);
  state.activeQueryView = view.id; saveState(); closeQuerySave(); renderQueryWorkspace(); toast("已保存查询「" + name + "」");
}
