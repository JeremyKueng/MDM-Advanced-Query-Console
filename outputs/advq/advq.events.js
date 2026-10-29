/* ============ MDM 高级查询工作台 · 事件层与初始化 ============ */
"use strict";

/* ---------- 视图切换段（依赖 state.view，随 refreshAll 刷新） ---------- */
function renderViewSeg() {
  document.getElementById("viewSeg").innerHTML =
    '<button data-act="view-table" class="' + (state.view === "table" ? "on" : "") + '">' + ic("table", 13) + " 横版</button>"
    + '<button data-act="view-card" class="' + (state.view === "card" ? "on" : "") + '">' + ic("list", 13) + " 竖版</button>";
}

/* ---------- 抽屉互斥开关 ---------- */
function openDrawer(which) {
  state.detail = which === "detail" ? state.detail : null;
  state.fieldDrawer = which === "fields";
  state.compareOpen = which === "compare";
  if (which === "detail") { state.fieldDrawer = false; state.compareOpen = false; }
  if (which === "fields") { state.detail = null; state.compareOpen = false; }
  if (which === "compare") { state.detail = null; state.fieldDrawer = false; }
}
function closeAllDrawers() {
  state.detail = null; state.fieldDrawer = false; state.compareOpen = false;
  document.getElementById("detailDrawer").classList.remove("open");
  document.getElementById("fieldDrawer").classList.remove("open");
  document.getElementById("compareDrawer").classList.remove("open");
  document.getElementById("drawerMask").classList.remove("open");
  if (typeof syncBodyScrollLock === "function") syncBodyScrollLock();
}

/* ---------- 对比篮 ---------- */
function addToBasket(m, notify = true) {
  if (basketSet.has(m)) { toast("该 SKU 已在对比篮中"); return; }
  if (state.basket.length >= 8) { toast("对比篮最多 8 个 SKU，请先移除", true); return; }
  state.basket.push(m);
  basketSet.add(m);
  saveStateDebounced();
  refreshAll();
  if (notify) toast("已加入对比篮：" + m);
}
function removeFromBasket(m) {
  state.basket = state.basket.filter((x) => x !== m);
  basketSet.delete(m);
  saveStateDebounced();
  refreshAll();
}

/* ---------- 导出 ---------- */
function csvCell(v) {
  v = String(v === null || v === undefined ? "" : v);
  if (/^[=+@]/.test(v)) v = "'" + v;
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function currentRowsCsv() {
  const vis = orderedVisibleKeys();
  const lines = [vis.map((k) => csvCell(schemaByKey.get(k).label)).join(",")];
  for (const r of derived.filtered) lines.push(vis.map((k) => csvCell(fmt(r[k]))).join(","));
  return "\uFEFF" + lines.join("\r\n");
}
function exportProcessChecksCsv() {
  const list = processCheckRows();
  if (!list.length) { toast("当前没有可导出的工艺属性记录", true); return; }
  const lines = [["物料编码", "V码", "物料说明", "物料状态", "品类三级", "工艺属性检查问题数", "工艺属性阻断数", "工艺属性检查明细"].map(csvCell).join(",")];
  for (const r of list) lines.push([r.material, r.vcode, r.desc, r.status, r.cat, r.pdfCount, r.pdfBlock, processCheckIssues(r).map((x) => x.text).join("；")].map(csvCell).join(","));
  download("工艺属性检查-" + list.length + "条-" + stamp() + ".csv", "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
  toast("已导出工艺属性检查 " + list.length.toLocaleString() + " 条");
}
function exportMpsCsv() {
  const scoped = mpsFilteredRows();
  if (!scoped.length) { toast("当前 MPS 筛选条件下没有可导出的路线数据", true); return; }
  const headers = ["物料编码", "V码", "物料说明", "物料状态", "预失效", "路线品类", "工艺路线状态", "实时推导工艺路线", "节点完成度", "待补MDM字段", "MPS路线专项问题"];
  const lines = [headers.map(csvCell).join(",")];
  for (const r of scoped) {
    const iss = (routeIssueMap.get(r.material) || []).map((x) => "[" + x[0] + "]" + x[1] + (x[2] ? "(" + x[2] + ")" : "") + ":" + x[3]).join("；");
    lines.push([r.material, r.vcode, r.desc, r.status, r.pre, r.ruleCat, r.routeStatus, r.route, r.routeNodes, r.routeMissing, iss].map(csvCell).join(","));
  }
  download("MPS工艺路线实时重算清单-" + scoped.length + "条-" + stamp() + ".csv", "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
  toast("已导出 MPS 工艺路线清单 " + scoped.length.toLocaleString() + " 条");
}
function exportVconfCsv() {
  const groups = typeof buildScopedVconfGroups === "function" ? buildScopedVconfGroups() : [];
  if (!groups.length) { toast("当前筛选范围内没有同 V 码规格冲突数据", true); return; }
  const headers = ["冲突V码", "同V码冲突规格种数", "同V码涉及物料数", "物料编码", "物料状态", "品类三级", "品牌", "原始装数", "MDM物料规格", "标准化规格(保留乘法顺序)", "规格乘积", "主计量单位", "包装层级规格", "物料说明"];
  const lines = [headers.map(csvCell).join(",")];
  let rowCnt = 0;
  for (const g of groups) {
    for (const m of g.members) {
      rowCnt++;
      lines.push([
        g.vcode, g.specCount, g.materialCount, m.material, m.status || "",
        m.cat || "", m.brand || "", fmt(m.load), m.spec || "", m.specC || "",
        fmt(m.specP), m.unit || "", m.pack || "", m.desc || "",
      ].map(csvCell).join(","));
    }
  }
  download("MDM同V码规格冲突核查清单-" + groups.length + "组-" + rowCnt + "条-" + stamp() + ".csv", "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
  toast("已导出同 V 码冲突清单：" + groups.length.toLocaleString() + " 组 / " + rowCnt.toLocaleString() + " 条物料");
}
function exportFocusCsv() {
  const scopedRows = derived.filtered || [];
  const headers = ["物料编码", "V码", "物料说明", "物料状态", "品类三级", "品牌", "物料规格", "为什么需要关注(结论)", "实测填值公式对比(证据)", "业务影响与规则依据", "治理归口"];
  const lines = [headers.map(csvCell).join(",")];
  let cnt = 0;
  for (const r of scopedRows) {
    if (!r.blocking) continue;
    const evs = typeof buildConcreteFocusEvidences === "function" ? buildConcreteFocusEvidences(r) : [];
    if (!evs.length) continue;
    for (const ev of evs) {
      cnt++;
      const govName = (GOV_META[ev.gov] || {}).name || "数值修正";
      lines.push([
        r.material, r.vcode || "", r.desc || "", r.status || "", r.cat || "", r.brand || "", r.spec || "",
        ev.title, ev.proof, ev.impact, govName,
      ].map(csvCell).join(","));
    }
  }
  if (!cnt) { toast("当前筛选范围内没有需重点核查的 SKU", true); return; }
  download("MDM重点关注具象核查清单-" + cnt + "项-" + stamp() + ".csv", "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
  toast("已导出重点关注具象核查清单：" + cnt.toLocaleString() + " 条证据明细");
}
function fullRecord(r) {
  const o = {};
  for (const k of schemaKeys) if (!MDM_HIDDEN_KEYS.has(k)) o[k] = r[k];
  return o;
}
async function exportCsv() {
  if (!derived.total) { toast("当前没有可导出的结果", true); return; }
  download("MDM高级查询-" + derived.total + "条-" + stamp() + ".csv", currentRowsCsv(), "text/csv;charset=utf-8");
  toast("已导出 " + derived.total.toLocaleString() + " 条（当前筛选 × 可见字段）");
}
async function exportJson() {
  if (!derived.total) { toast("当前没有可导出的结果", true); return; }
  if (derived.total > 20000 && !(await confirmModal("导出确认", "当前结果 " + derived.total.toLocaleString() + " 条，导出文件会比较大，继续吗？"))) return;
  const payload = {
    type: "mdm-advq-export", exportedAt: new Date().toISOString(),
    source: DATASET.meta.source, count: derived.total,
    filters: { q: state.q, cats: [...state.filters.cats], status: state.filters.status, pre: state.filters.pre, scope: state.filters.scope,
      customLogic: state.filters.customLogic, customConditions: normalizeCustomConditions(state.filters.customConditions) },
    fields: schemaKeys.filter((k) => !MDM_HIDDEN_KEYS.has(k)), rows: derived.filtered.map(fullRecord),
  };
  download("MDM高级查询-" + derived.total + "条-" + stamp() + ".json", JSON.stringify(payload), "application/json");
  toast("已导出 " + derived.total.toLocaleString() + " 条完整字段 JSON");
}
function exportBasket() {
  const payload = { type: "mdm-advq-basket", exportedAt: new Date().toISOString(), rows: state.basket.map((m) => fullRecord(byMaterial.get(m))).filter(Boolean) };
  download("MDM对比篮-" + state.basket.length + "个-" + stamp() + ".json", JSON.stringify(payload), "application/json");
  toast("已导出对比篮 " + state.basket.length + " 个 SKU");
}
function exportSku(m) {
  const r = byMaterial.get(m);
  if (!r) return;
  const payload = { type: "mdm-advq-sku", exportedAt: new Date().toISOString(), sku: fullRecord(r) };
  download("MDM-SKU-" + m + "-" + stamp() + ".json", JSON.stringify(payload, null, 1), "application/json");
  toast("已导出 SKU " + m);
}
function exportAnalysisCsv() {
  const key = state.analyzeField;
  if (!key || !schemaByKey.has(key)) { toast("请先选择分析字段", true); return; }
  const s = schemaByKey.get(key);
  const rs = derived.filtered || [];
  const st = typeof computeFieldScopeStats === "function" ? computeFieldScopeStats(key, rs) : null;
  const cnt = {};
  let filled = 0, none = 0;
  for (const r of rs) {
    const v = r[key];
    if (v === null || v === undefined || v === "") continue;
    if (String(v).trim() === "无") { none++; continue; }
    filled++;
    cnt[String(v)] = (cnt[String(v)] || 0) + 1;
  }
  const lines = [
    ["字段", s.label, "分组", s.group, "类型", s.type, "统计范围", rs.length].map(csvCell).join(","),
    st ? ["适用域边界", st.spec.badge, "适用域确认率", st.scopeRate + "%", "必审适用域SKU", st.reqTotal, "适用域待补缺失", st.reqMiss, "选填域SKU", st.optTotal, "选填域未填", st.optEmpty].map(csvCell).join(",") : "",
    ["全表有值数", filled, "全表为空数", rs.length - filled - none, "填无数", none, "唯一值", Object.keys(cnt).length].map(csvCell).join(","),
  ].filter(Boolean);
  if (st && st.byFam) {
    lines.push(["--- 7大业务族群透视 ---", "角色", "族群总数", "已填有效值", "填无", "留空数"].map(csvCell).join(","));
    Object.values(st.byFam).forEach((fb) => {
      if (fb.total > 0) lines.push([fb.name, ({ req: "必审适用域", high: "主力使用域", opt: "条件选填域", zero: "暂未启用" })[fb.role], fb.total, fb.filled, fb.none, fb.empty].map(csvCell).join(","));
    });
  }
  lines.push(["取值", "数量"].map(csvCell).join(","));
  Object.entries(cnt).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => lines.push([k, v].map(csvCell).join(",")));
  download("MDM字段分析-" + s.label + "-" + stamp() + ".csv", "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
  toast("已导出字段适用域诊断与分布：" + s.label);
}
function exportBackup() { exportPersonalConfig(); }
async function importBackup(file) {
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("配置文件超过 2 MB");
    const doc = JSON.parse(await file.text());
    const settings = decodeUserConfig(doc);
    const viewCount = (settings.savedViews || []).length;
    if (!(await confirmModal("导入个人配置", "将恢复 " + viewCount + " 个自定义视图及文件中的字段、筛选、详情模板等设置。当前配置会保存一份恢复副本，是否导入？"))) return;
    try { localStorage.setItem(LS_KEY + "_before_import", JSON.stringify(configDoc(captureUserSettings()))); } catch (err) { /* 本机文件仍保留上一份版本 */ }
    applyUserSettings(settings);
    state.fieldViewDraftName = null;
    const q = document.getElementById("qInput"); q.value = state.q; resizeSearchInput(q);
    // 导入即使与当前相同也执行一次本机写入。
    configSnapshot = ""; saveState();
    refreshAll(); renderShortcutEditor();
    toast("个人配置已导入");
  } catch (e) { toast("配置导入失败：" + e.message, true); }
}

/* ---------- SKU 添加与建议 · URL 深链双向同步 ---------- */
/* 详情地址统一为 工作台.html/物料编码；旧 query/hash 链接继续识别，打开后收敛为路径。 */
function parseUrlDetailSpec() {
  try {
    var q = new URLSearchParams(location.search);
    var tpl = (q.get("tpl") || "").trim();
    var path = location.pathname.match(/\.html\/([^/]+)\/?$/i) || location.pathname.match(/^\/mdm\/([^/]+)\/?$/i);
    if (path) return { material: decodeURIComponent(path[1]).trim(), tpl: tpl };
    var m = (q.get("m") || q.get("sku") || "").trim();
    if (m) return { material: m, tpl: tpl };
    var h = (location.hash || "").replace(/^#\/?/, "").trim();
    if (h) {
      if (h.indexOf("m=") >= 0 || h.indexOf("sku=") >= 0) {
        var hq = new URLSearchParams(h);
        var hm = (hq.get("m") || hq.get("sku") || "").trim();
        if (hm) return { material: hm, tpl: (hq.get("tpl") || "").trim() };
      }
      if (!/[^0-9A-Za-z._-]/.test(h)) return { material: h, tpl: tpl };
    }
  } catch (e) { return null; }
  return null;
}

function materialFromUrl() {
  var spec = parseUrlDetailSpec();
  return spec ? spec.material : null;
}
function buildDetailDeepLinkUrl(material, tplId) {
  try {
    var u = new URL(location.href);
    var suffix = u.pathname.toLowerCase().indexOf(".html/");
    var basePath = suffix >= 0 ? u.pathname.slice(0, suffix + 5) : u.pathname.replace(/\/+$/, "");
    if (/^\/mdm(?:\/|$)/i.test(basePath)) basePath = "/mdm";
    u.pathname = material ? basePath + "/" + encodeURIComponent(material) : basePath || "/";
    u.searchParams.delete("m");
    u.searchParams.delete("sku");
    u.searchParams.delete("tpl");
    if (material && tplId) u.searchParams.set("tpl", tplId);
    u.hash = "";
    return u.toString();
  } catch (e) {
    return location.href;
  }
}

function syncDetailUrl(replaceMode) {
  try {
    var targetUrl = (state.detailPage && state.detail)
      ? buildDetailDeepLinkUrl(state.detail, state.dpOverrideTplId || "")
      : buildDetailDeepLinkUrl("", "");
    if (targetUrl === location.href) return;
    if (replaceMode) history.replaceState({ detail: state.detail, detailPage: state.detailPage, tpl: state.dpOverrideTplId }, "", targetUrl);
    else history.pushState({ detail: state.detail, detailPage: state.detailPage, tpl: state.dpOverrideTplId }, "", targetUrl);
  } catch (e) { /* file:// 某些受限环境下静默降级 */ }
}
function resizeSearchInput(el) {
  if (!el) el = document.getElementById("qInput");
  if (!el) return;
  const val = el.value || "";
  if (val.indexOf("\n") >= 0 || val.indexOf("\r") >= 0) {
    const lineCnt = Math.min(5, Math.max(2, val.split(/\r?\n/).length));
    el.rows = lineCnt;
  } else {
    el.rows = 1;
  }
}
function findSku(text) {
  const t = text.trim();
  if (!t) return null;
  const exact = byMaterial.get(t);
  if (exact) return exact;
  const low = t.toLowerCase();
  for (const r of rows) {
    if (r.vcode && String(r.vcode).toLowerCase() === low) return r;
  }
  return null;
}
function suggestSkus(text) {
  const t = text.trim().toLowerCase();
  if (t.length < 2) return [];
  const hits = [];
  for (const r of rows) {
    const m = String(r.material).toLowerCase(), v = String(r.vcode || "").toLowerCase();
    let score = -1;
    if (m === t || v === t) score = 100;
    else if (m.startsWith(t) || v.startsWith(t)) score = 80;
    else if (r._st.indexOf(t) >= 0) score = 40;
    if (score > 0) { hits.push([score, r]); if (hits.length > 60) break; }
  }
  return hits.sort((a, b) => b[0] - a[0]).slice(0, 6).map((x) => x[1]);
}
function renderSuggest(list) {
  const box = document.getElementById("skuSuggest");
  if (!list.length) { box.style.display = "none"; box.innerHTML = ""; return; }
  box.innerHTML = list.map((r) => '<div data-act="suggest-pick" data-material="' + esc(r.material) + '"><span class="m">' + esc(r.material) + "</span><span class='d'>" + esc(r.desc) + "</span></div>").join("");
  box.style.display = "block";
}

/* ---------- 字段拖拽与排序（左屏已选字段顺序实时同步至横版列与竖版卡片，核心 4 列固定在最前） ---------- */
let dragKey = null;
function applyVisibleListOrder(newVisList) {
  const pinned = PINNED_KEYS.filter((k) => schemaByKey.has(k));
  const pinnedSet = new Set(pinned);
  const customVis = newVisList.filter((k) => !pinnedSet.has(k) && !MDM_HIDDEN_KEYS.has(k) && schemaByKey.has(k));
  const finalVis = [...pinned, ...customVis];
  const seen = new Set(finalVis);
  const rest = state.order.filter((k) => !seen.has(k) && !MDM_HIDDEN_KEYS.has(k));
  state.order = [...finalVis, ...rest];
  state.visible = [...finalVis];
  saveStateDebounced();
  // 字段勾选与排序只更新展示列；不重算筛选、不重建右侧候选池。
  preserveWorkspaceViewport(() => {
    syncFieldDrawerInPlace();
    workspacePanelCache.delete("results");
    workspacePanelCache.delete("analyze");
    if (state.tab === "results" || state.tab === "analyze") renderWorkspacePanel(true);
    if (state.compareOpen) renderCompare();
  });
}
function bindFieldDrag() {
  const body = document.getElementById("fieldBody");
  body.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".field-row");
    if (!row || PINNED_KEYS.includes(row.dataset.key)) { e.preventDefault(); return; }
    dragKey = row.dataset.key;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragKey);
  });
  body.addEventListener("dragend", () => {
    dragKey = null;
    body.querySelectorAll(".field-row").forEach((r) => r.classList.remove("dragging", "dragover"));
  });
  body.addEventListener("dragover", (e) => {
    const row = e.target.closest(".field-row");
    if (!row || !dragKey || row.dataset.key === dragKey || PINNED_KEYS.includes(row.dataset.key)) return;
    e.preventDefault();
    body.querySelectorAll(".field-row").forEach((r) => r.classList.remove("dragover"));
    row.classList.add("dragover");
  });
  body.addEventListener("drop", (e) => {
    const row = e.target.closest(".field-row");
    if (!row || !dragKey || PINNED_KEYS.includes(row.dataset.key)) return;
    e.preventDefault();
    const to = row.dataset.key;
    if (to === dragKey) return;
    const vis = orderedVisibleKeys().filter((k) => k !== dragKey);
    const toIdx = vis.indexOf(to);
    if (toIdx >= 4) vis.splice(toIdx, 0, dragKey);
    else vis.push(dragKey);
    applyVisibleListOrder(vis);
    toast("字段顺序已实时更新（横版表格 + 竖版卡片同步生效）");
  });
}

/* ---------- 表格点击拖拽横向滑动（Grab-to-Scroll）+ 顶部横向导航条同步 + 浮层背景防滚动穿透 ---------- */
let _tableDragJustMoved = false;

function bindQuickDetailConfig() {
  let dragging = null, suppressClickUntil = 0;
  const clear = () => document.querySelectorAll('#quickDetailConfig .quick-drop-target').forEach((el) => el.classList.remove('quick-drop-target'));
  const targetFor = (e) => {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    return dragging && target && target.closest(dragging.kind === 'section' ? '#quickConfigSections [data-quick-section]' : '#quickConfigSelected [data-quick-drag="field"]');
  };
  const finish = () => {
    clear();
    if (dragging) {
      dragging.item.classList.remove('quick-dragging');
      if (dragging.box.hasPointerCapture(dragging.pointerId)) dragging.box.releasePointerCapture(dragging.pointerId);
    }
    dragging = null;
  };
  document.addEventListener('pointerdown', (e) => {
    suppressClickUntil = 0;
    if (e.button !== 0) return;
    const item = e.target.closest('#quickDetailConfig [data-quick-drag]');
    if (!item || (item.dataset.quickDrag === 'field' && e.target.closest('button'))) return;
    dragging = { kind: item.dataset.quickDrag, id: item.dataset.v, item, box: document.getElementById('modal-box'), pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!dragging || dragging.pointerId !== e.pointerId) return;
    if (!dragging.moved) {
      if (Math.hypot(e.clientX - dragging.x, e.clientY - dragging.y) < 5) return;
      dragging.moved = true; dragging.box.setPointerCapture(e.pointerId); dragging.item.classList.add('quick-dragging');
    }
    e.preventDefault(); clear();
    const target = targetFor(e); if (!target) return;
    target.classList.add('quick-drop-target');
  }, { passive: false });
  document.addEventListener('pointerup', (e) => {
    if (!dragging || dragging.pointerId !== e.pointerId) return;
    const target = dragging.moved ? targetFor(e) : null, kind = dragging.kind;
    if (dragging.moved) { e.preventDefault(); suppressClickUntil = Date.now() + 200; }
    const changed = target && moveQuickDetailItem(kind, dragging.id, kind === 'section' ? target.dataset.quickSection : target.dataset.v);
    finish();
    if (changed) { if (kind === 'section') renderQuickDetailEditor(); else renderQuickDetailDraftFields(); }
  });
  document.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);
  document.addEventListener('dragstart', (e) => { if (e.target.closest('#quickDetailConfig [data-quick-drag]')) e.preventDefault(); });
  document.addEventListener('click', (e) => { if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('input', (e) => {
    if (e.target.id === 'quickConfigFieldSearch') { quickDetailSearch = e.target.value; renderQuickDetailFieldChoices(); }
    if (quickDetailDraft && e.target.dataset.quickTitle) {
      const section = quickDetailDraft.sections.find((s) => s.id === e.target.dataset.quickTitle);
      if (section) { section.title = e.target.value; if (section.id === quickDetailSectionId) document.getElementById('quickConfigFieldTitle').textContent = section.title + ' · 已选 ' + section.fields.length + ' 个字段'; }
    }
  });
}

function closeFieldLocator() {
  const popup = document.getElementById("fieldLocatorPopup"), input = document.getElementById("fieldLocatorInput");
  if (popup) popup.hidden = true;
  if (input) { input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
}
function showFieldLocator(reset = true) {
  const input = document.getElementById("fieldLocatorInput"), popup = document.getElementById("fieldLocatorPopup"), list = document.getElementById("fieldLocatorOptions");
  if (!input || !popup || !list) return;
  fieldLocator.query = input.value;
  const matches = matchingResultFields(input.value);
  if (reset) fieldLocator.active = 0;
  fieldLocator.active = Math.max(0, Math.min(fieldLocator.active, matches.length - 1));
  document.getElementById("fieldLocatorCount").textContent = matches.length ? matches.length + " 个字段 · 选择或按 Enter 定位" : "当前展示字段中没有匹配项";
  list.innerHTML = matches.map((s, i) => '<button type="button" id="fieldLocatorOption' + i + '" role="option" aria-selected="' + (i === fieldLocator.active) + '" data-act="locate-field" data-v="' + esc(s.key) + '"><span>' + esc(s.label) + '</span><small>第 ' + (s.index + 1) + ' 列</small></button>').join("");
  popup.hidden = false;
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-activedescendant", matches.length ? "fieldLocatorOption" + fieldLocator.active : "");
  document.querySelector('[data-act="field-locator-clear"]').hidden = !input.value;
  const active = list.children[fieldLocator.active];
  if (reset) list.scrollTop = 0;
  else if (active) {
    if (active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
    else if (active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = active.offsetTop + active.offsetHeight - list.clientHeight;
  }
}
function clearFieldLocator() {
  fieldLocator.key = ""; fieldLocator.query = "";
  const wrap = document.getElementById("mainTableWrap"), input = document.getElementById("fieldLocatorInput");
  if (wrap) wrap.querySelectorAll(".field-located").forEach((cell) => cell.classList.remove("field-located"));
  if (input) { input.value = ""; input.focus({ preventScroll: true }); showFieldLocator(); }
}
function locateResultField(key) {
  const wrap = document.getElementById("mainTableWrap"), input = document.getElementById("fieldLocatorInput");
  if (!wrap || !orderedVisibleKeys().includes(key)) return;
  const th = [...wrap.querySelectorAll("thead th[data-field]")].find((cell) => cell.dataset.field === key);
  if (!th) return;
  fieldLocator.key = key; fieldLocator.query = schemaByKey.get(key).label;
  wrap.querySelectorAll("[data-field]").forEach((cell) => cell.classList.toggle("field-located", cell.dataset.field === key));
  // 只移动表格的横轴；目标列必须露在左右冻结列之间，不能用 scrollIntoView。
  const fixedLeft = [...wrap.querySelectorAll("thead .sticky-col")].filter((cell) => getComputedStyle(cell).left !== "auto");
  if (!fixedLeft.includes(th)) {
    const bounds = wrap.getBoundingClientRect(), rect = th.getBoundingClientRect();
    const leftEdge = Math.max(bounds.left, ...fixedLeft.map((cell) => cell.getBoundingClientRect().right));
    const next = wrap.scrollLeft + rect.left - leftEdge - 8;
    wrap.scrollLeft = Math.max(0, Math.min(wrap.scrollWidth - wrap.clientWidth, next));
  }
  if (input) {
    input.value = fieldLocator.query;
    input.focus({ preventScroll: true }); input.select();
    document.querySelector('[data-act="field-locator-clear"]').hidden = false;
  }
  closeFieldLocator(); syncTableXnav("mainTableWrap");
  const status = document.getElementById("fieldLocatorStatus");
  if (status) status.textContent = "已定位并高亮：" + fieldLocator.query;
}

function syncTableXnav(tableId) {
  const wrap = document.getElementById(tableId);
  if (!wrap) return;
  const maxScroll = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
  const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, wrap.scrollLeft / maxScroll)) : 0;
  const rangeEl = document.querySelector('[data-xnav-range="' + tableId + '"]');
  const posEl = document.querySelector('[data-xnav-pos="' + tableId + '"]');
  const xnavEl = document.querySelector('[data-xnav-for="' + tableId + '"]');
  if (rangeEl) {
    rangeEl.value = String(Math.round(ratio * 1000));
    rangeEl.disabled = maxScroll <= 2;
  }
  if (posEl) {
    posEl.textContent = maxScroll <= 2 ? "已铺满" : Math.round(ratio * 100) + "%";
  }
  if (xnavEl) {
    if (tableId === "mainTableWrap") xnavEl.classList.toggle("no-overflow", maxScroll <= 2);
    xnavEl.querySelectorAll('[data-act="xnav-step"]').forEach((btn) => {
      const dir = btn.dataset.dir;
      if (dir === "start" || dir === "left") btn.disabled = wrap.scrollLeft <= 2;
      else if (dir === "end" || dir === "right") btn.disabled = wrap.scrollLeft >= maxScroll - 2;
    });
  }
}

function bindTableDragAndScrollGuard() {
  let activeWrap = null;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let dragging = false;

  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const wrap = e.target.closest(".table-wrap");
    if (!wrap) return;
    /* 若点在按钮、链接、输入控件或可交互胶囊上，保留默认点击行为，但在拖出阈值时仍允许转为横向拖拽 */
    if (e.target.closest("button, input, select, textarea, .rowact")) return;
    if (wrap.scrollWidth <= wrap.clientWidth + 2) return;
    activeWrap = wrap;
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = wrap.scrollLeft;
    dragging = false;
  });

  window.addEventListener("mousemove", (e) => {
    if (!activeWrap) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) < 5) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.4) {
        activeWrap = null;
        return;
      }
      dragging = true;
      _tableDragJustMoved = true;
      activeWrap.classList.add("is-dragging");
    }
    e.preventDefault();
    activeWrap.scrollLeft = startScrollLeft - dx * 1.25;
    if (activeWrap.id) syncTableXnav(activeWrap.id);
  }, { passive: false });

  const endDrag = () => {
    if (!activeWrap) return;
    if (dragging) {
      activeWrap.classList.remove("is-dragging");
      setTimeout(() => { _tableDragJustMoved = false; }, 60);
    }
    activeWrap = null;
    dragging = false;
  };
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("blur", endDrag);

  /* 捕获阶段拦截：若刚刚发生了横向拖拽平移，阻止松手时误触发的表头排序或链接跳转 */
  document.addEventListener("click", (e) => {
    if (_tableDragJustMoved) {
      e.stopPropagation();
      e.preventDefault();
      _tableDragJustMoved = false;
    }
  }, true);

  /* 监听表格原生滚动（触控板双指横滑 / 底部滚动条）同步更新顶部导航滑块 */
  document.addEventListener("scroll", (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains("table-wrap") && t.id) {
      syncTableXnav(t.id);
    }
  }, true);

  /* 顶部横向滑块拖动时实时驱动表格横向滚动 */
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el && el.dataset && el.dataset.xnavRange) {
      const tableId = el.dataset.xnavRange;
      const wrap = document.getElementById(tableId);
      if (!wrap) return;
      const maxScroll = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const ratio = (parseFloat(el.value) || 0) / 1000;
      wrap.scrollLeft = maxScroll * ratio;
      syncTableXnav(tableId);
    }
  });

  /* 在表格区域按住 Shift + 鼠标垂直滚轮，平滑转为横向滚动 */
  document.addEventListener("wheel", (e) => {
    /* 1. 浮层背景滚动穿透防护：当 modal / drawer 打开时，禁止滚轮穿透到底部主页 */
    const maskOpen = document.getElementById("modal-mask") && document.getElementById("modal-mask").classList.contains("open");
    const drawerOpen = document.getElementById("drawerMask") && document.getElementById("drawerMask").classList.contains("open");
    if (maskOpen) {
      const box = document.getElementById("modal-box");
      const inBox = box && box.contains(e.target);
      if (!inBox) {
        /* 鼠标在遮罩空白处滚轮时，转发给弹窗内容滚动，绝不滚动背后的主页 */
        e.preventDefault();
        if (box) box.scrollTop += e.deltaY;
        return;
      }
      /* 鼠标在弹窗内部（或内部子滚动列表）时，检查边界防止滚到底后穿透主页 */
      let sc = e.target.closest ? e.target.closest("div, details, ul, tbody") : box;
      let canScroll = false;
      let cur = e.target;
      while (cur && cur !== document.body) {
        if (cur.scrollHeight > cur.clientHeight + 1) {
          const st = getComputedStyle(cur);
          if (st.overflowY === "auto" || st.overflowY === "scroll") {
            const atTop = cur.scrollTop <= 0 && e.deltaY < 0;
            const atBottom = cur.scrollTop + cur.clientHeight >= cur.scrollHeight - 1 && e.deltaY > 0;
            if (!atTop && !atBottom) { canScroll = true; break; }
          }
        }
        if (cur === box) break;
        cur = cur.parentElement;
      }
      if (!canScroll) {
        e.preventDefault();
        return;
      }
    } else if (drawerOpen) {
      const openDrw = document.querySelector(".drawer.open");
      if (openDrw && !openDrw.contains(e.target)) {
        e.preventDefault();
        const bd = openDrw.querySelector(".drawer-bd");
        if (bd) bd.scrollTop += e.deltaY;
        return;
      }
    }

    /* 2. 表格区域 Shift + 滚轮 → 横向滑动 */
    const wrap = e.target.closest && e.target.closest(".table-wrap");
    if (wrap && e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      if (wrap.scrollWidth > wrap.clientWidth + 2) {
        e.preventDefault();
        wrap.scrollLeft += e.deltaY;
        if (wrap.id) syncTableXnav(wrap.id);
      }
    }
  }, { passive: false });

  window.addEventListener("resize", debounce(() => {
    syncTableXnav("mainTableWrap");
    syncTableXnav("mpsTableWrap");
    syncTableXnav("processCheckTableWrap");
  }, 120));
}
let LAST_SHARE_STATUS = null;
let SOURCE_API_PROBE = null;
let SOURCE_INFO_REQUEST = null;
let LAST_SOURCE_INFO = null;

const IS_WIN_CLIENT = /Win/i.test((navigator && (navigator.platform || navigator.userAgent)) || "");

function updateShareStatusChip(shareStatus, apiReady) {
  const chip = document.getElementById("shareStatusChip");
  if (!chip) return;
  chip.classList.remove("ok", "warn", "err");
  if (!apiReady || !shareStatus) {
    chip.classList.add("warn");
    chip.title = apiReady ? "更新数据源 · 本地服务已连接，共享盘待检查" : "更新数据源 · 本地服务未连接";
    return;
  }
  LAST_SHARE_STATUS = shareStatus;
  const connected = shareStatus.overall === "connected";
  const pending = shareStatus.overall === "auth_or_unmounted";
  chip.classList.add(connected ? "ok" : pending ? "warn" : "err");
  chip.title = "更新数据源 · " + (connected ? "共享盘已连接" : pending ? "共享盘待连接或认证" : "共享盘网络未连通");
}

async function sourceJson(url, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) throw new Error("服务返回 " + resp.status);
        const info = await resp.json();
        if (!info || !info.ok) throw new Error("服务返回的数据无效");
        return info;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("连接检查超时，请重试")); }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

function resolveApiBase() {
  if (SOURCE_API_PROBE) return SOURCE_API_PROBE;
  SOURCE_API_PROBE = (async () => {
    const candidates = [];
    if (location.protocol.startsWith("http")) candidates.push("");
    candidates.push("http://127.0.0.1:4173", "http://localhost:4173");
    for (const base of candidates) {
      try {
        // 服务存活检查不扫描共享盘，本地文件导入无需等待 SMB 诊断。
        const info = await sourceJson(base + "/api/health", 1200);
        if (info.service !== "mdm-advanced-query-console") continue;
        updateShareStatusChip(LAST_SOURCE_INFO && LAST_SOURCE_INFO.base === base ? LAST_SOURCE_INFO.info.shareStatus : null, true);
        return { base, info };
      } catch (err) { /* 继续探测下一个候选地址 */ }
    }
    updateShareStatusChip(null, false);
    return { base: "", info: null };
  })().finally(() => { SOURCE_API_PROBE = null; });
  return SOURCE_API_PROBE;
}

function loadSourceInfo(base, force = false) {
  if (!force && SOURCE_INFO_REQUEST && SOURCE_INFO_REQUEST.base === base) return SOURCE_INFO_REQUEST.promise;
  if (!force && LAST_SOURCE_INFO && LAST_SOURCE_INFO.base === base && Date.now() - LAST_SOURCE_INFO.at < 30000) {
    return Promise.resolve(LAST_SOURCE_INFO.info);
  }
  const request = { base };
  request.promise = sourceJson(base + "/api/source-info", 15000).then((info) => {
    if (SOURCE_INFO_REQUEST === request) {
      LAST_SOURCE_INFO = { base, info, at: Date.now() };
      updateShareStatusChip(info.shareStatus, true);
    }
    return info;
  }).finally(() => { if (SOURCE_INFO_REQUEST === request) SOURCE_INFO_REQUEST = null; });
  SOURCE_INFO_REQUEST = request;
  return request.promise;
}

async function warmSourceInfo() {
  const { base, info } = await resolveApiBase();
  if (info) {
    try { await loadSourceInfo(base); } catch (err) { /* 弹窗内提供重试，不打断查询。 */ }
  }
}

function renderShareDiagCard(st, apiReady) {
  const isWin = (st && st.platform === "win") || IS_WIN_CLIENT;
  if (!apiReady || !st) {
    return '<div class="src-route-card" style="border-color:#f3ddba;background:#fffaf2">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
      + '<h4 style="margin:0">' + ic("alert-triangle", 14) + ' 内网共享路径连接与身份验证诊断 (Windows / macOS 双端适配) <span class="tag orange">● 后台服务待连接</span></h4>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="mini-btn primary" id="btnRetryConnectApi">' + ic("refresh", 12) + ' 重新连接后台服务 (4173)</button>'
      + '<button class="mini-btn" id="btnOpenOnlineWorkbench">' + ic("link", 12) + ' 打开本地服务页 (127.0.0.1:4173)</button>'
      + '<button class="mini-btn" id="btnWakeSmbMount">' + ic("database", 12) + (isWin ? ' 复制 Windows 共享路径 (UNC)' : ' 一键唤起 Finder 挂载共享盘') + '</button>'
      + '<button class="mini-btn" id="btnCopyServeCmd">' + ic("copy", 12) + ' 复制后台启动命令</button>'
      + '</div></div>'
      + '<p style="margin:0">当前页面未连接本地后台重算服务（端口 <code>4173</code>，支持 Windows <code>启动工作台.bat</code> / macOS <code>启动工作台.command</code>）。请先双击项目中的 <b>「启动工作台」</b>，服务就绪后再点击 <b>「重新连接后台服务 (4173)」</b>。启动器会打开工作台页面，关闭启动窗口后服务继续运行。</p></div>';
  }
  const net = st.network || {};
  const auth = st.auth || {};
  const mnt = st.mount || {};
  const files = st.files || [];
  const ovBadge = st.overall === "connected"
    ? '<span class="tag green">● 已连接 · 认证通过</span>'
    : (st.overall === "auth_or_unmounted" ? '<span class="tag orange">● 网络已通 · ' + (isWin ? "待认证/连接" : "待挂载/认证") + '</span>' : '<span class="tag red">● 网络未连通</span>');

  return '<div class="src-route-card" style="background:#f8fbff;border-color:#c4dbfb">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
    + '<h4 style="margin:0">' + ic("check-circle", 14) + ' 连接诊断 ' + ovBadge + '</h4>'
    + '<div style="display:flex;gap:6px;align-items:center">'
    + '<span style="font-size:11px;color:var(--subtle)">检测时间 ' + esc(st.checkedAt || "") + '</span>'
    + '<button class="mini-btn" id="btnReprobeShare">' + ic("refresh", 11) + (isWin ? ' 重新检测 / 激活 UNC 会话' : ' 重新检测 / 一键挂载') + '</button>'
    + '</div></div>'
    + '<div style="font-size:12px;color:var(--ink);background:#fff;border:1px solid #dbe8f8;border-radius:7px;padding:7px 10px;margin-bottom:8px">'
    + '<b>诊断结论：</b>' + esc(st.diagnosis || "")
    + '</div>'
    + '<div class="diag-grid">'
    + '<div class="diag-item ' + (net.ok ? "ok" : "err") + '">'
    + '<div class="dt"><span>① 网络连通性 (TCP 445)</span><span class="tag ' + (net.ok ? "green" : "red") + '">' + (net.ok ? "正常" : "不可达") + '</span></div>'
    + '<div class="dd">' + esc(net.detail || "") + '</div></div>'
    + '<div class="diag-item ' + (auth.ok ? "ok" : "warn") + '">'
    + '<div class="dt"><span>② 身份验证 (SMB 鉴权)</span><span class="tag ' + (auth.ok ? "green" : "orange") + '">' + (auth.ok ? ("工号 " + esc(auth.account || "已认证")) : "需鉴权") + '</span></div>'
    + '<div class="dd">' + esc(auth.detail || "") + '</div></div>'
    + '<div class="diag-item ' + (mnt.ok ? "ok" : "warn") + '">'
    + '<div class="dt"><span>③ ' + (isWin ? "UNC 路径直连 & 读取" : "本地卷挂载 & 读取") + '</span><span class="tag ' + (mnt.ok ? "green" : "orange") + '">' + (mnt.ok ? ("可读 (" + files.length + " 文件)") : (isWin ? "未连接" : "未挂载")) + '</span></div>'
    + '<div class="dd">' + (mnt.ok ? ((isWin ? '访问路径：<code>' : '挂载点：<code>') + esc(mnt.mountPoint) + '</code>') : esc(mnt.readError || (isWin ? "尚未建立 \\\\files.example.invalid 共享连接" : "尚未挂载到 /Volumes/MDM示例表"))) + '</div></div>'
    + '</div>'
    + (files.length ? '<details style="font-size:11.5px;color:var(--muted)"><summary style="cursor:pointer;color:var(--blue);font-weight:600">查看内网路径返回的目录文件清单（共 ' + files.length + ' 项，已锁定『物料属性查询报表-成品（含工艺）』' + (st.finishedFiles || []).length + ' 份）</summary>'
      + '<div style="margin-top:6px;max-height:135px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:6px;padding:6px 9px">'
      + files.map((f) => '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px dashed #eef3f8">'
        + '<span>' + (f.isFinished ? '<b style="color:var(--blue-deep)">★ ' + esc(f.name) + '（锁定目标·123列含工艺）</b>' : esc(f.name)) + (f.isLock ? ' <span class="tag orange">临时锁文件(已忽略)</span>' : '') + '</span>'
        + '<span style="font-family:monospace;color:var(--subtle)">' + esc(f.mtime) + ' · ' + (f.sizeMB >= 0.1 ? f.sizeMB + ' MB' : f.sizeKB + ' KB') + '</span></div>').join("")
      + '</div></details>' : "")
    + '</div>';
}

async function openSourceModal() {
  const mask = document.getElementById("modal-mask");
  const box = document.getElementById("modal-box");
  box.style.width = "min(680px, 95vw)";
  const m = DATASET.meta || {};

  let apiBase = "", info = null, apiReady = false, checking = true, sourceError = "";
  let shareUnc = m.shareUnc || "", shareSmb = "";
  let connectionVersion = 0;

  box.innerHTML = '<h3>' + ic("database", 16) + ' 更新数据源</h3>'
    + '<div class="source-current"><small>当前数据</small><strong>' + esc(m.source || "—") + '</strong>'
    + '<span class="source-file-meta">' + (m.sourceRows || 0).toLocaleString() + ' 条记录 · 报表时间 ' + esc(m.sourceStamp || "—") + '</span></div>'
    + '<div class="src-route-card recommend" id="sourceSharePanel"></div>'
    + '<div class="src-route-card"><h4>' + ic("upload", 14) + ' 本地文件</h4>'
    + '<p>导入 .xlsx 物料报表，支持包含有效和无效物料的全量数据。</p>'
    + '<button class="tool-btn" id="btnRoute1Pick"' + (!apiReady ? ' disabled' : '') + '>' + ic("upload", 13) + ' 选择文件导入</button>'
    + '<span class="source-file-meta" id="sourceLocalStatus" role="status">正在连接本地服务…</span>'
    + '<details class="source-path"><summary>通过文件路径导入</summary>'
    + '<input class="src-input" id="srcLocalPathInput" type="text" aria-label="物料报表文件路径" placeholder="粘贴 .xlsx 报表完整路径" value="' + esc(m.sourcePath || "") + '">'
    + '<button class="mini-btn" id="btnRoute1Path"' + (!apiReady ? ' disabled' : '') + '>' + ic("check", 12) + ' 按路径导入</button></details></div>'
    + '<p class="source-dialog-note">更新后重新计算校验和工艺路线，保留个人视图配置。</p>'
    + '<details class="source-advanced" id="sourceAdvanced"><summary>连接与数据详情</summary><div>'
    + '<div class="source-settings-editor"><label for="srcSharePathInput">共享目录</label><input class="src-input" id="srcSharePathInput" type="text" aria-label="共享目录" placeholder="Windows UNC、映射盘符或 macOS 共享目录" value="' + esc(m.shareUnc || '') + '">'
    + '<button type="button" class="mini-btn" id="btnSaveSharePath" disabled>保存共享路径</button><span class="source-file-meta" id="sourceSettingsStatus">保存到本机，更新程序后继续沿用。</span></div>'
    + '<div id="sourceConnectionDetails"></div>' + renderSourceLineage() + '</div></details>'
    + '<div class="macts"><button class="tool-btn" id="modalCloseSrc">关闭</button></div>';

  mask.classList.add("open");
  if (typeof syncBodyScrollLock === "function") syncBodyScrollLock();
  const sharePanel = document.getElementById("sourceSharePanel");
  const isCurrent = () => mask.classList.contains("open") && document.getElementById("sourceSharePanel") === sharePanel;
  const close = () => {
    box.style.width = "";
    mask.classList.remove("open");
    if (typeof syncBodyScrollLock === "function") syncBodyScrollLock();
  };
  document.getElementById("modalCloseSrc").onclick = close;
  if (typeof bindSourceSettingsEditor === "function") bindSourceSettingsEditor(isCurrent, refreshConnection);
  mask.onclick = (e) => { if (e.target === mask) close(); };

  function renderConnection() {
    const shareStatus = info && info.shareStatus;
    const shareOpts = ((info && info.shareCandidates) || []).filter((c) => c.isShare);
    const target = shareOpts[0] || (info && info.latestCandidate) || {};
    const shareConnected = apiReady && shareStatus && shareStatus.overall === "connected";
    const canUpdateShare = apiReady && !checking && !sourceError && !!target.path;
    const statusText = checking ? "正在检查共享盘…" : sourceError ? "共享盘检查未完成" : !apiReady ? "本地服务未连接" : shareConnected ? "共享盘可用" : "共享盘待连接";
    sharePanel.innerHTML = '<div class="source-card-head"><h4>' + ic("database", 14) + ' 共享盘更新 <span class="tag blue">推荐</span></h4>'
      + '<span class="source-connection-state ' + (shareConnected && !checking ? "ok" : "warn") + '" role="status">' + esc(statusText) + '</span></div>'
      + (shareOpts.length > 1 ? '<label class="source-file-meta" for="srcShareFileSelect">选择报表</label><select class="cfg-select source-share-select" id="srcShareFileSelect">'
        + shareOpts.map((c) => '<option value="' + esc(c.path) + '">' + esc(c.name) + ' · ' + esc(c.mtime || '') + '</option>').join('') + '</select>'
        : '<div class="source-file-name">' + esc(target.name || (checking ? '正在查找可用报表…' : '暂未找到可用报表')) + '</div>'
          + (target.mtime ? '<span class="source-file-meta">报表时间 ' + esc(target.mtime) + '</span>' : ''))
      + '<div class="source-action-row"><button class="tool-btn primary" id="btnRoute2Auto"' + (!canUpdateShare ? ' disabled' : '') + '>' + ic("refresh", 13) + ' 更新共享盘数据</button></div>'
      + '<span class="source-file-meta">' + (checking ? '后台检查中，不影响本地文件导入。' : sourceError ? esc(sourceError) : !apiReady ? '请先双击项目中的「启动工作台」，再展开下方连接详情重新连接。' : !target.path ? '可在下方检查共享盘连接，或导入本地文件。' : '共享盘报表包含有效物料。') + '</span>';
    document.getElementById("sourceConnectionDetails").innerHTML = checking
      ? '<p role="status">正在后台检查共享盘连接与报表…</p>'
      : sourceError
        ? '<p role="status">' + esc(sourceError) + '</p><button class="mini-btn" id="btnRetryConnectApi">重新检查连接</button>'
        : renderShareDiagCard(shareStatus, apiReady)
          + '<dl class="source-paths"><dt>Windows 路径</dt><dd>' + esc(shareUnc) + '</dd><dt>macOS 地址</dt><dd>' + esc(shareSmb) + '</dd></dl>';
    if (!checking && (!apiReady || sourceError)) document.getElementById("sourceAdvanced").open = true;
    bindConnectionActions();
  }

  async function refreshConnection(force = false) {
    const version = ++connectionVersion;
    const active = () => isCurrent() && version === connectionVersion;
    checking = true; sourceError = "";
    renderConnection();
    const res = await resolveApiBase();
    if (!active()) return;
    apiBase = res.base; apiReady = !!res.info;
    ["btnRoute1Pick", "btnRoute1Path"].forEach((id) => { document.getElementById(id).disabled = !apiReady; });
    document.getElementById("sourceLocalStatus").textContent = apiReady ? "" : "本地服务未连接，请先运行「启动工作台」。";
    if (apiReady) {
      try {
        const result = await loadSourceInfo(apiBase, force);
        if (!active()) return;
        info = result;
        shareUnc = info.shareUnc || shareUnc;
        shareSmb = info.shareSmb || shareSmb;
      } catch (err) {
        if (!active()) return;
        sourceError = "共享盘检查未完成：" + err.message + "；可继续导入本地文件。";
      }
    }
    if (!active()) return;
    checking = false;
    renderConnection();
  }

  function bindConnectionActions() {
    ["btnRetryConnectApi"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.onclick = () => refreshConnection(true);
    });
    ["btnOpenOnlineWorkbench"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.onclick = () => { window.open("http://127.0.0.1:4173/outputs/MDM%E9%AB%98%E7%BA%A7%E6%9F%A5%E8%AF%A2%E5%B7%A5%E4%BD%9C%E5%8F%B0.html" + (location.search || ""), "_blank"); };
    });
    const wakeSmbBtn = document.getElementById("btnWakeSmbMount");
    if (wakeSmbBtn) {
      wakeSmbBtn.onclick = () => {
        if (!shareUnc && !shareSmb) { toast("请先配置共享目录，或使用本地 Excel 导入", true); return; }
        if (IS_WIN_CLIENT) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUnc).then(() => toast("已复制 Windows 共享路径：" + shareUnc + "，可在资源管理器地址栏粘贴打开"));
          } else {
            toast("Windows 共享路径：" + shareUnc);
          }
        } else {
          if (!shareSmb) { toast("请先配置共享目录，或使用本地 Excel 导入", true); return; }
          window.location.href = shareSmb;
          toast("已唤起 macOS Finder 挂载内网共享目录：/Volumes/MDM示例表");
        }
      };
    }
    const copyCmdBtn = document.getElementById("btnCopyServeCmd");
    if (copyCmdBtn) {
      copyCmdBtn.onclick = () => {
        const cmd = IS_WIN_CLIENT
          ? "python scripts\\launch_workbench.py"
          : 'python3 scripts/launch_workbench.py';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(cmd).then(() => toast("已复制后台服务启动命令，粘贴到终端/CMD回车即可运行"));
        } else {
          toast("启动命令：" + cmd);
        }
      };
    }

    const reprobeBtn = document.getElementById("btnReprobeShare");
    if (reprobeBtn) {
      reprobeBtn.onclick = async () => {
        reprobeBtn.disabled = true;
        reprobeBtn.textContent = "正在检测并挂载…";
        try {
          const r = await fetch(apiBase + "/api/mount-share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const res = await r.json();
          if (res && res.shareStatus) {
            updateShareStatusChip(res.shareStatus, true);
            toast(res.shareStatus.statusLabel + "：" + (res.shareStatus.mount && res.shareStatus.mount.mountPoint || ""));
          }
          if (isCurrent()) await refreshConnection(true);
        } catch (err) {
          reprobeBtn.disabled = false;
          reprobeBtn.textContent = "重新检测 / 一键挂载";
          toast("检测失败：" + err.message, true);
        }
      };
    }

    document.getElementById("btnRoute2Auto").onclick = async () => {
      if (!apiReady) {
        toast("请双击运行「一键更新工作台.command」或通过 http://localhost:4173 访问以执行在线自动刷新", true);
        return;
      }
      const btn = document.getElementById("btnRoute2Auto");
      btn.disabled = true; btn.textContent = "正在扫描最新报表并重算 MDM + MPS 工艺路线…";
      try {
        const r = await fetch(apiBase + "/api/refresh-source", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(document.getElementById("srcShareFileSelect") ? { mode: "local_path", sourcePath: document.getElementById("srcShareFileSelect").value } : { mode: "auto_share" }),
        });
        const res = await r.json();
        if (!r.ok || !res.ok) throw new Error(res.error || "刷新失败");
        toast("已导入最新报表：" + (res.meta && res.meta.source) + "，正在刷新页面…");
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        btn.disabled = false; btn.textContent = "更新共享盘数据";
        toast("自动刷新失败：" + err.message, true);
      }
    };
  }

  document.getElementById("btnRoute1Pick").onclick = () => {
    const inp = document.getElementById("excelUploadInput");
    inp.onchange = async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      inp.value = "";
      if (!file) return;
      if (!apiReady) {
        toast("当前未连接本地服务，请使用「./一键更新工作台.command \"" + file.name + "\"」或通过 http://localhost:4173 上传", true);
        return;
      }
      const btn = document.getElementById("btnRoute1Pick");
      btn.disabled = true; btn.textContent = "正在上传并全量重算 " + file.name + " …";
      try {
        const buf = await file.arrayBuffer();
        const r = await fetch(apiBase + "/api/upload-excel", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
          body: buf,
        });
        const res = await r.json();
        if (!r.ok || !res.ok) throw new Error(res.error || "上传解析失败");
        toast("本地文件 " + file.name + " 导入并重算完成，正在刷新…");
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        btn.disabled = false; btn.textContent = "选择文件导入";
        toast("本地文件导入失败：" + err.message, true);
      }
    };
    inp.click();
  };

  document.getElementById("btnRoute1Path").onclick = async () => {
    const pVal = (document.getElementById("srcLocalPathInput").value || "").trim();
    if (!pVal) { toast("请先输入本地 .xlsx 报表完整路径", true); return; }
    if (!apiReady) {
      toast("请通过 http://localhost:4173 访问，或在终端执行：./一键更新工作台.command \"" + pVal + "\"", true);
      return;
    }
    const btn = document.getElementById("btnRoute1Path");
    btn.disabled = true; btn.textContent = "正在读取本地路径并重算…";
    try {
      const r = await fetch(apiBase + "/api/refresh-source", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "local_path", sourcePath: pVal }),
      });
      const res = await r.json();
      if (!r.ok || !res.ok) throw new Error(res.error || "路径解析失败");
      toast("已按指定路径重算：" + (res.meta && res.meta.source) + "，正在刷新…");
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      btn.disabled = false; btn.textContent = "按路径导入";
      toast("路径重建失败：" + err.message, true);
    }
  };
  // 先显示完整弹窗和关闭按钮，再等待本地健康检查及共享盘扫描。
  await refreshConnection();
}

/* ---------- 事件分发 ---------- */
/* ---------- 工艺属性类筛选激活时自动显示「问题明细」列 ---------- */
function ensureFlagsColumn() {
  if (state.visible.includes("flags")) return false;
  const anchor = ["blocking", "issueCount", "cat"].find((k) => state.visible.includes(k));
  if (anchor !== undefined) state.visible.splice(state.visible.indexOf(anchor) + 1, 0, "flags");
  else state.visible.push("flags");
  return true;
}
function ensureVconfColumns() {
  let added = false;
  for (const k of ["vconf", "load", "specC", "flags"]) {
    if (schemaByKey.has(k) && !state.visible.includes(k)) {
      state.visible.push(k);
      if (!state.order.includes(k)) state.order.push(k);
      added = true;
    }
  }
  if (added) syncVisibleOrder();
  return added;
}
function refreshFilteredViews() {
  state.page = 1;
  state.focusFilter.page = 1;
  state.vconfFilter.page = 1;
  state.processCheckFilter.page = 1;
  state.mpsFilter.page = 1;
  saveStateDebounced();
  refreshAll();
}
function refreshSearchResults() {
  const dock = typeof searchDock !== "undefined" && searchDock;
  const position = dock ? dock.beforeSearch() : null;
  refreshFilteredViews();
  if (dock) dock.afterSearch(position);
}
function focusSearchInput() {
  if (typeof searchDock !== "undefined" && searchDock) searchDock.focus();
  else document.getElementById("qInput").focus({ preventScroll: true });
}
// 字段搜索只筛选候选字段；通过原 select 的 change 复用条件和日期处理。
let customFieldPicker = null;
function matchingConditionFields(query) {
  const normalize = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const groups = new Map();
  for (const key of schemaKeys) {
    if (MDM_HIDDEN_KEYS.has(key)) continue;
    const field = schemaByKey.get(key);
    if (!words.every((word) => normalize(field.label + ' ' + field.key).includes(word))) continue;
    if (!groups.has(field.group)) groups.set(field.group, []);
    groups.get(field.group).push(field);
  }
  return [...groups.values()].flat();
}
function customFieldTrigger(index) {
  return document.querySelector('[data-field-picker-open][data-idx="' + index + '"]');
}
function closeCustomFieldPicker(restoreFocus = false) {
  if (!customFieldPicker) return;
  const index = customFieldPicker.index;
  document.getElementById('customFieldPicker')?.remove();
  customFieldPicker = null;
  const trigger = customFieldTrigger(index);
  trigger?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger?.focus({ preventScroll: true });
}
function setCustomFieldActive(index) {
  const picker = customFieldPicker;
  if (!picker) return;
  picker.active = index;
  const input = document.getElementById('customFieldSearch'), list = document.getElementById('customFieldOptions');
  list.querySelectorAll('[data-field-choice]').forEach((option, i) => option.classList.toggle('is-active', i === index));
  const active = list.querySelector('.is-active');
  if (!active) { input.removeAttribute('aria-activedescendant'); return; }
  input.setAttribute('aria-activedescendant', active.id);
  // 只滚动候选列表，避免 scrollIntoView 带动主页面。
  if (active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
  else if (active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = active.offsetTop + active.offsetHeight - list.clientHeight;
}
function renderCustomFieldOptions(query = '') {
  const picker = customFieldPicker;
  if (!picker) return;
  picker.matches = matchingConditionFields(query);
  let group = null;
  document.getElementById('customFieldOptions').innerHTML = picker.matches.map((field, index) => {
    const heading = group !== field.group ? '<div class="custom-field-group" role="presentation">' + esc(field.group) + '</div>' : '';
    group = field.group;
    return heading + '<button type="button" class="custom-field-option" role="option" tabindex="-1" id="customFieldOption' + index + '" data-field-choice="' + esc(field.key) + '" aria-selected="' + (field.key === picker.select.value) + '"><span>'
      + esc(field.label) + (field.label !== field.key ? '<small>' + esc(field.key) + '</small>' : '') + '</span>' + (field.key === picker.select.value ? ic('check', 13) : '') + '</button>';
  }).join('') || '<div class="custom-field-empty">未找到匹配字段</div>';
  document.getElementById('customFieldCount').textContent = query.trim() ? '找到 ' + picker.matches.length + ' 个字段' : '共 ' + picker.matches.length + ' 个字段';
  document.getElementById('customFieldSearchClear').hidden = !query;
  const selected = query ? 0 : picker.matches.findIndex((field) => field.key === picker.select.value);
  setCustomFieldActive(Math.max(0, selected));
}
function openCustomFieldPicker(trigger) {
  if (customFieldPicker?.index === trigger.dataset.idx) { closeCustomFieldPicker(true); return; }
  closeCustomFieldPicker();
  closeCustomDatePicker();
  const index = trigger.dataset.idx;
  // 先完成待生效的条件值，避免其延迟刷新关闭刚打开的字段列表。
  if (customFilterTimer) { refreshCustomFilters(); trigger = customFieldTrigger(index); }
  const select = trigger?.closest('.custom-filter-field').querySelector('select');
  if (!select) return;
  customFieldPicker = { index, select, active: 0, matches: [] };
  const box = document.createElement('div');
  box.id = 'customFieldPicker'; box.className = 'custom-field-picker';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '搜索条件 ' + customConditionPathLabel(index) + ' 的字段');
  box.innerHTML = '<div class="custom-field-search">' + ic('search', 14) + '<input id="customFieldSearch" type="text" placeholder="搜索字段名称或代码" autocomplete="off" role="combobox" aria-label="搜索字段名称或代码" aria-expanded="true" aria-controls="customFieldOptions" aria-autocomplete="list" aria-describedby="customFieldCount">'
    + '<button type="button" id="customFieldSearchClear" aria-label="清空字段搜索" hidden>' + ic('x', 12) + '</button></div><div class="custom-field-count" id="customFieldCount" role="status" aria-live="polite"></div><div class="custom-field-options" id="customFieldOptions" role="listbox" aria-label="可选字段"></div>';
  const rect = trigger.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 300), window.innerWidth - 16);
  const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
  const upward = below < 220 && above > below, height = Math.min(360, upward ? above : below);
  box.style.width = width + 'px'; box.style.maxHeight = Math.max(100, height) + 'px';
  box.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
  if (upward) box.style.bottom = window.innerHeight - rect.top + 5 + 'px';
  else box.style.top = Math.max(8, rect.bottom + 5) + 'px';
  document.body.appendChild(box);
  trigger.setAttribute('aria-expanded', 'true');
  renderCustomFieldOptions();
  document.getElementById('customFieldSearch').focus({ preventScroll: true });
}
function chooseCustomField(key) {
  const picker = customFieldPicker;
  if (!picker || !picker.matches.some((field) => field.key === key)) return;
  const { index, select } = picker;
  closeCustomFieldPicker();
  if (select.value !== key) { select.value = key; select.dispatchEvent(new Event('change', { bubbles: true })); }
  customFieldTrigger(index)?.focus({ preventScroll: true });
}
function bindCustomFieldPickers() {
  document.addEventListener('pointerdown', (e) => {
    // 保留旧输入框到 click 时的状态，防止 blur/change 先重绘并吞掉点击。
    if (e.target.closest('[data-field-picker-open]')) e.preventDefault();
    else if (customFieldPicker && !e.target.closest('#customFieldPicker')) closeCustomFieldPicker();
  });
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-field-picker-open]');
    const choice = e.target.closest('[data-field-choice]');
    const clear = e.target.closest('#customFieldSearchClear');
    if (!trigger && !choice && !clear) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (trigger) openCustomFieldPicker(trigger);
    else if (choice) chooseCustomField(choice.dataset.fieldChoice);
    else { const input = document.getElementById('customFieldSearch'); input.value = ''; renderCustomFieldOptions(); input.focus({ preventScroll: true }); }
  }, true);
  const search = (e) => { if (e.target.id === 'customFieldSearch' && !e.isComposing) renderCustomFieldOptions(e.target.value); };
  document.addEventListener('input', search);
  document.addEventListener('compositionend', search);
  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const trigger = e.target.closest('[data-field-picker-open]');
    if (trigger && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); openCustomFieldPicker(trigger); return; }
    if (!customFieldPicker || !e.target.closest('#customFieldPicker')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeCustomFieldPicker(true); }
    else if (e.key === 'Tab') closeCustomFieldPicker(true);
    else if (e.target.id === 'customFieldSearch' && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
      e.preventDefault(); e.stopImmediatePropagation();
      const picker = customFieldPicker;
      if (e.key === 'Enter') { const field = picker.matches[picker.active]; if (field) chooseCustomField(field.key); }
      else if (picker.matches.length) setCustomFieldActive((picker.active + (e.key === 'ArrowDown' ? 1 : -1) + picker.matches.length) % picker.matches.length);
    }
  }, true);
  document.addEventListener('focusin', (e) => { if (customFieldPicker && !e.target.closest('#customFieldPicker, [data-field-picker-open]')) closeCustomFieldPicker(); });
  document.addEventListener('scroll', (e) => { if (customFieldPicker && !e.target.closest?.('#customFieldPicker')) closeCustomFieldPicker(); }, true);
  window.addEventListener('resize', () => closeCustomFieldPicker());
}
let customFilterTimer = null;
function queueCustomFilterValue(input, isComposing) {
  clearTimeout(customFilterTimer);
  // 中文输入法选词期间保持输入框原样，确认文字后再查询。
  if (isComposing) return;
  const condition = customFilterNode(input.dataset.idx);
  if (!condition) return;
  condition[input.dataset.part === "valTo" ? "valTo" : "val"] = input.value;
  customFilterTimer = setTimeout(() => {
    customFilterTimer = null;
    if (input.dataset.dateInput && isoDate(input.value)) condition[input.dataset.part === "valTo" ? "valTo" : "val"] = isoDate(input.value);
    refreshCustomFilters();
  }, 220);
}
function refreshCustomFilters() {
  closeCustomFieldPicker();
  closeCustomDatePicker();
  clearTimeout(customFilterTimer);
  customFilterTimer = null;
  const active = document.activeElement;
  const control = active && active.closest("#customFilterZone") && active.matches("input, select") ? active : null;
  const action = control && control.dataset.act;
  const index = control && control.dataset.idx;
  const part = control && control.dataset.part;
  const start = control && control.selectionStart;
  const end = control && control.selectionEnd;
  refreshFilteredViews();
  if (action) {
    const next = document.querySelector('#customFilterZone [data-act="' + action + '"]' + (index === undefined ? '' : '[data-idx="' + index + '"]') + (part ? '[data-part="' + part + '"]' : ''));
    if (next) {
      next.focus({ preventScroll: true });
      if (typeof start === "number") next.setSelectionRange(start, end);
    }
  }
}
function copyQueryText(value, label) {
  const fallback = () => {
    const input = document.createElement("textarea"); input.value = value;
    input.style.cssText = 'position:fixed;opacity:0;pointer-events:none'; document.body.appendChild(input); input.select();
    try { if (!document.execCommand('copy')) throw new Error('copy'); toast("已复制" + label); }
    catch (e) { toast("复制失败，请手动选取内容", true); }
    finally { input.remove(); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(() => toast("已复制" + label), fallback);
  else fallback();
}
function onClick(e) {
  if (!e.target.closest(".dp-more")) document.querySelectorAll(".dp-more[open]").forEach((d) => { d.open = false; });
  const el = e.target.closest("[data-act]");
  if (!el) {
    if (e.target.id === "drawerMask") closeAllDrawers();
    if (!e.target.closest("#skuSuggest") && !e.target.closest(".sku-add")) document.getElementById("skuSuggest").style.display = "none";
    return;
  }
  const act = el.dataset.act, v = el.dataset.v, material = el.dataset.material;
  if (/^(focus-|analyze-|ana-|vconf-|process-check-|mps-)/.test(act)) saveStateDebounced();
  const moreMenu = el.closest(".dp-more");
  if (moreMenu && el.tagName === "BUTTON") moreMenu.open = false;
  switch (act) {
    case "quick-config-open": openQuickDetailConfig(); break;
    case "quick-config-cancel": closeQuickDetailConfig(); break;
    case "quick-config-save": saveQuickDetailConfig(); break;
    case "quick-config-reset":
      quickDetailDraft = normalizeQuickDetailView(); quickDetailSectionId = quickDetailDraft.sections[0].id; quickDetailSearch = ""; renderQuickDetailEditor(); break;
    case "quick-section-select": quickDetailSectionId = v; renderQuickDetailEditor(); break;
    case "quick-section-add":
      if (quickDetailDraft && quickDetailDraft.sections.length < 20) {
        const section = { id: 'quick_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), title: '自定义分区 ' + (quickDetailDraft.sections.length + 1), enabled: true, fields: [] };
        quickDetailDraft.sections.push(section); quickDetailSectionId = section.id; renderQuickDetailEditor();
      }
      break;
    case "quick-section-remove":
      if (quickDetailDraft && quickDetailDraft.sections.length > 1) {
        quickDetailDraft.sections = quickDetailDraft.sections.filter((s) => s.id !== v);
        if (quickDetailSectionId === v) quickDetailSectionId = quickDetailDraft.sections[0].id;
        renderQuickDetailEditor();
      }
      break;
    case "quick-section-move": {
      if (!quickDetailDraft) break;
      const index = quickDetailDraft.sections.findIndex((s) => s.id === v), target = quickDetailDraft.sections[index + Number(el.dataset.delta)];
      if (target && moveQuickDetailItem('section', v, target.id)) renderQuickDetailEditor(); break;
    }
    case "quick-field-move": {
      const section = quickDetailActiveSection(); if (!section) break;
      const index = section.fields.indexOf(v), target = section.fields[index + Number(el.dataset.delta)];
      if (target && moveQuickDetailItem('field', v, target)) renderQuickDetailDraftFields(); break;
    }
    case "quick-field-remove": {
      const section = quickDetailActiveSection(); if (!section) break;
      section.fields = section.fields.filter((key) => key !== v); renderQuickDetailDraftFields(); break;
    }
    case "locate-field": locateResultField(v); break;
    case "field-locator-clear": clearFieldLocator(); break;
    case "process-rules-config": openProcessEditor(); break;
    case "open-dp-view-settings": openDetailViewSettings(); break;
    case "close-dp-view-settings": closeDetailViewSettings(); break;
    case "copy-material": copyQueryText(material, "物料编码"); break;
    case "detail-copy-info": {
      const r = byMaterial.get(state.detail); if (!r) break;
      const view = normalizeQuickDetailView(state.quickDetailView);
      const fields = view.sections.filter((s) => s.enabled).flatMap((s) => s.fields).filter((key) => !view.hideEmpty || (r[key] !== null && r[key] !== undefined && String(r[key]).trim() !== ""));
      const keys = [...new Set(['material', ...(view.showDescription ? ['desc'] : []), ...fields])];
      copyQueryText(keys.map((k) => schemaByKey.get(k).label + '：' + fmt(r[k])).join('\n'), "物料信息"); break;
    }
    case "copy-query-codes": {
      const batch = querySearchReport().batch;
      if (batch && ['missing', 'excluded'].includes(v)) copyQueryText(batch[v].join('\n'), "编码清单"); break;
    }
    case "query-view-save-open": openQuerySave(); break;
    case "query-save-close": closeQuerySave(); break;
    case "query-view-save": saveQueryView(v === 'new'); break;
    case "query-view-reload": applyQueryView(state.activeQueryView); break;
    case "query-view-delete": {
      const active = state.queryViews.find((view) => view.id === state.activeQueryView); if (!active) break;
      closeQuerySave();
      confirmModal("删除已保存查询", "删除「" + active.name + "」？当前结果和原有字段视图保持原样。").then((ok) => {
        if (!ok) return;
        state.queryViews = state.queryViews.filter((view) => view.id !== active.id); state.activeQueryView = '';
        saveState(); renderQueryWorkspace(); toast("已删除查询");
      }); break;
    }
    case "search-all-scope":
      clearTimeout(customFilterTimer); state.filters = defaultQueryFilters(""); refreshFilteredViews();
      toast("已保留搜索词，扩大到全部状态与分类"); break;
    case "field-view-apply": applyFieldView(v); break;
    case "field-view-save": saveNamedFieldView(); break;
    case "field-view-create":
    case "field-view-copy": {
      const previous = state.savedViews.find((v) => "view:" + v.id === state.activeFieldView);
      state.activeFieldView = "";
      state.fieldViewDraftName = act === "field-view-copy" && previous ? previous.name + " 副本" : "";
      syncSavedViewControls();
      document.getElementById("fdViewName").focus();
      break;
    }
    case "field-view-delete": {
      const active = state.savedViews.find((v) => "view:" + v.id === state.activeFieldView);
      if (!active) break;
      confirmModal("删除自定义视图", "删除「" + active.name + "」及其快捷入口？当前表格字段保持原样。").then((ok) => {
        if (!ok) return;
        const id = "view:" + active.id;
        state.savedViews = state.savedViews.filter((x) => x.id !== active.id);
        state.viewShortcuts = state.viewShortcuts.filter((x) => x !== id);
        if (shortcutDraft) shortcutDraft = shortcutDraft.filter((x) => x !== id);
        state.activeFieldView = ""; state.fieldViewDraftName = null;
        saveState(); syncSavedViewControls(); renderShortcutEditor();
        toast("已删除自定义视图");
      });
      break;
    }
    case "configure-shortcuts":
      openDrawer("fields"); refreshAll();
      document.getElementById("fdShortcutEditor").open = true;
      document.getElementById("fdShortcutEditor").scrollIntoView({ block: "nearest" });
      break;
    case "shortcut-up":
    case "shortcut-down": {
      const idx = (shortcutDraft || []).indexOf(v), to = idx + (act === "shortcut-up" ? -1 : 1);
      if (idx >= 0 && to >= 0 && to < shortcutDraft.length) { [shortcutDraft[idx], shortcutDraft[to]] = [shortcutDraft[to], shortcutDraft[idx]]; renderShortcutEditor(); }
      break;
    }
    case "save-shortcuts":
      state.viewShortcuts = [...(shortcutDraft || [])]; updatePresetOrderFromShortcuts(state.viewShortcuts);
      saveState(); syncPresetViewControls(); renderViewShortcuts(); renderShortcutEditor();
      toast("已保存常用视图入口与排列顺序"); break;
    case "open-personal-config": openPersonalConfig(); break;
    case "config-export": exportPersonalConfig(); break;
    case "config-import": document.getElementById("fileImport").click(); break;
    case "config-retry":
      configSnapshot = ""; saveState(); break;
    case "xnav-step": {
      const targetId = el.dataset.target || "mainTableWrap";
      const wrap = document.getElementById(targetId);
      if (!wrap) break;
      const maxScroll = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const step = Math.max(280, Math.round((wrap.clientWidth - 480) * 0.78));
      const dir = el.dataset.dir;
      let next = wrap.scrollLeft;
      if (dir === "start") next = 0;
      else if (dir === "end") next = maxScroll;
      else if (dir === "left") next = Math.max(0, wrap.scrollLeft - step);
      else if (dir === "right") next = Math.min(maxScroll, wrap.scrollLeft + step);
      wrap.scrollTo({ left: next, behavior: "smooth" });
      setTimeout(() => syncTableXnav(targetId), 240);
      break;
    }
    case "view-table": state.view = "table"; saveStateDebounced(); refreshAll(); break;
    case "view-card": state.view = "card"; saveStateDebounced(); refreshAll(); break;
    case "open-fields": openDrawer("fields"); renderFieldDrawer(); syncBodyScrollLock(); break;
    case "close-drawer": closeAllDrawers(); break;
    case "view-detail":
      if (el.tagName === 'A' && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) break;
      e.preventDefault(); state.detail = material; openDrawer("detail");
      renderDetail(); renderFieldDrawer(); renderCompare(); syncBodyScrollLock(); break;
    case "open-detail-page":
      if (el.tagName === 'A' && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) break;
      e.preventDefault();
      if (material && byMaterial.has(material)) {
        state.detail = material;
        state.detailPage = true;
        syncDetailUrl(false);
        refreshAll();
      }
      break;
    case "add-sku": addToBasket(material); break;
    case "add-sku-input": {
      const r = findSku(document.getElementById("skuInput").value);
      if (r) { addToBasket(r.material); document.getElementById("skuInput").value = ""; renderSuggest([]); }
      else {
        const list = suggestSkus(document.getElementById("skuInput").value);
        if (list.length) renderSuggest(list);
        else toast("未找到匹配的物料编码 / V码", true);
      }
      break;
    }
    case "suggest-pick": addToBasket(material); document.getElementById("skuInput").value = ""; renderSuggest([]); break;
    case "basket-remove": removeFromBasket(material); break;
    case "basket-toggle": state.basketExpanded = !state.basketExpanded; renderBasket(); break;
    case "basket-clear":
      confirmModal("清空对比篮", "确定清空对比篮中的 " + state.basket.length + " 个 SKU 吗？").then((ok) => {
        if (!ok) return;
        state.basket = []; basketSet.clear(); saveStateDebounced(); refreshAll(); toast("对比篮已清空");
      });
      break;
    case "basket-compare": if (state.basket.length < 2) { toast("至少需要 2 个 SKU 才能对比", true); break; } state.basketExpanded = false; openDrawer("compare"); refreshAll(); break;
    case "cmp-diff-only": state.cmpDiffOnly = !state.cmpDiffOnly; saveStateDebounced(); refreshAll(); break;
    case "sort": {
      if (state.sort.key === v) state.sort.dir = -state.sort.dir;
      else state.sort = { key: v, dir: 1 };
      state.sort.explicit = true;
      state.page = 1; saveStateDebounced(); refreshAll();
      break;
    }
    case "page": {
      const p = parseInt(v, 10);
      if (p >= 1 && p <= derived.pages) {
        state.page = p; refreshAll();
      }
      break;
    }
    case "tools-open":
      closeQueryOptions();
      closeColumnFilterMenu();
      switchWorkspaceTab(state.lastToolTab || "focus");
      document.querySelector('#toolsNav button.on')?.focus({ preventScroll: true });
      break;
    case "tools-close":
      switchWorkspaceTab("results");
      document.getElementById("toolsEntry")?.focus({ preventScroll: true });
      break;
    case "tab": switchWorkspaceTab(v); break;
    case "open-source-modal": openSourceModal(); break;
    case "vconf-inspect": {
      const vc = (el.dataset.vcode || v || "").trim();
      state.tab = "vconf";
      state.vconfFilter.q = vc;
      state.vconfFilter.page = 1;
      closeAllDrawers();
      if (state.detailPage) {
        state.detailPage = false;
        state.detail = null;
        syncDetailUrl(false);
      }
      saveStateDebounced();
      refreshAll();
      toast(vc ? "已在「同V码冲突」板块定位 V 码：" + vc : "已打开「同V码冲突」专属核查板块");
      break;
    }
    case "vconf-compare": {
      const vc = (el.dataset.vcode || v || "").trim();
      if (!vc) break;
      const members = derived.filtered.filter((r) => r.vcode === vc && r.vconf && vconfEligible(r));
      if (members.length < 2) { toast("该 V 码下符合冲突核查范围的物料不足 2 个", true); break; }
      const byVar = new Map();
      for (const m of members) {
        const vk = String(m.load == null ? "" : m.load) + "||" + String(m.specC || "");
        if (!byVar.has(vk)) byVar.set(vk, []);
        byVar.get(vk).push(m);
      }
      const picked = [];
      for (const list of byVar.values()) {
        if (picked.length < 8 && list[0]) picked.push(list[0].material);
      }
      for (const m of members) {
        if (picked.length >= 8) break;
        if (!picked.includes(m.material)) picked.push(m.material);
      }
      state.basket = picked;
      basketSet.clear();
      picked.forEach((m) => basketSet.add(m));
      state.cmpDiffOnly = true;
      ensureVconfColumns();
      if (state.detailPage) {
        state.detailPage = false;
        state.detail = null;
        syncDetailUrl(false);
      }
      openDrawer("compare");
      saveStateDebounced();
      refreshAll();
      toast("已将 V 码 " + vc + " 下的 " + picked.length + " 个冲突 SKU 载入对比抽屉（已开启仅看差异）");
      break;
    }
    case "vconf-lock-results": {
      const vc = (el.dataset.vcode || v || "").trim();
      if (!vc) break;
      state.q = vc;
      state.qField = "vcode";
      state.qMode = "exact";
      const qEl = document.getElementById("qInput");
      if (qEl) { qEl.value = vc; resizeSearchInput(qEl); }
      ensureVconfColumns();
      state.sort = { key: "load", dir: 1 };
      state.page = 1;
      state.tab = "results";
      closeAllDrawers();
      if (state.detailPage) {
        state.detailPage = false;
        state.detail = null;
        syncDetailUrl(false);
      }
      saveStateDebounced();
      refreshAll();
      toast("已在查询结果表精准锁定 V 码 = " + vc + "，并自动展开「同V码冲突 / 原始装数 / 标准化规格」列");
      break;
    }
    case "vconf-filter-all": {
      state.filters.onlyVconf = true;
      ensureVconfColumns();
      state.sort = { key: "vcode", dir: 1 };
      state.page = 1;
      state.tab = "results";
      saveStateDebounced();
      refreshAll();
      toast("已在查询结果表中筛选全部同 V 码冲突 SKU（共 " + (derived.stats.vconf || 0).toLocaleString() + " 个），按 V 码聚合排序");
      break;
    }
    case "vconf-sort":
      state.vconfFilter.sort = ["materials", "specs", "vcode"].includes(v) ? v : "materials";
      state.vconfFilter.page = 1;
      renderVconf();
      break;
    case "vconf-clear-q":
      state.vconfFilter.q = "";
      state.vconfFilter.page = 1;
      renderVconf();
      break;
    case "vconf-toggle-expand":
      state.vconfFilter.expandAll = !state.vconfFilter.expandAll;
      renderVconf();
      break;
    case "vconf-page":
      state.vconfFilter.page = Math.max(1, parseInt(v, 10) || 1);
      renderVconf();
      break;
    case "export-vconf-csv":
      exportVconfCsv();
      break;
    case "process-check-scope": state.processCheckFilter.onlyIssue = v !== "all"; state.processCheckFilter.page = 1; renderProcessChecks(); break;
    case "process-check-page": state.processCheckFilter.page = Math.max(1, parseInt(v, 10) || 1); renderProcessChecks(); break;
    case "export-process-checks-csv": exportProcessChecksCsv(); break;
    case "mps-status": state.mpsFilter.status = state.mpsFilter.status === v ? "" : v; state.mpsFilter.page = 1; refreshAll(); break;
    case "mps-cat": state.mpsFilter.cat = state.mpsFilter.cat === v ? "" : v; state.mpsFilter.page = 1; refreshAll(); break;
    case "mps-issue-type": state.mpsFilter.issueType = state.mpsFilter.issueType === v ? "" : v; state.mpsFilter.page = 1; refreshAll(); break;
    case "mps-only-issue": state.mpsFilter.onlyIssue = !state.mpsFilter.onlyIssue; state.mpsFilter.page = 1; refreshAll(); break;
    case "mps-clear-filter": state.mpsFilter = { status: "", cat: "", issueType: "", onlyIssue: false, page: 1 }; refreshAll(); break;
    case "mps-page": state.mpsFilter.page = Math.max(1, parseInt(v, 10) || 1); renderMps(); break;
    case "export-mps-csv": exportMpsCsv(); break;
    case "custom-filter-open":
      state.filterCollapsed = false;
      state._userToggledCollapse = true;
      saveStateDebounced();
      renderFilters();
      document.getElementById("customFilterZone").scrollIntoView({ block: "nearest", behavior: "smooth" });
      break;
    case "custom-filter-add":
    case "custom-filter-add-group": {
      const parent = el.dataset.parent || '', list = customFilterChildren(parent);
      const group = act === 'custom-filter-add-group';
      if (!list) break;
      if (customFilterEntries().length + (group ? 2 : 1) > CUSTOM_MAX_NODES || group && parent.split('.').filter(Boolean).length >= CUSTOM_MAX_DEPTH) {
        toast('条件最多支持 ' + CUSTOM_MAX_NODES + ' 项、' + CUSTOM_MAX_DEPTH + ' 层条件组', true); break;
      }
      const condition = { field: schemaByKey.has('品类二级') ? '品类二级' : 'cat', op: 'eq', val: '' };
      const parentLogic = parent ? customFilterNode(parent).logic : state.filters.customLogic;
      list.push(group ? { type: 'group', logic: parentLogic === 'OR' ? 'AND' : 'OR', conditions: [condition] } : condition);
      const path = (parent ? parent + '.' : '') + (list.length - 1) + (group ? '.0' : '');
      refreshCustomFilters();
      const field = customFieldTrigger(path);
      if (field) {
        field.focus({ preventScroll: true });
        const viewport = field.closest('.custom-filter-list');
        if (viewport) viewport.scrollTop += Math.max(0, field.getBoundingClientRect().bottom - viewport.getBoundingClientRect().bottom);
      }
      break;
    }
    case "custom-filter-del": {
      const parts = String(el.dataset.idx || '').split('.'), index = Number(parts.pop());
      const list = customFilterChildren(parts.join('.'));
      if (list && Number.isInteger(index) && index >= 0 && index < list.length) {
        list.splice(index, 1); refreshCustomFilters();
      }
      break;
    }
    case "custom-filter-clear":
      state.filters.customConditions = [];
      state.filters.customLogic = "AND";
      refreshCustomFilters();
      break;
    case "filter-mfg": state.filters.mfg.has(v) ? state.filters.mfg.delete(v) : state.filters.mfg.add(v); refreshFilteredViews(); break;
    case "filter-formula": state.filters.formula.has(v) ? state.filters.formula.delete(v) : state.filters.formula.add(v); refreshFilteredViews(); break;
    case "filter-cat": state.filters.cats.has(v) ? state.filters.cats.delete(v) : state.filters.cats.add(v); refreshFilteredViews(); break;
    case "filter-stock": state.filters.stocks.has(v) ? state.filters.stocks.delete(v) : state.filters.stocks.add(v); refreshFilteredViews(); break;
    case "filter-brand": state.filters.brands.has(v) ? state.filters.brands.delete(v) : state.filters.brands.add(v); refreshFilteredViews(); break;
    case "filter-status": state.filters.status = state.filters.status === v ? "" : v; refreshFilteredViews(); break;
    case "filter-pre": state.filters.pre = state.filters.pre === v ? "" : v; refreshFilteredViews(); break;
    case "filter-scope": state.filters.scope = state.filters.scope === v ? "" : v; refreshFilteredViews(); break;
    case "toggle-more":
      if (state.expandedMore.has(v)) state.expandedMore.delete(v);
      else state.expandedMore.add(v);
      renderFilters();
      break;
    case "toggle-filter-collapse":
      state.filterCollapsed = !state.filterCollapsed;
      state._userToggledCollapse = true;
      saveStateDebounced();
      renderFilters();
      break;
    case "q-mode":
      state.qMode = normalizeSearchMode(v);
      closeQueryOptions();
      refreshFilteredViews();
      toast(state.qMode === "exact" ? "已切换为「精准匹配」模式" : "智能搜索会自动识别关键词和多条编码");
      break;
    case "q-quick-lock": {
      closeQueryOptions();
      const targetField = el.dataset.field || "all";
      const targetMode = el.dataset.mode || "exact";
      if (state.qField === targetField && state.qMode === targetMode) {
        state.qField = "all"; state.qMode = "smart";
        toast("已取消字段精准锁定，恢复全字段智能模糊");
      } else {
        state.qField = targetField; state.qMode = targetMode;
        const fLabel = (SEARCH_FIELDS.find((x) => x.key === targetField) || {}).label || targetField;
        toast("已锁定：" + fLabel + (targetMode === "exact" ? " = 精准匹配" : " 内搜索"));
      }
      refreshFilteredViews();
      break;
    }
    case "q-reset-mode":
      state.qField = "all"; state.qMode = "smart";
      refreshFilteredViews();
      toast("已恢复全字段智能模糊搜索");
      break;
    case "clear-q":
      state.q = ""; state.tokens = [];
      document.getElementById("qInput").value = "";
      resizeSearchInput(document.getElementById("qInput"));
      if (state._autoCollapsedBySearch && !state._userToggledCollapse) {
        state._autoCollapsedBySearch = false;
      }
      refreshSearchResults();
      focusSearchInput();
      break;
    case "toggle-only": {
      state.filters[v] = !state.filters[v];
      let colNote = "";
      if (v === "onlyPdf" && state.filters[v]) colNote = ensureFlagsColumn() ? "，已自动显示「问题明细」列" : "";
      if (v === "onlyVconf" && state.filters[v]) {
        colNote = ensureVconfColumns() ? "，已自动显示「同V码冲突 / 原始装数 / 标准化规格」列" : "";
        state.sort = { key: "vcode", dir: 1 };
      }
      refreshFilteredViews();
      if (v === "onlyPdf") toast(state.filters[v] ? "已筛选工艺属性检查命中的物料" + colNote : "已取消工艺属性筛选");
      if (v === "onlyVconf") toast(state.filters[v] ? "已筛选同 V 码规格冲突物料" + colNote + "（也可切到顶部『同V码冲突』标签按 V 码组对比核查）" : "已取消同 V 码冲突筛选");
      break;
    }
    case "field-issue-filter": {
      state.filters.onlyFieldIssue = state.filters.onlyFieldIssue === v ? "" : v;
      if (state.filters.onlyFieldIssue) ensureFlagsColumn();
      state.tab = "results"; state.page = 1; saveStateDebounced(); refreshAll();
      break;
    }
    case "pdf-rule-filter": {
      const no = String(v);
      state.filters.onlyPdfRule = state.filters.onlyPdfRule === no ? "" : no;
      let colNote = "";
      if (state.filters.onlyPdfRule) colNote = ensureFlagsColumn() ? "，已自动显示「问题明细」列" : "";
      if (el.dataset.targetTab === "results") state.tab = "results";
      refreshFilteredViews();
      const rule = (DATASET.pdfRules || []).find((x) => String(x.no) === no);
      toast(state.filters.onlyPdfRule ? "已筛选工艺属性规则 " + no + (rule ? "（" + rule.title + "）" : "") + " 命中的物料" + colNote : "已取消规则筛选");
      break;
    }
    case "column-filter-clear": delete state.filters.columnFilters[v]; refreshFilteredViews(); break;
    case "clear-field-issue": state.filters.onlyFieldIssue = ""; refreshFilteredViews(); break;
    case "clear-filters":
      clearTimeout(customFilterTimer);
      state.filters = defaultQueryFilters();
      state.q = ""; state.tokens = []; state.qField = "all"; state.qMode = "smart";
      document.getElementById("qInput").value = "";
      resizeSearchInput(document.getElementById("qInput"));
      if (state._autoCollapsedBySearch && !state._userToggledCollapse) {
        state.filterCollapsed = false;
        state._autoCollapsedBySearch = false;
      }
      refreshFilteredViews();
      break;
    case "focus-all":
      state.filters.onlyBlock = true;
      ensureFlagsColumn();
      state.tab = "results"; state.page = 1; saveStateDebounced(); refreshAll();
      toast("已在查询结果中锁定当前范围需重点核查的 " + (derived.stats ? derived.stats.blocking : STATS.blocking).toLocaleString() + " 个 SKU");
      break;
    case "focus-group":
      state.focusFilter.group = state.focusFilter.group === v ? "" : v;
      state.focusFilter.reason = "";
      state.focusFilter.page = 1;
      renderFocus();
      break;
    case "focus-reason":
      state.focusFilter.reason = state.focusFilter.reason === v ? "" : v;
      state.focusFilter.page = 1;
      renderFocus();
      break;
    case "focus-page":
      state.focusFilter.page = Math.max(1, parseInt(v, 10) || 1);
      renderFocus();
      {
        const sec = document.getElementById("panel-focus");
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      break;
    case "focus-reset":
      state.focusFilter = { group: "", reason: "", q: "", sort: "severity", page: 1, pageSize: 40 };
      renderFocus();
      break;
    case "export-focus-csv":
      exportFocusCsv();
      break;
    case "ana-pick-field":
      if (v && schemaByKey.has(v)) {
        state.analyzeField = v;
        state.analyzeFilter.family = "";
        saveStateDebounced();
        renderAnalyze();
      }
      break;
    case "ana-sort-fields":
      state.analyzeFilter.sort = ["issue", "miss", "nafill", "order"].includes(v) ? v : "issue";
      renderAnalyze();
      break;
    case "ana-scope-mode":
      state.analyzeFilter.scopeMode = v === "all" ? "all" : "scope";
      renderAnalyze();
      break;
    case "ana-val-mode":
      state.analyzeFilter.valMode = v === "tail" ? "tail" : "top";
      renderAnalyze();
      break;
    case "ana-family-filter":
      state.analyzeFilter.family = state.analyzeFilter.family === v ? "" : v;
      renderAnalyze();
      break;
    case "ana-drill-val": {
      const fKey = el.dataset.field || state.analyzeField;
      const val = el.dataset.val || "";
      if (!fKey || !val) break;
      if (!state.visible.includes(fKey) && !MDM_HIDDEN_KEYS.has(fKey)) {
        state.visible.splice(Math.min(4, state.visible.length), 0, fKey);
        syncVisibleOrder();
      }
      state.q = val;
      if (SEARCH_FIELDS.some((sf) => sf.key === fKey)) {
        state.qField = fKey;
        state.qMode = "exact";
      } else {
        state.qField = "all";
        state.qMode = "smart";
      }
      const qEl = document.getElementById("qInput");
      if (qEl) { qEl.value = val; resizeSearchInput(qEl); }
      state.tab = "results";
      state.page = 1;
      saveStateDebounced();
      refreshAll();
      toast("已下钻至查询结果：「" + ((schemaByKey.get(fKey) || {}).label || fKey) + " = " + val + "」并自动置顶该列");
      break;
    }
    case "ana-drill-missing": {
      const fKey = el.dataset.field || state.analyzeField;
      const mode = el.dataset.mode || "req_miss";
      if (!fKey || !schemaByKey.has(fKey)) break;
      const spec = typeof getFieldScopeSpec === "function" ? getFieldScopeSpec(fKey) : null;
      const rsAll = derived.filtered || [];
      const targetMats = [];
      for (const r of rsAll) {
        const fam = typeof getRowFamily === "function" ? getRowFamily(r) : "other";
        const role = spec ? spec.classifyRow(r, fam) : "opt";
        const val = r[fKey];
        const isNone = typeof isConfirmedNoneVal === "function" ? isConfirmedNoneVal(val) : false;
        const isFill = !isNone && (typeof isFilledVal === "function" ? isFilledVal(val) : false);
        if (mode === "req_miss" && role === "req" && !isFill && !isNone) {
          targetMats.push(r.material);
        } else if (mode === "na_filled" && role === "na" && isFill) {
          targetMats.push(r.material);
        }
      }
      if (!targetMats.length) { toast("当前未命中对应的物料", true); break; }
      if (!state.visible.includes(fKey) && !MDM_HIDDEN_KEYS.has(fKey)) {
        state.visible.splice(Math.min(4, state.visible.length), 0, fKey);
        syncVisibleOrder();
      }
      const batchText = targetMats.slice(0, 500).join("\n");
      state.q = batchText;
      state.qMode = "smart";
      state.qField = "material";
      const qEl = document.getElementById("qInput");
      if (qEl) { qEl.value = batchText; resizeSearchInput(qEl); }
      state.tab = "results";
      state.page = 1;
      saveStateDebounced();
      refreshAll();
      toast(mode === "na_filled"
        ? "已在查询结果中锁定「" + (schemaByKey.get(fKey).label) + "」非适用域越界填报的 " + targetMats.length + " 个 SKU"
        : "已在查询结果中锁定「" + (schemaByKey.get(fKey).label) + "」必审适用域内待补录的 " + targetMats.length + " 个 SKU");
      break;
    }
    case "field-toggle": break; /* checkbox 由 change 事件处理 */
    case "field-top": {
      if (PINNED_KEYS.includes(v)) break;
      const vis = orderedVisibleKeys();
      const idx = vis.indexOf(v);
      if (idx <= 4) break;
      vis.splice(idx, 1);
      vis.splice(4, 0, v);
      applyVisibleListOrder(vis);
      break;
    }
    case "field-up": case "field-down": {
      if (PINNED_KEYS.includes(v)) break;
      const vis = orderedVisibleKeys();
      const i = vis.indexOf(v);
      const j = act === "field-up" ? i - 1 : i + 1;
      if (i < 4 || j < 4 || j >= vis.length) break;
      [vis[i], vis[j]] = [vis[j], vis[i]];
      applyVisibleListOrder(vis);
      break;
    }
    case "field-remove": {
      if (PINNED_KEYS.includes(v)) { toast("核心 4 列（物料编码+V码+物料规格+物料说明）常驻保留", true); break; }
      const vis = orderedVisibleKeys().filter((k) => k !== v);
      applyVisibleListOrder(vis);
      break;
    }
    case "field-grp-all": {
      const vis = orderedVisibleKeys();
      for (const k of schemaKeys) {
        if (!MDM_HIDDEN_KEYS.has(k) && (schemaByKey.get(k) || {}).group === v && !vis.includes(k)) vis.push(k);
      }
      applyVisibleListOrder(vis);
      break;
    }
    case "field-grp-none": {
      const vis = orderedVisibleKeys().filter((k) => PINNED_KEYS.includes(k) || (schemaByKey.get(k) || {}).group !== v);
      applyVisibleListOrder(vis);
      break;
    }
    case "preset": {
      state.activeFieldView = "preset:" + v; state.fieldViewDraftName = null;
      const keys = fieldViewKeys("preset:" + v).filter((k) => schemaByKey.has(k) && !MDM_HIDDEN_KEYS.has(k));
      applyVisibleListOrder(keys);
      toast("已应用「" + v + "」列预设（核心 4 列已固定前置）");
      break;
    }
    case "fields-all": applyVisibleListOrder([...state.order.filter((k) => !MDM_HIDDEN_KEYS.has(k))]); break;
    case "fields-none": applyVisibleListOrder([...PINNED_KEYS]); toast("已仅保留核心 4 列（物料编码+V码+物料规格+物料说明）"); break;
    case "fields-reset":
      confirmModal("恢复默认字段", "将恢复默认字段顺序与可见字段，确定吗？").then((ok) => {
        if (!ok) return;
        state.order = schemaKeys.filter((k) => !MDM_HIDDEN_KEYS.has(k));
        const defVis = QUERY_FIELD_BUNDLES["日常查料"].filter((k) => schemaByKey.has(k) && !MDM_HIDDEN_KEYS.has(k));
        applyVisibleListOrder(defVis);
        toast("已恢复默认字段顺序与展示列");
      });
      break;
    case "export-csv": exportCsv(); break;
    case "export-json": exportJson(); break;
    case "export-basket": exportBasket(); break;
    case "export-analysis": exportAnalysisCsv(); break;
    case "backup": exportBackup(); break;
    case "import": document.getElementById("fileImport").click(); break;
    case "detail-add-basket": addToBasket(state.detail); break;
    case "detail-export": exportSku(state.detail); break;
    case "detail-fullscreen":
      state.detailPage = true;
      syncDetailUrl(false);
      refreshAll();
      break;
    case "close-page":
      state.detailPage = false;
      state.detail = null;
      syncDetailUrl(false);
      refreshAll();
      break;
    case "detail-copy-link": {
      const m = state.detail || "";
      const link = buildDetailDeepLinkUrl(m, state.dpOverrideTplId || "");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => toast("已复制物料链接"), () => toast("复制失败", true));
      else { const ta = document.createElement("textarea"); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("已复制物料链接"); }
      break;
    }
    case "toggle-dp-classic": state.dpShowClassicCols = !state.dpShowClassicCols; saveStateDebounced(); renderDetailPage(); break;
    case "open-dp-config":
      closeDetailViewSettings();
      if (state.detail && byMaterial.has(state.detail)) {
        const m = matchDpTemplateForSku(byMaterial.get(state.detail));
        if (m && m.tpl) state.dpEditingTplId = m.tpl.id;
      }
      state.dpConfigTab = "canvas";
      state.dpConfigOpen = true;
      renderDpConfigModal();
      if (typeof syncBodyScrollLock === "function") syncBodyScrollLock();
      break;
    case "open-dp-config-tpl":
      closeDetailViewSettings();
      if (el.dataset.tpl) state.dpEditingTplId = el.dataset.tpl;
      state.dpConfigTab = "canvas";
      state.dpConfigOpen = true;
      renderDpConfigModal();
      if (typeof syncBodyScrollLock === "function") syncBodyScrollLock();
      break;
    case "open-dp-config-rules":
      closeDetailViewSettings();
      state.dpConfigTab = "rules";
      state.dpConfigOpen = true;
      renderDpConfigModal();
      if (typeof syncBodyScrollLock === "function") syncBodyScrollLock();
      break;
    case "close-dp-config":
      state.dpConfigOpen = false;
      saveStateDebounced();
      renderDpConfigModal();
      renderDetailPage();
      if (typeof syncBodyScrollLock === "function") syncBodyScrollLock();
      toast("单品视窗模板与条件路由已保存并实时生效");
      break;
    case "dp-cfg-tab":
      state.dpConfigTab = v === "rules" ? "rules" : "canvas";
      renderDpConfigModal();
      break;
    case "dp-select-tpl":
      state.dpEditingTplId = el.dataset.tpl;
      renderDpConfigModal();
      break;
    case "dp-edit-tpl-canvas":
      state.dpEditingTplId = el.dataset.tpl;
      state.dpConfigTab = "canvas";
      renderDpConfigModal();
      break;
    case "dp-reset-defaults":
      confirmModal("恢复内置预设视窗模板", "将恢复内置的「非卷类看板」「卷类看板」「通用默认看板」及其路由规则，确定吗？").then((ok) => {
        if (!ok) return;
        state.dpTemplates = buildDefaultDpTemplates();
        state.dpEditingTplId = state.dpTemplates[0].id;
        state.dpOverrideTplId = "";
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
        toast("已恢复内置预设视窗模板与条件路由");
      });
      break;
    case "dp-tpl-add": {
      const newId = "tpl_" + Date.now();
      const newTpl = {
        id: newId,
        name: "自定义视窗模板 " + (state.dpTemplates.length + 1),
        desc: "当满足指定条件时自动使用此模板",
        isDefault: false,
        priority: 30,
        logic: "OR",
        conditions: [{ field: "cat", op: "eq", val: "软抽" }],
        blocks: [
          { id: "b1_" + Date.now(), title: "核心标识与分类通栏", type: "banner", span: 12, accentFields: ["制造类别", "cat", "stock"], fields: ["制造类别", "cat", "stock", "vcode", "material", "desc", "spec"] },
          { id: "b2_" + Date.now(), title: "生产工艺与包装规格", type: "fields", span: 6, fields: ["压线/压花", "层数", "纸长", "纸宽", "pack"] },
          {
            id: "b3_" + Date.now(), title: "重量、体积与中包/外包装尺寸", type: "pack_SpecBox", span: 6,
            fields: ["net", "gross", "体积", "load", "unit"],
            subBoxes: [
              { title: "中包：长 × 宽 × 高", fields: ["单提长", "单提宽", "单提高", "中包包装方式"] },
              { title: "外包装：长 × 宽 × 高", fields: ["长(外包装)", "宽(外包装)", "高(外包装)", "装箱方式"] },
            ],
          },
          {
            id: "b4_" + Date.now(), title: "品牌电商 & 跨部门相似字段横向对比", type: "dept_compare", span: 7,
            fields: ["brand", "ecom"],
            compareRows: [
              { dim: "品类口径", fields: ["品类（五级架构）", "品类一级", "品类二级", "cat"] },
              { dim: "品牌口径", fields: ["品牌（五级架构）", "brand", "是否OEM"] },
              { dim: "销售大类", fields: ["销售大类（五级架构）", "物料销售类别", "formula"] },
              { dim: "销售小类", fields: ["销售小类（五级架构）", "销售小类（市场部）", "stock"] },
              { dim: "产品系列", fields: ["产品系列（五级架构）", "series"] },
            ],
          },
          { id: "b5_" + Date.now(), title: "条码信息", type: "fields", span: 5, fields: ["小包/袋/盒产品条码", "手抽/中袋条形码", "外包装条形码（选择组织）", "基准条码"] },
        ],
      };
      state.dpTemplates.splice(Math.max(0, state.dpTemplates.length - 1), 0, newTpl);
      state.dpEditingTplId = newId;
      saveStateDebounced();
      renderDpConfigModal();
      renderDetailPage();
      toast("已新建视窗模板：" + newTpl.name);
      break;
    }
    case "dp-tpl-dup": {
      const src = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      if (!src) break;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = "tpl_" + Date.now();
      copy.name = src.name + " (副本)";
      copy.isDefault = false;
      state.dpTemplates.push(copy);
      state.dpEditingTplId = copy.id;
      saveStateDebounced();
      renderDpConfigModal();
      toast("已复制模板：" + copy.name);
      break;
    }
    case "dp-tpl-del": {
      if (state.dpTemplates.length <= 1) { toast("至少需保留 1 个视窗模板", true); break; }
      const tid = el.dataset.tpl;
      state.dpTemplates = state.dpTemplates.filter((t) => t.id !== tid);
      if (!state.dpTemplates.some((t) => t.isDefault)) state.dpTemplates[state.dpTemplates.length - 1].isDefault = true;
      state.dpEditingTplId = state.dpTemplates[0].id;
      saveStateDebounced();
      renderDpConfigModal();
      renderDetailPage();
      toast("已删除模板");
      break;
    }
    case "dp-tpl-set-default": {
      const tid = el.dataset.tpl;
      state.dpTemplates.forEach((t) => { t.isDefault = (t.id === tid); });
      saveStateDebounced();
      renderDpConfigModal();
      renderDetailPage();
      toast("已设为默认兜底模板");
      break;
    }
    case "dp-cond-add": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      if (!tpl) break;
      tpl.conditions = tpl.conditions || [];
      tpl.conditions.push({ field: "品类二级", op: "eq", val: "非卷" });
      saveStateDebounced();
      renderDpConfigModal();
      renderDetailPage();
      break;
    }
    case "dp-cond-del": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      const idx = parseInt(el.dataset.idx, 10);
      if (tpl && tpl.conditions && idx >= 0) {
        tpl.conditions.splice(idx, 1);
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
      }
      break;
    }
    case "dp-block-add": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      if (!tpl) break;
      const btype = el.dataset.btype || "fields";
      tpl.blocks = tpl.blocks || [];
      if (btype === "dept_compare") {
        tpl.blocks.push({
          id: "blk_" + Date.now(),
          title: "跨部门相似字段横向对比（五级架构 vs MDM vs 市场部）",
          type: "dept_compare",
          span: 7,
          fields: ["brand", "ecom"],
          compareRows: [
            { dim: "品类口径", fields: ["品类（五级架构）", "品类一级", "品类二级", "cat"] },
            { dim: "品牌口径", fields: ["品牌（五级架构）", "brand", "是否OEM"] },
            { dim: "销售大类", fields: ["销售大类（五级架构）", "物料销售类别", "formula"] },
            { dim: "销售小类", fields: ["销售小类（五级架构）", "销售小类（市场部）", "stock"] },
            { dim: "产品系列", fields: ["产品系列（五级架构）", "series"] },
          ],
        });
      } else if (btype === "pack_SpecBox") {
        tpl.blocks.push({
          id: "blk_" + Date.now(),
          title: "重量、体积与中包/外包装尺寸",
          type: "pack_SpecBox",
          span: 6,
          fields: ["net", "gross", "体积", "load"],
          subBoxes: [
            { title: "中包：长 × 宽 × 高", fields: ["单提长", "单提宽", "单提高"] },
            { title: "外包装：长 × 宽 × 高", fields: ["长(外包装)", "宽(外包装)", "高(外包装)"] },
          ],
        });
      } else if (btype === "strip_table") {
        tpl.blocks.push({
          id: "blk_" + Date.now(),
          title: "横向指标条表（如卷类参数/品类层级）",
          type: "strip_table",
          span: 12,
          fields: ["节距", "卷高", "节数", "米数", "净含量", "毛重/卷"],
        });
      } else {
        tpl.blocks.push({
          id: "blk_" + Date.now(),
          title: "自定义字段区块",
          type: "fields",
          span: 6,
          fields: ["material", "vcode", "spec", "desc"],
        });
      }
      saveStateDebounced();
      renderDpConfigModal();
      renderDetailPage();
      toast("已向当前视窗插入新区块");
      break;
    }
    case "dp-blk-move": {
      const pool = el.closest(".cfg-block-list");
      const from = Number(el.dataset.bidx);
      if (pool) moveDpSortItem(pool, from, from + Number(el.dataset.dir), true);
      break;
    }
    case "dp-blk-del": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      const bi = parseInt(el.dataset.bidx, 10);
      if (tpl && tpl.blocks && bi >= 0) {
        tpl.blocks.splice(bi, 1);
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
      }
      break;
    }
    case "dp-template-field-move": {
      const pool = el.closest(".cfg-sortable-fields");
      const from = Number(el.dataset.fidx);
      if (pool) moveDpSortItem(pool, from, from + Number(el.dataset.dir), false);
      break;
    }
    case "dp-blk-field-del": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      const bi = parseInt(el.dataset.bidx, 10);
      const fi = parseInt(el.dataset.fidx, 10);
      const blk = tpl && tpl.blocks && tpl.blocks[bi];
      if (blk && blk.fields && fi >= 0) {
        blk.fields.splice(fi, 1);
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
      }
      break;
    }
    case "dp-cmp-row-add": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      const bi = parseInt(el.dataset.bidx, 10);
      const blk = tpl && tpl.blocks && tpl.blocks[bi];
      if (blk) {
        blk.compareRows = blk.compareRows || [];
        blk.compareRows.push({ dim: "对比维度" + (blk.compareRows.length + 1), fields: [] });
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
        toast("已插入横向对比行，请从下拉框选择要对比的相似字段");
      }
      break;
    }
    case "dp-cmp-row-del": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      const bi = parseInt(el.dataset.bidx, 10);
      const ri = parseInt(el.dataset.ridx, 10);
      const blk = tpl && tpl.blocks && tpl.blocks[bi];
      if (blk && blk.compareRows && ri >= 0) {
        blk.compareRows.splice(ri, 1);
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
      }
      break;
    }
    case "dp-cmp-field-del": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      const bi = parseInt(el.dataset.bidx, 10);
      const ri = parseInt(el.dataset.ridx, 10);
      const fi = parseInt(el.dataset.fidx, 10);
      const blk = tpl && tpl.blocks && tpl.blocks[bi];
      if (blk && blk.compareRows && blk.compareRows[ri] && fi >= 0) {
        blk.compareRows[ri].fields.splice(fi, 1);
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
      }
      break;
    }
    case "dp-subbox-add": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      const bi = parseInt(el.dataset.bidx, 10);
      const blk = tpl && tpl.blocks && tpl.blocks[bi];
      if (blk) {
        blk.subBoxes = blk.subBoxes || [];
        blk.subBoxes.push({ title: "尺寸规格：长 × 宽 × 高", fields: [] });
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
      }
      break;
    }
    case "dp-subbox-del": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      const bi = parseInt(el.dataset.bidx, 10);
      const si = parseInt(el.dataset.sidx, 10);
      const blk = tpl && tpl.blocks && tpl.blocks[bi];
      if (blk && blk.subBoxes && si >= 0) {
        blk.subBoxes.splice(si, 1);
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
      }
      break;
    }
    case "dp-subbox-field-del": {
      const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
      const bi = parseInt(el.dataset.bidx, 10);
      const si = parseInt(el.dataset.sidx, 10);
      const fi = parseInt(el.dataset.fidx, 10);
      const blk = tpl && tpl.blocks && tpl.blocks[bi];
      if (blk && blk.subBoxes && blk.subBoxes[si] && fi >= 0) {
        blk.subBoxes[si].fields.splice(fi, 1);
        saveStateDebounced();
        renderDpConfigModal();
        renderDetailPage();
      }
      break;
    }
    case "detail-copy": {
      const m = state.detail || "";
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m).then(() => toast("已复制：" + m), () => toast("复制失败", true));
      else { const ta = document.createElement("textarea"); ta.value = m; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("已复制：" + m); }
      break;
    }
    default: break;
  }
}
function onChange(e) {
  const el = e.target;
  if (quickDetailDraft && el.dataset.quickOption) {
    quickDetailDraft[el.dataset.quickOption] = el.dataset.quickOption === 'columns' ? Number(el.value) : el.checked; return;
  }
  if (quickDetailDraft && el.dataset.quickEnabled) {
    const section = quickDetailDraft.sections.find((s) => s.id === el.dataset.quickEnabled); if (section) section.enabled = el.checked; return;
  }
  if (quickDetailDraft && el.dataset.quickField) {
    const section = quickDetailActiveSection(), key = el.dataset.quickField;
    if (section && schemaByKey.has(key) && !MDM_HIDDEN_KEYS.has(key)) {
      section.fields = el.checked ? [...new Set([...section.fields, key])] : section.fields.filter((k) => k !== key);
      renderQuickDetailDraftFields();
    }
    return;
  }
  if (el.id === "fdSavedViewSel") {
    if (el.value) applyFieldView(el.value);
    else { state.activeFieldView = ""; state.fieldViewDraftName = null; syncSavedViewControls(); }
    return;
  }
  if (el.dataset.act === "shortcut-toggle") {
    if (!shortcutDraft) shortcutDraft = [...state.viewShortcuts];
    shortcutDraft = el.checked ? [...shortcutDraft, el.dataset.v] : shortcutDraft.filter((x) => x !== el.dataset.v);
    renderShortcutEditor(); return;
  }
  if (el.id === "pageSizeSel") { state.pageSize = parseInt(el.value, 10) || 50; state.page = 1; saveStateDebounced(); refreshAll(); return; }
  if (el.id === "analyzeFieldSel") { state.analyzeField = el.value; saveStateDebounced(); renderAnalyze(); return; }
  if (el.id === "dpTplPreviewSel") {
    state.dpOverrideTplId = el.value || "";
    syncDetailUrl(true);
    renderDetailPage();
    if (document.getElementById("dpViewSettings")) openDetailViewSettings();
    toast(state.dpOverrideTplId ? "已切换预览视窗" : "已恢复按生效条件自动匹配");
    return;
  }
  if (el.dataset && el.dataset.act === "quick-filter") {
    const key = el.dataset.key;
    if (['cats', 'brands'].includes(key) && el.value) { state.filters[key].add(el.value); refreshFilteredViews(); }
    return;
  }
  if (el.dataset && el.dataset.act === "quick-status") { state.filters.status = el.value; refreshFilteredViews(); return; }
  if (el.dataset && el.dataset.act === "field-view-select") { if (el.value) applyFieldView(el.value); return; }
  if (el.dataset && el.dataset.act === "query-view-select") { if (el.value) applyQueryView(el.value); return; }
  if (el.dataset && el.dataset.act === "select-material") {
    if (el.checked) addToBasket(el.dataset.material, false); else removeFromBasket(el.dataset.material);
    el.checked = basketSet.has(el.dataset.material); return;
  }
  if (el.id === "qFieldSel") {
    state.qField = el.value || "all";
    closeQueryOptions();
    refreshSearchResults();
    return;
  }
  if (el.dataset && el.dataset.act) {
    const act = el.dataset.act;
    if (act === "custom-filter-logic" || act === "custom-filter-group-logic") {
      const logic = el.value === "OR" ? "OR" : "AND";
      if (act === "custom-filter-group-logic") {
        const group = customFilterNode(el.dataset.idx);
        if (!group || group.type !== 'group') return;
        group.logic = logic;
      } else state.filters.customLogic = logic;
      refreshCustomFilters();
      return;
    }
    if (["custom-filter-field", "custom-filter-op", "custom-filter-value"].includes(act)) {
      const condition = customFilterNode(el.dataset.idx); if (!condition) return;
      const key = act === "custom-filter-field" ? "field" : act === "custom-filter-op" ? "op" : el.dataset.part === "valTo" ? "valTo" : "val";
      if (condition[key] !== el.value) {
        const wasDate = isDateField(condition.field);
        condition[key] = el.value;
        if (key === "field") {
          if (wasDate !== isDateField(condition.field)) { condition.val = ""; delete condition.valTo; }
          const choices = filterConditionOperators(condition.field);
          if (!choices.some((o) => o.op === condition.op)) condition.op = isDateField(condition.field) ? "gte" : "eq";
        }
        if (key === "op" && condition.op !== "between") delete condition.valTo;
        refreshCustomFilters();
      }
      return;
    }
    const tpl = state.dpTemplates.find((t) => t.id === el.dataset.tpl);
    if (act === "dp-tpl-name" && tpl) { tpl.name = el.value.trim() || "未命名模板"; saveStateDebounced(); renderDpConfigModal(); renderDetailPage(); return; }
    if (act === "dp-tpl-desc" && tpl) { tpl.desc = el.value.trim(); saveStateDebounced(); renderDpConfigModal(); return; }
    if (act === "dp-tpl-priority" && tpl) { tpl.priority = parseInt(el.value, 10) || 10; saveStateDebounced(); renderDpConfigModal(); renderDetailPage(); return; }
    if (act === "dp-tpl-logic" && tpl) { tpl.logic = el.value === "AND" ? "AND" : "OR"; saveStateDebounced(); renderDpConfigModal(); renderDetailPage(); return; }
    if (act === "dp-cond-field" && tpl) {
      const idx = parseInt(el.dataset.idx, 10);
      if (tpl.conditions && tpl.conditions[idx]) { tpl.conditions[idx].field = el.value; saveStateDebounced(); renderDpConfigModal(); renderDetailPage(); }
      return;
    }
    if (act === "dp-cond-op" && tpl) {
      const idx = parseInt(el.dataset.idx, 10);
      if (tpl.conditions && tpl.conditions[idx]) { tpl.conditions[idx].op = el.value; saveStateDebounced(); renderDpConfigModal(); renderDetailPage(); }
      return;
    }
    if (act === "dp-cond-val" && tpl) {
      const idx = parseInt(el.dataset.idx, 10);
      if (tpl.conditions && tpl.conditions[idx]) { tpl.conditions[idx].val = el.value.trim(); saveStateDebounced(); renderDpConfigModal(); renderDetailPage(); }
      return;
    }
    if (act === "dp-blk-title" && tpl) {
      const bi = parseInt(el.dataset.bidx, 10);
      if (tpl.blocks && tpl.blocks[bi]) { tpl.blocks[bi].title = el.value; saveStateDebounced(); renderDetailPage(); }
      return;
    }
    if (act === "dp-blk-type" && tpl) {
      const bi = parseInt(el.dataset.bidx, 10);
      if (tpl.blocks && tpl.blocks[bi]) { tpl.blocks[bi].type = el.value; saveStateDebounced(); renderDpConfigModal(); renderDetailPage(); }
      return;
    }
    if (act === "dp-blk-span" && tpl) {
      const bi = parseInt(el.dataset.bidx, 10);
      if (tpl.blocks && tpl.blocks[bi]) { tpl.blocks[bi].span = parseInt(el.value, 10) || 6; saveStateDebounced(); renderDpConfigModal(); renderDetailPage(); }
      return;
    }
    if (act === "dp-blk-field-add" && tpl) {
      const bi = parseInt(el.dataset.bidx, 10);
      const fk = el.value;
      el.value = "";
      if (fk && tpl.blocks && tpl.blocks[bi]) {
        tpl.blocks[bi].fields = tpl.blocks[bi].fields || [];
        tpl.blocks[bi].fields.push(fk);
        saveStateDebounced(); renderDpConfigModal(); renderDetailPage();
      }
      return;
    }
    if (act === "dp-cmp-row-dim" && tpl) {
      const bi = parseInt(el.dataset.bidx, 10);
      const ri = parseInt(el.dataset.ridx, 10);
      if (tpl.blocks && tpl.blocks[bi] && tpl.blocks[bi].compareRows && tpl.blocks[bi].compareRows[ri]) {
        tpl.blocks[bi].compareRows[ri].dim = el.value;
        saveStateDebounced(); renderDetailPage();
      }
      return;
    }
    if (act === "dp-cmp-field-add" && tpl) {
      const bi = parseInt(el.dataset.bidx, 10);
      const ri = parseInt(el.dataset.ridx, 10);
      const fk = el.value;
      el.value = "";
      if (fk && tpl.blocks && tpl.blocks[bi] && tpl.blocks[bi].compareRows && tpl.blocks[bi].compareRows[ri]) {
        tpl.blocks[bi].compareRows[ri].fields = tpl.blocks[bi].compareRows[ri].fields || [];
        tpl.blocks[bi].compareRows[ri].fields.push(fk);
        saveStateDebounced(); renderDpConfigModal(); renderDetailPage();
      }
      return;
    }
    if (act === "dp-subbox-title" && tpl) {
      const bi = parseInt(el.dataset.bidx, 10);
      const si = parseInt(el.dataset.sidx, 10);
      if (tpl.blocks && tpl.blocks[bi] && tpl.blocks[bi].subBoxes && tpl.blocks[bi].subBoxes[si]) {
        tpl.blocks[bi].subBoxes[si].title = el.value;
        saveStateDebounced(); renderDetailPage();
      }
      return;
    }
    if (act === "dp-subbox-field-add" && tpl) {
      const bi = parseInt(el.dataset.bidx, 10);
      const si = parseInt(el.dataset.sidx, 10);
      const fk = el.value;
      el.value = "";
      if (fk && tpl.blocks && tpl.blocks[bi] && tpl.blocks[bi].subBoxes && tpl.blocks[bi].subBoxes[si]) {
        tpl.blocks[bi].subBoxes[si].fields = tpl.blocks[bi].subBoxes[si].fields || [];
        tpl.blocks[bi].subBoxes[si].fields.push(fk);
        saveStateDebounced(); renderDpConfigModal(); renderDetailPage();
      }
      return;
    }
  }
  if (el.dataset && el.dataset.act === "field-toggle") {
    const k = el.dataset.v;
    if (PINNED_KEYS.includes(k)) { el.checked = true; return; }
    const vis = orderedVisibleKeys();
    if (el.checked) {
      if (!vis.includes(k)) vis.push(k);
    } else {
      const idx = vis.indexOf(k);
      if (idx >= 0) vis.splice(idx, 1);
    }
    applyVisibleListOrder(vis);
  }
}
function closeQueryOptions() {
  const options = document.getElementById("qSearchOptions");
  if (options) options.open = false;
}
function bindInputs() {
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#fieldLocator")) closeFieldLocator();
    if (!e.target.closest("#qSearchOptions")) closeQueryOptions();
    if (state.basketExpanded && !e.target.closest("#basketDock")) { state.basketExpanded = false; renderBasket(); }
  });
  document.addEventListener("focusin", (e) => {
    if (e.target.id === "fieldLocatorInput") showFieldLocator();
    else if (!e.target.closest("#fieldLocator")) closeFieldLocator();
  });
  document.addEventListener("click", (e) => { if (e.target.id === "fieldLocatorInput") showFieldLocator(); });
  document.addEventListener("input", (e) => { if (e.target.id === "fieldLocatorInput") showFieldLocator(); });
  const q = document.getElementById("qInput");
  q.value = state.q; resizeSearchInput(q);
  const applyQUpdate = () => {
    resizeSearchInput(q);
    state.q = q.value.trim();
    /* 当用户输入搜索词时，如果用户未手动固定展开筛选面板，自动收起筛选面板为单行摘要，使结果表紧贴搜索框下方，无需往下滚动即可看到结果 */
    if (state.q && !state.filterCollapsed && !state._userToggledCollapse) {
      state.filterCollapsed = true;
      state._autoCollapsedBySearch = true;
    } else if (!state.q && state._autoCollapsedBySearch && !state._userToggledCollapse) {
      state.filterCollapsed = true;
      state._autoCollapsedBySearch = false;
    }
    refreshSearchResults();
  };
  const queueQUpdate = debounce(() => { if (!q._composing) applyQUpdate(); }, 150);
  q.addEventListener("compositionstart", () => { q._composing = true; });
  q.addEventListener("compositionend", () => { q._composing = false; queueQUpdate(); });
  q.addEventListener("input", (e) => { if (!e.isComposing) queueQUpdate(); });
  document.getElementById("qSubmitBtn").addEventListener("click", () => {
    applyQUpdate();
    document.getElementById("qSearchOptions").open = false;
    q.focus({ preventScroll: true });
  });
  q.addEventListener("paste", () => {
    setTimeout(applyQUpdate, 20);
  });
  q.addEventListener("keydown", (e) => {
    /* 单行普通搜索时按 Enter 直接触发查询而不插入无意义空行；Shift+Enter 强制换行 */
    if (e.key === "Enter" && !e.isComposing && !e.shiftKey && state.qMode !== "batch" && !/[\r\n]/.test(q.value)) {
      e.preventDefault();
      applyQUpdate();
    }
  });
  /* 快捷键 '/' 或 Cmd/Ctrl+K 快速聚焦搜索框，Esc 清空或退焦 */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("quickDetailConfig")) { e.preventDefault(); closeQuickDetailConfig(); return; }
    if (e.target.id === "fieldLocatorInput" && !e.isComposing) {
      if (e.key === "Escape") { e.preventDefault(); closeFieldLocator(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const matches = matchingResultFields(e.target.value), popup = document.getElementById("fieldLocatorPopup");
        fieldLocator.active = popup.hidden ? 0 : (fieldLocator.active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % (matches.length || 1);
        showFieldLocator(false); return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const match = matchingResultFields(e.target.value)[fieldLocator.active];
        if (match) locateResultField(match.key);
        return;
      }
    }
    if (e.key === "Escape" && document.getElementById("qSearchOptions").open) { e.preventDefault(); closeQueryOptions(); return; }
    if (e.key === "Escape" && state.basketExpanded) { e.preventDefault(); state.basketExpanded = false; renderBasket(); return; }
    if (e.key === "Escape" && document.getElementById("dpViewSettings")) { e.preventDefault(); closeDetailViewSettings(); return; }
    if (e.key === "Escape") document.querySelectorAll(".dp-more[open]").forEach((d) => { d.open = false; });
    if (e.key === "Enter" && !e.isComposing && e.target.dataset.act === "custom-filter-value") {
      e.preventDefault();
      if (e.target.dataset.dateInput) {
        const c = customFilterNode(e.target.dataset.idx);
        const part = e.target.dataset.part === "valTo" ? "valTo" : "val";
        if (c && isoDate(c[part])) c[part] = isoDate(c[part]);
      }
      refreshCustomFilters();
      return;
    }
    const tag = (e.target && e.target.tagName || "").toLowerCase();
    const inInput = tag === "input" || tag === "textarea" || tag === "select";
    if (!inInput && e.key === "/") {
      e.preventDefault();
      focusSearchInput();
      q.select();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      focusSearchInput();
      q.select();
    } else if (e.target === q && e.key === "Escape" && q.value) {
      e.preventDefault();
      document.getElementById("qClearBtn").click();
    }
  });
  const sk = document.getElementById("skuInput");
  sk.addEventListener("input", debounce(() => renderSuggest(suggestSkus(sk.value)), 200));
  sk.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.querySelector('[data-act="add-sku-input"]').click(); }
  });
  document.getElementById("fileImport").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importBackup(f);
    e.target.value = "";
  });
  /* 同V码冲突专属面板内的实时搜索框（委托监听，保留输入焦点与光标位置） */
  const applyVconfQ = debounce((val) => {
    state.vconfFilter.q = val;
    saveStateDebounced();
    state.vconfFilter.page = 1;
    renderVconf();
    const inp = document.getElementById("vconfSearchInput");
    if (inp) {
      inp.focus();
      try { inp.setSelectionRange(val.length, val.length); } catch (err) { /* ignore */ }
    }
  }, 180);
  document.addEventListener("input", (e) => {
    if (e.target.id === "fdViewName") {
      state.fieldViewDraftName = e.target.value;
      document.getElementById("fdViewStatus").textContent = "未保存修改";
    }
    if (e.target && e.target.dataset.act === "custom-filter-value") {
      queueCustomFilterValue(e.target, e.isComposing);
    } else if (e.target && e.target.id === "vconfSearchInput") {
      applyVconfQ(e.target.value || "");
    } else if (e.target && e.target.id === "focusSearchInput") {
      applyFocusQ(e.target.value || "");
    } else if (e.target && e.target.id === "anaFieldSearch") {
      applyAnaFieldQ(e.target.value || "");
    }
  });
  document.addEventListener("compositionend", (e) => {
    if (e.target && e.target.dataset.act === "custom-filter-value") queueCustomFilterValue(e.target, false);
  });
  const applyFocusQ = debounce((val) => {
    state.focusFilter.q = val;
    saveStateDebounced();
    state.focusFilter.page = 1;
    renderFocus();
    const inp = document.getElementById("focusSearchInput");
    if (inp) {
      inp.focus();
      try { inp.setSelectionRange(val.length, val.length); } catch (err) { /* ignore */ }
    }
  }, 160);
  const applyAnaFieldQ = debounce((val) => {
    state.analyzeFilter.q = val;
    saveStateDebounced();
    renderAnalyze();
    const inp = document.getElementById("anaFieldSearch");
    if (inp) {
      inp.focus();
      try { inp.setSelectionRange(val.length, val.length); } catch (err) { /* ignore */ }
    }
  }, 150);
  /* 浏览器前进/后退与 hash 变化时，双向同步全屏详情看板状态 */
  const onUrlRouteChange = () => {
    const spec = parseUrlDetailSpec();
    if (spec && spec.material) {
      const r = findSku(spec.material);
      if (r) {
        state.detail = r.material;
        state.detailPage = true;
        state.dpOverrideTplId = spec.tpl && (state.dpTemplates || []).some((t) => t.id === spec.tpl) ? spec.tpl : "";
        syncDetailUrl(true);
        refreshAll();
        return;
      }
    }
    if (state.detailPage) {
      state.detailPage = false;
      state.detail = null;
      refreshAll();
    }
  };
  window.addEventListener("popstate", onUrlRouteChange);
  window.addEventListener("hashchange", onUrlRouteChange);
}

/* ---------- 统计 ---------- */
function computeStats() {
  let valid = 0, invalid = 0, blocking = 0, withIssues = 0, vconf = 0, routeCovered = 0, pdfHits = 0, pdfBlock = 0;
  const vconfVcodes = new Set();
  for (const r of rows) {
    if (r.status === "有效") valid++; else if (r.status === "无效") invalid++;
    if (r.blocking) blocking++;
    if (r.issueCount > 0) withIssues++;
    if (r.vconf) {
      vconf++;
      if (r.vcode) vconfVcodes.add(r.vcode);
    }
    if (r.route) routeCovered++;
    if (r.pdfCount > 0) pdfHits++;
    if (r.pdfBlock > 0) pdfBlock++;
  }
  STATS = {
    total: rows.length,
    valid,
    invalid,
    blocking,
    withIssues,
    vconf,
    vconfGroups: vconfVcodes.size,
    routeCovered,
    pdfHits,
    pdfBlock,
  };
}

/* ---------- 初始化 ---------- */
async function init() {
  renderStaticButtons();
  try {
    DATASET = await loadDataset();
  } catch (err) {
    document.getElementById("loading").innerHTML = '<div style="max-width:520px;text-align:center;color:var(--red);padding:20px">'
      + ic("alert-triangle", 34) + "<h3>数据加载失败</h3><p style='color:var(--muted);font-size:13px'>" + esc(err.message) + "</p></div>";
    return;
  }
  buildIndexes();
  computeStats();
  const firstOpen = await loadState();
  if (firstOpen) {
    state.basket = [];
    basketSet.clear(); state.basket.forEach((m) => basketSet.add(m));
    if (!schemaByKey.has(state.analyzeField)) state.analyzeField = "纸盒尺寸";
    if (window.innerWidth < 768) state.view = "card";
    // 首次打开不把默认值写入个人文件，等待用户实际修改。
    configSnapshot = JSON.stringify(captureUserSettings());
    configDocument = configDoc(JSON.parse(configSnapshot));
  }
  bindInputs();
  bindSearchDock();
  window.addEventListener("pagehide", saveState);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveState(); });
  bindFieldDrag();
  bindPresetViewSorting();
  bindQuickDetailConfig();
  bindDpConfigSorting();
  bindCustomDatePickers();
  bindCustomFieldPickers();
  bindColumnFilters();
  document.getElementById("toolsWorkspace").addEventListener("keydown", e => {
    if (e.key === "Escape" && !e.defaultPrevented && !e.target.matches("input, textarea, select") && !document.querySelector('.drawer.open, .page-overlay.open, #modal-mask.open, .pr-mask')) {
      e.preventDefault(); switchWorkspaceTab("results"); document.getElementById("toolsEntry").focus({ preventScroll: true });
    }
  });
  bindTableDragAndScrollGuard();
  /* 详情路径 .html/编码 为统一格式；旧 query/hash 入口在加载时替换为该路径。 */
  let deepLinkMiss = null;
  const deepSpec = parseUrlDetailSpec();
  if (deepSpec && deepSpec.material) {
    const r = findSku(deepSpec.material);
    if (r) {
      state.detail = r.material;
      state.detailPage = true;
      if (deepSpec.tpl && (state.dpTemplates || []).some((t) => t.id === deepSpec.tpl)) {
        state.dpOverrideTplId = deepSpec.tpl;
      }
      syncDetailUrl(true);
    } else {
      deepLinkMiss = deepSpec.material;
    }
  }
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  refreshAll();
  warmSourceInfo();
  document.getElementById("loading").classList.add("hide");
  if (deepLinkMiss) {
    toast("URL 指定的物料未找到：" + deepLinkMiss + "（可用物料编码或 V码）", true);
  } else if (firstOpen && !state.detailPage) {
    setTimeout(() => toast("已预置示例：对比篮 " + state.basket.length + " 个 SKU、字段分析「纸盒尺寸」，可一键清空"), 600);
  }
}
init();
