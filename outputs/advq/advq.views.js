/* ============ MDM 高级查询工作台 · 视图层（只读 state/derived，函数间互不调用） ============ */
"use strict";

let STATS = null;

/* ---------- 头部静态按钮文案 ---------- */
function renderStaticButtons() {
  var shareChip = document.getElementById("shareStatusChip");
  if (shareChip) {
    shareChip.innerHTML = '<span class="sdot" aria-hidden="true"></span>' + ic("refresh", 14) + '更新数据源';
    shareChip.title = '更新数据源 · 正在检测连接';
  }
  document.getElementById("searchBox").innerHTML =
    '<div class="search-anchor" id="qSearchAnchor"><div class="search-main" id="qSearchMain">'
    + '<select id="qFieldSel" class="search-field-sel" aria-label="搜索范围" title="选择搜索范围">'
    + SEARCH_FIELDS.map(function (sf) { return '<option value="' + esc(sf.key) + '">' + esc(sf.label) + "</option>"; }).join("")
    + '</select>'
    + '<span class="search-input-icon">' + ic("search", 21) + '</span>'
    + '<textarea id="qInput" rows="1" placeholder="输入物料编码、V码、名称或规格…" aria-label="搜索物料" aria-describedby="qSearchHint" autocomplete="off"></textarea>'
    + '<span class="search-dock-mode" id="qDockMode"></span>'
    + '<button class="search-clear-btn" id="qClearBtn" data-act="clear-q" title="清空搜索词">' + ic("x", 13) + '</button>'
    + '<button type="button" class="search-submit" id="qSubmitBtn">' + ic("search", 17) + ' 搜索</button>'
    + '</div></div>'
    + '<div class="search-tools"><span class="search-hint" id="qSearchHint">回车搜索 · 支持粘贴 Excel 编码列</span>'
    + '<details class="search-advanced" id="qSearchOptions"><summary>搜索选项 ▾</summary><div class="search-options">'
    + '<div class="search-mode-seg" id="qModeSeg">'
    + '<button data-act="q-mode" data-v="smart" class="on" title="自动识别关键词和多条编码，精准命中优先">智能搜索</button>'
    + '<button data-act="q-mode" data-v="exact" title="精准等于匹配：字段值与输入完全相等才命中">精准匹配</button>'
    + '</div>'
    + '<div id="searchFieldHints"></div></div></details></div>'
    + '<div class="search-assist" id="searchAssist"></div>';
  document.querySelector('[data-act="open-fields"]').innerHTML = ic("grid", 14) + "字段管理";
  document.querySelector('[data-act="add-sku-input"]').innerHTML = ic("plus", 14) + "加入对比";
  document.getElementById("focusTitle").innerHTML = ic("star", 15) + " 重点关注 · 数值矛盾与填报异常具象核查";
  var vconfTitle = document.getElementById("vconfTitle");
  if (vconfTitle) vconfTitle.innerHTML = ic("link", 15) + " 同V码冲突 · 规格差异分组核查";
  var vconfFltBtn = document.querySelector('[data-act="vconf-filter-all"]');
  if (vconfFltBtn) vconfFltBtn.innerHTML = ic("filter", 14) + " 在查询结果中仅看同V码冲突";
  var vconfExpBtn = document.querySelector('[data-act="export-vconf-csv"]');
  if (vconfExpBtn) vconfExpBtn.innerHTML = ic("download", 14) + " 导出同V码冲突核查 CSV";
  document.getElementById("resultsTitle").innerHTML = ic("table", 15) + " 查询结果";
  document.getElementById("analyzeTitle").innerHTML = ic("bar-chart", 15) + " 字段分析（按业务适用域精准诊断）";
  document.getElementById("rulesTitle").innerHTML = ic("file-text", 15) + " 口径与规则";
  document.getElementById("processCheckTitle").innerHTML = ic("clipboard", 15) + " 工艺属性检查";
  document.querySelector('[data-act="process-rules-config"]').innerHTML = ic("sliders", 14) + " 规则配置";
  document.querySelector('[data-act="export-process-checks-csv"]').innerHTML = ic("download", 14) + " 导出检查明细 CSV";
  var mpsTitle = document.getElementById("mpsTitle");
  if (mpsTitle) mpsTitle.innerHTML = ic("route", 15) + " MPS 工艺路线专项";
  var mpsExp = document.querySelector('[data-act="export-mps-csv"]');
  if (mpsExp) mpsExp.innerHTML = ic("download", 14) + " 导出当前 MPS 结果 CSV";
  document.querySelector('[data-act="export-csv"]').innerHTML = ic("download", 14) + " 导出当前结果 CSV";
  document.querySelector('[data-act="export-analysis"]').innerHTML = ic("download", 14) + " 导出字段分析 CSV";
  document.querySelector('[data-act="focus-all"]').innerHTML = ic("filter", 13) + " 在查询结果中锁定这些 SKU";
  var focusExpBtn = document.querySelector('[data-act="export-focus-csv"]');
  if (focusExpBtn) focusExpBtn.innerHTML = ic("download", 13) + " 导出重点核查清单 CSV";
  document.querySelector('#detailPage .back').innerHTML = ic("chevron-left", 14) + " 返回工作台";
  var cfgBack = document.querySelector('#dpConfigModal .back');
  if (cfgBack) cfgBack.innerHTML = ic("chevron-left", 14) + " 返回单品看板";
  const toolsEntry = document.getElementById("toolsEntry");
  if (toolsEntry) toolsEntry.innerHTML = ic("grid", 14) + " 工具与分析 " + ic("chevron-right", 13);
  var tabDefs = [
    ["results", "table", "查询结果", "tabCntResults"],
    ["focus", "star", "重点关注", "tabCntFocus"],
    ["vconf", "link", "同V码冲突", "tabCntVconf"],
    ["process", "clipboard", "工艺属性检查", "tabCntProcess"],
    ["analyze", "bar-chart", "字段分析", "tabCntAnalyze"],
    ["rules", "file-text", "口径与规则", ""],
    ["mps", "route", 'MPS 工艺路线 <span class="special-label">专项</span>', "tabCntMps"],
  ];
  Array.prototype.forEach.call(document.querySelectorAll('#tabBar button[data-act="tab"], #toolsNav button[data-act="tab"]'), function (b) {
    var v = b.getAttribute("data-v");
    for (var i = 0; i < tabDefs.length; i++) {
      if (tabDefs[i][0] === v) {
        b.innerHTML = ic(tabDefs[i][1], 14) + " " + tabDefs[i][2] + (tabDefs[i][3] ? ' <span class="cnt" id="' + tabDefs[i][3] + '"></span>' : "");
        break;
      }
    }
  });
}

/* 数据来源与检查依据收在数据源详情内，计数由筛选区与对应页签展示。 */
function renderSourceLineage() {
  const m = DATASET.meta;
  const items = [
    ["当前源表", m.source], ["读取方式", m.sourceMode || "本地文件"],
    ["报表时间", m.sourceStamp], ["物料总数", STATS.total.toLocaleString()],
    ["路线来源", m.routeSource || "每次基于新 MDM 实时重算"], ["路线重算时间", m.routeStamp],
    ["工艺检查依据", m.pdfSpec], ["近2年创建起点", m.createdCutoff],
  ];
  return '<details class="source-lineage"><summary>' + ic("database", 13) + ' 数据来源与检查依据</summary><dl>'
    + items.map(([label, value]) => '<dt>' + label + '</dt><dd>' + esc(value == null || value === "" ? "—" : value) + '</dd>').join("")
    + '</dl></details>';
}

/* ---------- 标签页 ---------- */
function renderTabs() {
  var cntR = document.getElementById("tabCntResults");
  var cntF = document.getElementById("tabCntFocus");
  var cntV = document.getElementById("tabCntVconf");
  var cntA = document.getElementById("tabCntAnalyze");
  var cntM = document.getElementById("tabCntMps");
  var cntP = document.getElementById("tabCntProcess");
  if (cntP) cntP.textContent = (derived.filtered || []).filter((r) => r.pdfCount > 0).length.toLocaleString();
  if (cntR) cntR.textContent = derived.total.toLocaleString();
  if (cntF) cntF.textContent = (derived.stats ? derived.stats.blocking : STATS.blocking).toLocaleString();
  if (cntV) {
    var vg = derived.stats ? derived.stats.vconfGroups : (STATS.vconfGroups || 0);
    var vs = derived.stats ? derived.stats.vconf : (STATS.vconf || 0);
    cntV.textContent = vg.toLocaleString() + "组/" + vs.toLocaleString();
  }
  if (cntA) {
    var famFilter = state.analyzeFilter && state.analyzeFilter.family;
    var anaCnt = famFilter ? (derived.filtered || []).filter(function (r) { return typeof getRowFamily === "function" ? getRowFamily(r) === famFilter : true; }).length : derived.total;
    cntA.textContent = anaCnt.toLocaleString() + "条";
  }
  if (cntM) {
    var mpsRows = (derived.filtered || []).filter(function (r) { return r.route && (r.routeStatus !== "完整" || routeIssueMap.has(r.material)); });
    cntM.textContent = mpsRows.length.toLocaleString() + " 待关注";
  }
  Array.prototype.forEach.call(document.querySelectorAll('#tabBar button[data-act="tab"], #toolsNav button[data-act="tab"]'), function (b) {
    b.classList.toggle("on", b.getAttribute("data-v") === state.tab);
    b.setAttribute("aria-pressed", b.getAttribute("data-v") === state.tab ? "true" : "false");
  });
  const toolOpen = state.tab !== "results";
  if (toolOpen) state.lastToolTab = state.tab;
  const workspace = document.getElementById("toolsWorkspace"), entry = document.getElementById("toolsEntry");
  if (workspace) workspace.hidden = !toolOpen;
  if (entry) { entry.classList.toggle("on", toolOpen); entry.setAttribute("aria-expanded", String(toolOpen)); }
  Array.prototype.forEach.call(document.querySelectorAll(".tabpanel"), function (p) {
    p.classList.toggle("on", p.id === "panel-" + state.tab);
  });
}

/* ---------- 重点关注（范围 = 当前筛选；全宽具象化核查工作台，展示每条 SKU「为什么需要关注」的具体数值公式与对比） ---------- */
function blockingReasons(r) {
  return r._flags.filter((fl) => BLOCKING_TYPES.includes(fl.split(":")[0])).map((fl) => fl.split(":")[0]);
}

const FOCUS_REASON_GROUPS = [
  {
    id: "weight_invert",
    title: "重量物理逻辑倒挂",
    icon: "scale",
    sev: "high",
    desc: "小卷/包净重 ≥ 毛重、不含赠品净重 > 净重、不含液净重 ≥ 净重等违反物理常识的数值倒挂",
    example: "例：小卷/包净重(130g) ≥ 小卷/包毛重(125g)",
  },
  {
    id: "pack_pair",
    title: "包装单位与数量未成对",
    icon: "package",
    sev: "high",
    desc: "包装规格单位 1~4 与包装规格数量 1~4 只填了其中一个，或数量填了 ≤0，导致包装层级断裂",
    example: "例：包装规格单位1=包，但包装规格数量1为空",
  },
  {
    id: "roll_name_conflict",
    title: "卷类名称与净含量/节米数冲突",
    icon: "clipboard",
    sev: "high",
    desc: "物料说明注明了克重/节数/米数，但对应「净含量 / 节数 / 米数」填了非数字文本或 ≤0",
    example: "例：名称含「180g」但净含量填了「无」或非数字",
  },
  {
    id: "num_nonpos",
    title: "关键基础数值 ≤ 0 错值",
    icon: "hash",
    sev: "high",
    desc: "净重、不含赠品净重、毛重、成品定量、层数、原始装数等核心字段出现 0 或负数",
    example: "例：毛重(kg) = 0 或 不含赠品净重(kg) ≤ 0",
  },
  {
    id: "box_dim",
    title: "面巾盒巾尺寸无法解析",
    icon: "ruler",
    sev: "mid",
    desc: "面巾维护了非空/非“无”的纸盒尺寸，但无法解析出「长×宽×高」三段数值，盒巾长宽无法取值",
    example: "例：纸盒尺寸填了异常字符，无法拆出长×宽×高",
  },
];

function buildConcreteFocusEvidences(r) {
  const evs = [];
  const fv = (v, unit) => (v === null || v === undefined || v === "" ? "未填(空)" : fmt(v) + (unit || ""));
  for (const fl of (r._flags || [])) {
    const p = fl.split(":");
    const code = p[0];
    if (!BLOCKING_TYPES.includes(code)) continue;
    const sub = p.length >= 3 ? p.slice(2).join(":") : (p[1] || "");
    const ruleNo = p.length >= 3 ? p[1] : "";

    /* 1. 工艺属性逻辑矛盾 PFC */
    if (code === "PFC") {
      if (sub.indexOf("小卷/包净重≥小卷/包毛重") >= 0) {
        evs.push({
          group: "weight_invert",
          subKey: "小卷/包净重 ≥ 小卷/包毛重",
          sev: "high",
          gov: "numeric",
          title: "小卷/包净重 ≥ 小卷/包毛重（单包净重不可能大于等于连膜毛重）",
          proof: "小卷/包净重(g) = " + fv(r.rollNet, "g") + "  ≥  小卷/包毛重(g) = " + fv(r.rollGross, "g"),
          impact: "违反物理重量关系（规则10），需核对单卷/单包净重与带包膜毛重是否填反或单位错误",
        });
      } else if (sub.indexOf("不含赠品净重>净重") >= 0) {
        evs.push({
          group: "weight_invert",
          subKey: "不含赠品净重 > 净重",
          sev: "high",
          gov: "numeric",
          title: "不含赠品净重 > 含赠品总净重（局部重量大于整体）",
          proof: "不含赠品净重 = " + fv(r.netNG, "kg") + "  >  净重 = " + fv(r.net, "kg") + "（毛重 = " + fv(r.gross, "kg") + "）",
          impact: "违反重量三件套递增关系（规则2：不含赠品净重 ≤ 净重 < 毛重）",
        });
      } else if (sub.indexOf("净重≥毛重") >= 0) {
        evs.push({
          group: "weight_invert",
          subKey: "整箱净重 ≥ 整箱毛重",
          sev: "high",
          gov: "numeric",
          title: "整箱净重 ≥ 整箱毛重（未计入外箱/包材重量或净毛重填反）",
          proof: "净重(kg) = " + fv(r.net, "kg") + "  ≥  毛重(kg) = " + fv(r.gross, "kg") + "（不含赠品净重 = " + fv(r.netNG, "kg") + "）",
          impact: "导致物流算重与装箱核算失真（规则2：净重必须严格小于毛重）",
        });
      } else if (sub.indexOf("不含液成品净重≥不含赠品净重") >= 0 || sub.indexOf("不含液成品净重≥净重") >= 0) {
        evs.push({
          group: "weight_invert",
          subKey: "湿巾不含液净重 ≥ 含液净重",
          sev: "high",
          gov: "numeric",
          title: "湿巾不含液干基净重 ≥ 含液成品净重（干巾重不可能大于等于加液后湿重）",
          proof: "不含液成品净重 = " + fv(r.wetNet, "kg") + "  ≥  不含赠品净重 = " + fv(r.netNG, "kg") + " / 净重 = " + fv(r.net, "kg"),
          impact: "违反湿巾加液倍率物理逻辑（规则4）",
        });
      } else if (sub.indexOf("≤0") >= 0) {
        const fldName = sub.replace("≤0", "");
        const fk = (DATASET.flagFieldToKey || {})[fldName] || fldName;
        evs.push({
          group: "num_nonpos",
          subKey: sub,
          sev: "high",
          gov: "numeric",
          title: fldName + " 填了 ≤ 0 的无效数值",
          proof: fldName + " 当前值 = " + fv(r[fk]) + "（要求 > 0）",
          impact: "关键重量参数不能为 0 或负数（规则" + (ruleNo || "2") + "）",
        });
      } else {
        evs.push({
          group: "weight_invert",
          subKey: sub || "工艺逻辑矛盾",
          sev: "high",
          gov: "numeric",
          title: "工艺属性逻辑矛盾：" + (sub || fl),
          proof: "净重=" + fv(r.net, "kg") + " · 不含赠品净重=" + fv(r.netNG, "kg") + " · 毛重=" + fv(r.gross, "kg"),
          impact: "需核对工艺属性对应字段数值关系",
        });
      }
    }
    /* 2. 包装规格单位与数量未成对 PAIR */
    else if (code === "PAIR") {
      const m = sub.match(/([1-4])$/);
      const lv = m ? m[1] : "";
      const uKey = lv ? "包装规格单位" + lv : sub;
      const qKey = lv ? "包装规格数量" + lv : "";
      const uVal = r[uKey];
      const qVal = qKey ? r[qKey] : "";
      const why = (uVal && (!qVal && qVal !== 0))
        ? ("维护了「" + uKey + " = " + fmt(uVal) + "」，但「" + qKey + "」为空")
        : ((!uVal && (qVal !== null && qVal !== undefined && qVal !== ""))
          ? ("维护了「" + qKey + " = " + fmt(qVal) + "」，但「" + uKey + "」为空")
          : ("「" + uKey + "」与「" + qKey + "」未成对或数量 ≤ 0"));
      evs.push({
        group: "pack_pair",
        subKey: "第" + (lv || "?") + "层包装单位/数量未成对",
        sev: "high",
        gov: "numeric",
        title: "第 " + (lv || "?") + " 层包装规格「单位」与「数量」未成对维护",
        proof: uKey + " = " + fv(uVal) + "  ⇄  " + (qKey || "对应数量") + " = " + fv(qVal) + "  ｜ 当前组装串：" + (r.pack || "—"),
        impact: why + " → 下游无法推算每层包装含量与装箱结构",
      });
    }
    /* 3. 工艺属性数值/格式异常 PFN（如规则6 卷类名称与净含量/节数/米数不匹配） */
    else if (code === "PFN") {
      const fk = (DATASET.flagFieldToKey || {})[sub] || sub;
      const curVal = r[fk];
      evs.push({
        group: "roll_name_conflict",
        subKey: "卷类名称与「" + (sub || "净含量") + "」填值冲突",
        sev: "high",
        gov: "numeric",
        title: "卷类物料说明含规格描述，但「" + (sub || "净含量") + "」填了非数字或无效值",
        proof: "物料说明：「" + (r.desc || "—") + "」  ⇄  " + (sub || "字段") + " = 「" + fv(curVal) + "」（节数=" + fv(r["节数"]) + " · 米数=" + fv(r["米数"]) + "）",
        impact: "规则" + (ruleNo || "6") + "：卷类标准品名称标称克重/节数/米数时，对应字段必须维护大于 0 的纯数值",
      });
    }
    /* 4. 明显错值 NUM */
    else if (code === "NUM") {
      const fk = (DATASET.flagFieldToKey || {})[sub] || sub;
      evs.push({
        group: "num_nonpos",
        subKey: sub + " ≤ 0",
        sev: "high",
        gov: "numeric",
        title: "基础数值字段「" + sub + "」出现 ≤ 0 错值",
        proof: sub + " 当前值 = " + fv(r[fk]) + "（要求必须 > 0）",
        impact: "基础规格参数为 0 或负数，影响主数据核算",
      });
    }
    /* 5. 盒巾尺寸匹配异常 BOX */
    else if (code === "BOX") {
      evs.push({
        group: "box_dim",
        subKey: "面巾纸盒尺寸无法解析",
        sev: "mid",
        gov: "adjudication",
        title: "面巾维护了纸盒尺寸，但格式无法解析为「长×宽×高」",
        proof: "纸盒尺寸 = 「" + fv(r["纸盒尺寸"]) + "」  ｜ 小包长×宽×高 = " + fv(r["小包长度"]) + " × " + fv(r["小包宽度"]) + " × " + fv(r["单包高度"]),
        impact: "系统无法自动判定该面巾按盒巾纸盒取长宽还是按软抽小包取长宽",
      });
    }
  }
  return evs;
}

function renderFocus() {
  const s = derived.stats || { blocking: 0 };
  const scopedRows = derived.filtered || [];
  const ff = state.focusFilter || { group: "", reason: "", q: "", sort: "severity", page: 1, pageSize: 40 };

  /* 为当前筛选范围内的所有重点关注 SKU 生成具象化证据 */
  const focusRecords = [];
  const groupCounts = {};
  const subReasonCounts = {};
  FOCUS_REASON_GROUPS.forEach((g) => { groupCounts[g.id] = 0; });

  for (const r of scopedRows) {
    if (!r.blocking) continue;
    const evs = buildConcreteFocusEvidences(r);
    if (!evs.length) continue;
    const hitGroups = new Set(evs.map((e) => e.group));
    hitGroups.forEach((gid) => { groupCounts[gid] = (groupCounts[gid] || 0) + 1; });
    const hitSubs = new Set(evs.map((e) => e.subKey));
    hitSubs.forEach((sk) => { subReasonCounts[sk] = (subReasonCounts[sk] || 0) + 1; });
    focusRecords.push({ row: r, evs, hitGroups, hitSubs });
  }

  const subEl = document.getElementById("focusSub");
  if (subEl) {
    subEl.innerHTML = "当前筛选范围内共 <b>" + focusRecords.length.toLocaleString() + "</b> 个需重点核查的 SKU（已将原笼统的“阻断”拆解为具体矛盾公式与数值对比；全局含无效物料共 " + STATS.blocking.toLocaleString() + " 个）";
  }

  const body = document.getElementById("focusBody");
  if (!body) return;

  const linkBar = renderScopeLinkageBar("重点关注核查", "命中重点核查 <b>" + focusRecords.length.toLocaleString() + "</b> 个 SKU");

  if (!focusRecords.length) {
    body.innerHTML = linkBar + '<div class="empty">' + ic("check-circle", 32) + '<div style="font-size:14px;font-weight:700;color:var(--green);margin-top:4px">当前筛选范围内没有需要重点核查的矛盾或错值 SKU</div><div style="font-size:12px;color:var(--subtle);margin-top:4px">所有物料在重量关系、包装单位数量成对、卷类净含量与基础数值上均无硬性冲突</div></div>';
    return;
  }

  /* 1. 顶部：上方筛选联动状态条 + 为什么需要关注 —— 5 大具象原因分类卡片 */
  let h = linkBar + '<div class="focus-reason-grid">'
    + '<div class="focus-rcard sev-high' + (!ff.group ? " on" : "") + '" data-act="focus-group" data-v="">'
    + '<div class="rc-top"><span>' + ic("star", 13) + ' 全部需重点核查 SKU</span><span class="tag red">总计</span></div>'
    + '<div class="rc-num" style="color:var(--red)">' + focusRecords.length.toLocaleString() + ' <small style="font-size:12px;font-weight:500;color:var(--muted)">个物料</small></div>'
    + '<div class="rc-desc">存在物理重量倒挂、包装单位数量未成对、名称与数值冲突或 ≤0 错值，影响排产与核算</div>'
    + '<div class="rc-ex">点击右侧各专项卡片可按具体原因聚焦核查</div>'
    + '</div>';

  for (const g of FOCUS_REASON_GROUPS) {
    const cnt = groupCounts[g.id] || 0;
    if (cnt === 0 && ff.group !== g.id) continue;
    const on = ff.group === g.id;
    h += '<div class="focus-rcard sev-' + g.sev + (on ? " on" : "") + '" data-act="focus-group" data-v="' + esc(g.id) + '">'
      + '<div class="rc-top"><span>' + ic(g.icon, 13) + " " + esc(g.title) + '</span><span class="tag ' + (g.sev === "high" ? "red" : "orange") + '">' + (on ? "当前选中" : "点击筛选") + "</span></div>"
      + '<div class="rc-num" style="color:' + (g.sev === "high" ? "var(--red)" : "var(--orange)") + '">' + cnt.toLocaleString() + ' <small style="font-size:12px;font-weight:500;color:var(--muted)">个物料</small></div>'
      + '<div class="rc-desc">' + esc(g.desc) + "</div>"
      + '<div class="rc-ex">' + esc(g.example) + "</div>"
      + "</div>";
  }
  h += "</div>";

  /* 2. 二级细分原因胶囊 + 搜索 + 排序工具条 */
  const subList = Object.entries(subReasonCounts).sort((a, b) => b[1] - a[1]);
  h += '<div class="focus-subchips">'
    + '<span style="font-weight:750;color:var(--blue-deep)">' + ic("filter", 12) + " 细分判定原因直达：</span>"
    + '<button class="fchip sm' + (!ff.reason ? " on" : "") + '" data-act="focus-reason" data-v="">全部细分原因 (' + focusRecords.length.toLocaleString() + ')</button>'
    + subList.map(([sk, n]) => '<button class="fchip sm' + (ff.reason === sk ? " on warn" : "") + '" data-act="focus-reason" data-v="' + esc(sk) + '">' + esc(sk) + " <b>" + n.toLocaleString() + "</b></button>").join("")
    + '<div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    + '<input type="text" id="focusSearchInput" class="vconf-search" style="min-width:210px;padding:4px 9px;font-size:12px" placeholder="在重点关注内搜编码/V码/品名/原因…" value="' + esc(ff.q || "") + '">'
    + (ff.q || ff.group || ff.reason ? '<button class="fchip sm" data-act="focus-reset">' + ic("x", 10) + " 重置本页筛选</button>" : "")
    + "</div></div>";

  /* 3. 过滤与排序 */
  const q = (ff.q || "").trim().toLowerCase();
  const filtered = focusRecords.filter((item) => {
    if (ff.group && !item.hitGroups.has(ff.group)) return false;
    if (ff.reason && !item.hitSubs.has(ff.reason)) return false;
    if (q) {
      const r = item.row;
      const inBasic = String(r.material || "").toLowerCase().includes(q)
        || String(r.vcode || "").toLowerCase().includes(q)
        || String(r.desc || "").toLowerCase().includes(q)
        || String(r.cat || "").toLowerCase().includes(q)
        || String(r.brand || "").toLowerCase().includes(q);
      const inEv = item.evs.some((e) => e.title.toLowerCase().includes(q) || e.proof.toLowerCase().includes(q));
      if (!inBasic && !inEv) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (b.evs.length !== a.evs.length) return b.evs.length - a.evs.length;
    return (b.row.issueCount || 0) - (a.row.issueCount || 0);
  });

  const pageSize = ff.pageSize || 40;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pg = Math.min(Math.max(1, ff.page || 1), pages);
  const pageItems = filtered.slice((pg - 1) * pageSize, pg * pageSize);

  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:12.5px;color:var(--muted);flex-wrap:wrap;gap:8px">'
    + '<span>当前命中 <b>' + filtered.length.toLocaleString() + "</b> 个需核查 SKU · 每张卡片直接展示<b>具体字段冲突数值与原因</b> · 第 " + pg + " / " + pages + " 页</span>"
    + '<div style="display:flex;gap:6px;align-items:center">'
    + '<button class="mini-btn" data-act="focus-page" data-v="' + (pg - 1) + '"' + (pg <= 1 ? " disabled" : "") + ">" + ic("chevron-left", 12) + " 上一页</button>"
    + '<span style="font-size:12px;padding:0 6px">' + pg + " / " + pages + "</span>"
    + '<button class="mini-btn" data-act="focus-page" data-v="' + (pg + 1) + '"' + (pg >= pages ? " disabled" : "") + ">下一页 " + ic("chevron-right", 12) + "</button>"
    + "</div></div>";

  /* 4. 全宽双列具象化证据卡片网格（替代旧版 265px 横向单行滚动窄条） */
  h += '<div class="focus-item-grid">' + pageItems.map((item) => {
    const r = item.row;
    const evs = item.evs;
    const isMidOnly = evs.every((e) => e.sev !== "high");
    return '<div class="focus-item' + (isMidOnly ? " sev-mid" : "") + '">'
      + '<div class="fi-hd">'
      + '<div style="min-width:0;flex:1">'
      + '<div class="fi-code">'
      + '<a href="' + esc(buildDetailDeepLinkUrl(r.material)) + '" style="color:var(--blue-deep);text-decoration:none;border-bottom:1px dashed #9ec5fa" data-act="open-detail-page" data-material="' + esc(r.material) + '">' + esc(r.material) + "</a>"
      + (r.vcode ? '<span class="tag blue" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">V码 ' + esc(r.vcode) + "</span>" : "")
      + '<span class="tag">' + esc(r.cat || "未分品类") + "</span>"
      + (r.brand ? '<span class="tag">' + esc(r.brand) + "</span>" : "")
      + (r.spec ? '<span class="tag" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">规格 ' + esc(r.spec) + "</span>" : "")
      + (r.status !== "有效" ? '<span class="tag red">' + esc(r.status) + "</span>" : "")
      + "</div>"
      + '<div class="fi-desc">' + esc(r.desc || "—") + "</div>"
      + "</div>"
      + '<div style="display:flex;gap:5px;flex:none">'
      + '<button class="mini-btn" style="padding:4px 8px;min-height:28px" data-act="open-detail-page" data-material="' + esc(r.material) + '" title="打开全屏详情看板">' + ic("maximize", 12) + " 全屏看板</button>"
      + '<button class="mini-btn" style="padding:4px 8px;min-height:28px" data-act="view-detail" data-material="' + esc(r.material) + '" title="右侧抽屉速览">' + ic("eye", 12) + " 速览</button>"
      + '<button class="mini-btn primary" style="padding:4px 8px;min-height:28px" data-act="add-sku" data-material="' + esc(r.material) + '" title="加入对比篮">' + ic("plus", 12) + "</button>"
      + "</div></div>"
      + '<div class="fi-evlist">'
      + evs.map((ev, idx) => {
          const govName = (GOV_META[ev.gov] || {}).name || "数值修正";
          const govCol = GOV_COLOR[ev.gov] || "red";
          return '<div class="focus-ev-row">'
            + '<div class="ev-title">'
            + '<span class="tag ' + (ev.sev === "high" ? "red" : "orange") + '" style="padding:1px 6px;font-size:10.5px">原因 ' + (idx + 1) + '</span>'
            + '<span>' + esc(ev.title) + '</span>'
            + '<span class="tag ' + govCol + '" style="margin-left:auto;font-size:10.5px;padding:1px 6px">归口：' + esc(govName) + '</span>'
            + '</div>'
            + '<div class="ev-proof">' + ic("calc", 11) + ' 实测填值对比：<b>' + esc(ev.proof) + '</b></div>'
            + '<div class="ev-impact">↳ 业务影响：' + esc(ev.impact) + '</div>'
            + '</div>';
        }).join("")
      + "</div></div>";
  }).join("") + "</div>";

  if (pages > 1) {
    h += '<div class="pager" style="margin-top:14px;border-top:1px dashed var(--line);padding:10px 0 0">'
      + '<button data-act="focus-page" data-v="' + (pg - 1) + '"' + (pg <= 1 ? " disabled" : "") + ">" + ic("chevron-left", 13) + " 上一页</button>"
      + '<span style="padding:0 10px">第 <b>' + pg + "</b> / " + pages + " 页（共 " + filtered.length.toLocaleString() + " 个需核查 SKU）</span>"
      + '<button data-act="focus-page" data-v="' + (pg + 1) + '"' + (pg >= pages ? " disabled" : "") + ">下一页 " + ic("chevron-right", 13) + "</button>"
      + "</div>";
  }

  body.innerHTML = h;
}

/* ---------- 搜索辅助与精准直达胶囊 ---------- */
function renderSearchAssist() {
  const dockMode = document.getElementById("qDockMode");
  if (dockMode) {
    const spec = state._qSpec || {};
    dockMode.textContent = spec.mode === "batch" ? "批量 " + (spec.tokens || []).length : state.qMode === "exact" ? "精准" : "";
  }
  const modeSeg = document.getElementById("qModeSeg");
  if (modeSeg) {
    modeSeg.querySelectorAll('button[data-act="q-mode"]').forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-v") === state.qMode);
    });
  }
  const fldSel = document.getElementById("qFieldSel");
  if (fldSel && fldSel.value !== state.qField) fldSel.value = state.qField;
  const clrBtn = document.getElementById("qClearBtn");
  if (clrBtn) clrBtn.classList.toggle("show", !!state.q);
  document.getElementById("qSearchHint").textContent = (state._qSpec || {}).mode === "batch"
    ? "智能搜索已识别多条编码 · 在结果上方查看匹配明细" : "输入关键词或粘贴多条物料编码、V码，智能搜索自动识别 · 回车搜索";

  const assist = document.getElementById("searchAssist");
  if (!assist) return;
  if (!state.q) {
    const hints = document.getElementById('searchFieldHints'); if (hints) hints.innerHTML = '';
    if (state.qMode === "smart" && state.qField === "all") { assist.innerHTML = ""; return; }
  }
  const hints = derived.exactHints || [];
  const exactHits = hints.filter((h) => h.kind === "exact");
  const fieldHits = hints.filter((h) => h.kind === "field");
  let h = "";
  const qSpec = state._qSpec || {};
  const isCustomMode = state.qMode !== "smart" || state.qField !== "all";
  if (isCustomMode) {
    const fLabel = (SEARCH_FIELDS.find((x) => x.key === state.qField) || {}).label || state.qField;
    const effM = qSpec.mode || state.qMode;
    const mLabel = effM === "exact" ? "精准等于" : (effM === "batch" ? ("多码精确批查 · 共 " + (qSpec.tokens ? qSpec.tokens.length : 0) + " 个码" + (qSpec.hasNewline ? "（Excel多行粘贴）" : "")) : "模糊包含");
    h += '<span class="exact-pill active" data-act="q-reset-mode" title="点击切回全字段智能模糊">'
      + ic("check-circle", 11) + " 当前锁定：" + esc(fLabel) + " · " + esc(mLabel) + " ✕</span>";
  }
  if (exactHits.length) {
    h += '<span style="color:var(--blue-deep);font-weight:700">' + ic("star", 11) + " 精准匹配直达：</span>"
      + exactHits.map((it) => {
          const on = state.qMode === "exact" && state.qField === it.field;
          return '<button class="exact-pill' + (on ? " active" : "") + '" data-act="q-quick-lock" data-field="' + esc(it.field) + '" data-mode="exact" title="点击仅看「' + esc(it.label) + ' = ' + esc(it.val) + '」的精准命中结果">'
            + esc(it.label) + " = <b>" + esc(it.val) + "</b> (" + it.count.toLocaleString() + "条)</button>";
        }).join("");
  }
  const fieldHints = document.getElementById('searchFieldHints');
  if (fieldHints) fieldHints.innerHTML = fieldHits.length ? '<span style="color:var(--muted);font-size:11px">按匹配字段缩小范围：</span>' + fieldHits.map((it) => '<button class="exact-pill" data-act="q-quick-lock" data-field="' + esc(it.field) + '" data-mode="smart">仅搜' + esc(it.label) + ' (' + it.count.toLocaleString() + '条)</button>').join('') : '';
  assist.innerHTML = h;
}

/* ---------- 筛选区（5维分类顺序：制造类别-配方大类-品类三级-库存小类-品牌 + 更多展开不残留 + 紧凑折叠） ---------- */
function catCounts() {
  const c = new Map();
  for (const r of rows) c.set(r.cat, (c.get(r.cat) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}
function countBy(list, keyFn) {
  const c = new Map();
  for (const r of list) {
    const k = keyFn(r);
    c.set(k, (c.get(k) || 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}
function chip(on, label, act, extra, cls) {
  return '<button class="fchip' + (on ? " on" : "") + (cls ? " " + cls : "") + '" data-act="' + act + '" ' + (extra || "") + ">" + label + "</button>";
}

/* 生成上方「分类与状态筛选」当前激活的条件胶囊列表（供筛选折叠条与下方各展示面板实时联动共用） */
function buildActiveFilterLinkageTags(sizeCls, includeSearch = true, includeStatus = true) {
  const f = state.filters;
  const cls = sizeCls || "sm";
  const tags = [];
  if (state.q && includeSearch) {
    tags.push(chip(true, "搜索:“" + esc(String(state.q).slice(0, 18)) + (String(state.q).length > 18 ? "…" : "") + "” ✕", "clear-q", "", cls));
  }
  if (f.status && includeStatus) tags.push(chip(true, "状态:" + esc(f.status) + " ✕", "filter-status", 'data-v="' + esc(f.status) + '"', cls));
  if (f.pre) tags.push(chip(true, "预失效:" + esc(f.pre) + " ✕", "filter-pre", 'data-v="' + esc(f.pre) + '"', cls));
  if (f.scope) tags.push(chip(true, "范围:" + (f.scope === "created2y" ? "近2年创建" : "路线覆盖") + " ✕", "filter-scope", 'data-v="' + esc(f.scope) + '"', cls));
  f.mfg.forEach((v) => tags.push(chip(true, "制造类别:" + esc(v) + " ✕", "filter-mfg", 'data-v="' + esc(v) + '"', cls)));
  f.formula.forEach((v) => tags.push(chip(true, "配方大类:" + esc(v) + " ✕", "filter-formula", 'data-v="' + esc(v) + '"', cls)));
  f.cats.forEach((v) => tags.push(chip(true, "品类三级:" + esc(v) + " ✕", "filter-cat", 'data-v="' + esc(v) + '"', cls)));
  f.stocks.forEach((v) => tags.push(chip(true, "库存小类:" + esc(v) + " ✕", "filter-stock", 'data-v="' + esc(v) + '"', cls)));
  f.brands.forEach((v) => tags.push(chip(true, "品牌:" + esc(v) + " ✕", "filter-brand", 'data-v="' + esc(v) + '"', cls)));
  if (f.onlyBlock) tags.push(chip(true, "仅看重点核查(矛盾/错值) ✕", "toggle-only", 'data-v="onlyBlock"', cls + " warn"));
  if (f.onlyIssue) tags.push(chip(true, "仅看有异常 ✕", "toggle-only", 'data-v="onlyIssue"', cls));
  if (f.onlyVconf) tags.push(chip(true, "同V码冲突 ✕", "toggle-only", 'data-v="onlyVconf"', cls + " warn"));
  if (f.onlyPdf) tags.push(chip(true, "工艺属性检查 ✕", "toggle-only", 'data-v="onlyPdf"', cls));
  if (f.onlyBasket) tags.push(chip(true, "仅看对比篮 ✕", "toggle-only", 'data-v="onlyBasket"', cls));
  if (f.onlyPdfRule) tags.push(chip(true, "规则" + esc(f.onlyPdfRule) + " ✕", "pdf-rule-filter", 'data-v="' + esc(f.onlyPdfRule) + '"', cls + " warn"));
  if (f.onlyFieldIssue) tags.push(chip(true, "字段异常:" + esc(f.onlyFieldIssue) + " ✕", "clear-field-issue", "", cls + " warn"));
  for (const [key, values] of Object.entries(f.columnFilters || {})) {
    const label = schemaByKey.get(key)?.label || key;
    tags.push(chip(true, "列·" + esc(label) + ":" + esc(values.length === 1 ? values[0] || '(空白)' : values.length + ' 项') + " ✕", "column-filter-clear", 'data-v="' + esc(key) + '" title="' + esc(values.join('；')) + '"', cls));
  }
  const customCount = activeCustomConditions().length;
  if (customCount) {
    tags.push('<span class="custom-filter-relation">自定义·' + (f.customLogic === "OR" ? "任一满足" : "全部满足") + '：</span>');
    (f.customConditions || []).forEach((c, index) => {
      const label = customFilterNodeLabel(c);
      if (!label) return;
      tags.push('<button class="fchip ' + cls + ' on custom-filter-summary" data-act="custom-filter-del" data-idx="' + index + '" title="移除' + (c.type === 'group' ? '整个条件组' : '条件') + '：' + esc(label) + '">' + esc(label) + ' ✕</button>');
    });
  }
  return tags;
}

/* 供下方各展示分区（重点关注 / 同V码冲突 / 字段分析 / 口径与规则 / MPS工艺路线）顶部渲染与上方筛选区的实时联动状态条 */
function renderScopeLinkageBar(panelTitle, extraRightHtml) {
  const tags = buildActiveFilterLinkageTags("sm");
  const totalScoped = (derived && derived.total) || 0;
  const totalAll = (STATS && STATS.total) || rows.length;
  const f = state.filters;
  const hasNonDefault = f.mfg.size || f.formula.size || f.cats.size || f.stocks.size || f.brands.size || f.status !== "有效" || f.pre || f.scope || f.onlyBlock || f.onlyIssue || f.onlyVconf || f.onlyBasket || f.onlyFieldIssue || f.onlyPdf || f.onlyPdfRule || activeCustomConditions().length || Object.keys(f.columnFilters || {}).length || state.q;
  return '<div class="scope-linkage-bar" data-scope-total="' + totalScoped + '" style="grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:#f4f9ff;border:1px solid #bfd8fa;border-radius:9px;padding:7px 12px;margin-bottom:10px;font-size:12px">'
    + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
    + '<span style="font-weight:750;color:var(--blue-deep)">🔗 已与上方筛选区实时联动（' + esc(panelTitle || "当前视图") + '基数：<b>' + totalScoped.toLocaleString() + '</b> / ' + totalAll.toLocaleString() + ' 条）：</span>'
    + (tags.length ? tags.join("") : '<span style="color:var(--subtle)">全量物料（未附加筛选）</span>')
    + (hasNonDefault ? '<button class="fchip sm" data-act="clear-filters" title="恢复默认有效物料范围">' + ic("x", 10) + ' 重置筛选</button>' : '')
    + '</div>'
    + (extraRightHtml ? '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' + extraRightHtml + '</div>' : '')
    + '</div>';
}
function renderCustomFilters() {
  const f = state.filters, conditions = f.customConditions || [];
  const relation = (logic, path) => '<select class="cfg-select" data-act="' + (path ? 'custom-filter-group-logic' : 'custom-filter-logic') + '" data-idx="' + path + '" aria-label="' + (path ? '条件组 ' + customConditionPathLabel(path) + ' 关系' : '自定义条件关系') + '">'
    + '<option value="AND"' + (logic !== 'OR' ? ' selected' : '') + '>全部满足 (AND)</option><option value="OR"' + (logic === 'OR' ? ' selected' : '') + '>任一满足 (OR)</option></select>';
  const add = (parent, group, label) => '<button type="button" class="mini-btn" data-act="' + (group ? 'custom-filter-add-group' : 'custom-filter-add') + '" data-parent="' + parent + '">' + ic('plus', 11) + ' ' + label + '</button>';
  const renderItems = (items, parent = '') => items.map((c, offset) => {
    const index = parent ? parent + '.' + offset : String(offset), number = customConditionPathLabel(index);
    if (c.type === 'group') return '<div class="custom-filter-group" role="group" aria-label="条件组 ' + number + '"><div class="custom-group-head"><b>条件组 ' + number + '</b>' + relation(c.logic, index)
      + '<div class="custom-filter-actions">' + add(index, false, '条件') + add(index, true, '条件组')
      + '<button type="button" class="mini-btn danger" data-act="custom-filter-del" data-idx="' + index + '" aria-label="删除条件组 ' + number + '">' + ic('x', 12) + '</button></div></div>'
      + renderItems(c.conditions, index) + (!c.conditions.length ? '<span class="custom-filter-no-value">空条件组暂不参与筛选</span>' : '') + '</div>';
    const noValue = c.op === "empty" || c.op === "notEmpty";
    const date = isDateField(c.field), range = date && c.op === "between";
    const legacy = date && !DATE_OPERATORS.some((o) => o.op === c.op);
    const input = (part, label) => {
      const picker = date && !legacy;
      const attrs = ' data-idx="' + index + '" data-part="' + part + '"';
      const field = '<input type="text" class="cfg-input custom-filter-value" data-act="custom-filter-value"' + attrs + ' aria-label="条件 ' + number + ' ' + label + '" value="' + esc(c[part] || '') + '"'
        + (picker ? ' data-date-input="true" inputmode="numeric" maxlength="10" placeholder="20260101" title="输入 YYYYMMDD 或 YYYY-MM-DD，也可点日历选日期"' : '')
        + (legacy ? ' readonly title="原文本条件已保留，请切换运算符使用日期筛选"' : '') + (!date ? ' placeholder="' + esc(conditionValuePlaceholder(c.op)) + '"' : '') + '>';
      return picker ? '<div class="custom-date">' + field + '<button type="button" data-date-action="open"' + attrs + ' aria-label="打开条件 ' + number + ' ' + label + '日历" aria-haspopup="dialog" aria-expanded="false">' + ic("calendar", 14) + '</button></div>' : field;
    };
    const invalid = date && !legacy && !noValue && [c.val, ...(range ? [c.valTo] : [])].some((v) => v && !isoDate(v));
    const error = invalid ? '请输入有效日期，如 20260101' : range && c.val && c.valTo && isoDate(c.val) > isoDate(c.valTo) ? '结束日期不能早于开始日期' : '';
    return '<div class="custom-filter-row' + (range ? ' has-date-range' : '') + '">'
      + '<span class="tag blue" title="条件 ' + number + '">' + number + '</span>'
      + '<div class="custom-filter-field"><select hidden data-act="custom-filter-field" data-idx="' + index + '" aria-label="条件 ' + number + ' 字段">' + buildFieldOptionsHtml(c.field) + '</select>'
      + '<button type="button" class="cfg-select custom-field-trigger" data-field-picker-open data-idx="' + index + '" aria-label="条件 ' + number + ' 字段：' + esc(schemaByKey.get(c.field)?.label || c.field) + '" aria-haspopup="dialog" aria-expanded="false" aria-controls="customFieldPicker">'
      + '<span>' + esc(schemaByKey.get(c.field)?.label || c.field) + '</span>' + ic('chevron-down', 12) + '</button></div>'
      + '<select class="cfg-select custom-filter-op" data-act="custom-filter-op" data-idx="' + index + '" aria-label="条件 ' + number + ' 运算符">'
      + filterConditionOperators(c.field, c.op).map((o) => '<option value="' + o.op + '"' + (c.op === o.op ? ' selected' : '') + (o.legacy ? ' disabled' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>'
      + (noValue ? '<span class="custom-filter-no-value">无需填写匹配值</span>' : range ? '<div class="custom-filter-range">' + input('val', '开始日期') + '<span>至</span>' + input('valTo', '结束日期') + '</div>' : input('val', date ? '日期' : '匹配值'))
      + '<button class="mini-btn danger" data-act="custom-filter-del" data-idx="' + index + '" aria-label="删除条件 ' + number + '">' + ic("x", 12) + '</button>'
      + (error ? '<span class="custom-filter-error" role="alert">' + error + '</span>' : '') + '</div>';
  }).join('');
  return '<div class="fzone custom-filter-zone" id="customFilterZone">'
    + '<div class="custom-filter-head"><b>' + ic('filter', 13) + ' 自定义条件配置</b><span class="tag blue">' + activeCustomConditions().length + ' 条生效</span><div class="custom-filter-actions">'
    + (conditions.length ? '<button class="mini-btn" data-act="custom-filter-clear">清空</button>' : '') + add('', false, '添加条件') + add('', true, '添加条件组') + '</div></div>'
    + '<div class="custom-filter-controls"><span>保留满足</span>' + relation(f.customLogic, '') + '<span>的物料</span></div>'
    + '<div class="custom-filter-list">' + renderItems(conditions) + '</div>'
    + '<div class="custom-filter-hint">条件组可交替嵌套 AND / OR；“包含任一项”用 ; 或 ；分隔。日期支持手输 20260101，空条件暂不生效。</div></div>';
}

function renderFilters() {
  if (typeof closeCustomFieldPicker === "function") closeCustomFieldPicker();
  const f = state.filters;
  const customCount = activeCustomConditions().length;
  const previousCustomScroll = document.querySelector('#customFilterZone .custom-filter-list')?.scrollTop || 0;
  const expSet = state.expandedMore || new Set();
  const row = (label, chipsHtml) => '<div class="frow"><span class="flabel">' + label + '</span><div class="fchips">' + chipsHtml + "</div></div>";

  /* 展开“更多 N 个”后直接内联渲染全部剩余项，隐藏“更多 N 个”本身，并在末尾提供“收起”按钮；已选中的隐藏项即使未展开也常驻显示 */
  const renderWithMore = (moreKey, list, limit, act, onSet, cls) => {
    const isExp = expSet.has(moreKey);
    const num = (n) => n.toLocaleString();
    if (list.length <= limit) {
      return list.map(([c, n]) => chip(onSet.has(c), esc(c) + " " + num(n), act, 'data-v="' + esc(c) + '"', cls)).join("");
    }
    if (isExp) {
      return list.map(([c, n]) => chip(onSet.has(c), esc(c) + " " + num(n), act, 'data-v="' + esc(c) + '"', cls)).join("")
        + '<button class="fchip more-btn' + (cls ? " " + cls : "") + '" data-act="toggle-more" data-v="' + moreKey + '">收起 ▲</button>';
    }
    const head = list.slice(0, limit);
    const tail = list.slice(limit);
    const selectedInTail = tail.filter(([c]) => onSet.has(c));
    const remainCount = tail.length - selectedInTail.length;
    return head.map(([c, n]) => chip(onSet.has(c), esc(c) + " " + num(n), act, 'data-v="' + esc(c) + '"', cls)).join("")
      + selectedInTail.map(([c, n]) => chip(true, esc(c) + " " + num(n), act, 'data-v="' + esc(c) + '"', cls)).join("")
      + (remainCount > 0 ? '<button class="fchip more-btn' + (cls ? " " + cls : "") + '" data-act="toggle-more" data-v="' + moreKey + '">更多 ' + remainCount + " 个 ▾</button>" : "");
  };
  const num = (n) => n.toLocaleString();

  /* 汇总当前已激活的筛选条件标签（供顶部紧凑折叠条与下方各展示面板实时联动显示） */
  const activeSummaryTags = buildActiveFilterLinkageTags("sm", false, false);

  const anyFilter = f.mfg.size || f.formula.size || f.cats.size || f.stocks.size || f.brands.size || f.status !== "有效" || f.pre || f.scope || f.onlyBlock || f.onlyIssue || f.onlyVconf || f.onlyBasket || f.onlyFieldIssue || f.onlyPdf || f.onlyPdfRule || (f.customConditions || []).length || Object.keys(f.columnFilters || {}).length || state.q;
  const collapsed = !!state.filterCollapsed;

  const quickOptions = (key, label, act) => '<select data-act="quick-filter" data-key="' + act + '" aria-label="按' + label + '筛选"><option value="">' + label + ' · 添加筛选</option>'
    + countBy(rowsInScope([act]), (r) => r[key] || '未填').map(([v,n]) => '<option value="' + esc(v) + '">' + esc(v) + ' (' + num(n) + ')</option>').join('') + '</select>';
  let h = '<div class="quick-filters"><span>常用筛选</span>' + quickOptions('cat', '品类', 'cats') + quickOptions('brand', '品牌', 'brands')
    + '<select data-act="quick-status" aria-label="按物料状态筛选">' + [['', '全部状态'], ['有效', '有效物料'], ['无效', '无效物料']].map(([v,label]) => '<option value="' + v + '"' + (f.status === v ? ' selected' : '') + '>' + label + '</option>').join('') + '</select>'
    + '<div class="quick-filter-actions"><button class="fchip sm more-btn" data-act="custom-filter-open">' + ic("sliders", 11) + ' 自定义条件' + (customCount ? " (" + customCount + ")" : "") + '</button>'
    + '<button class="fchip sm more-btn" data-act="toggle-filter-collapse" aria-expanded="' + !collapsed + '">' + ic('filter', 12) + (collapsed ? ' 更多筛选 ▾' : ' 收起更多筛选 ▴') + '</button>'
    + (anyFilter ? '<button class="fchip sm" data-act="clear-filters">' + ic("x", 10) + " 重置全部</button>" : "") + '</div></div>'
    + (activeSummaryTags.length ? '<div class="filter-collapse-bar"><span class="fc-title">已选条件</span><div class="fc-tags">' + activeSummaryTags.join('') + '</div></div>' : '');

  if (collapsed) {
    document.getElementById("filterBar").innerHTML = h;
    return;
  }

  /* ---- 分区一：数据分类（严格排序：制造类别 → 配方大类 → 品类三级 → 库存小类 → 品牌） ---- */
  const mfgs = countBy(rowsInScope(["mfg"]), (r) => r["制造类别"] || "未填");
  const formulas = countBy(rowsInScope(["formula"]), (r) => r.formula || "未填");
  const cats = countBy(rowsInScope(["cats"]), (r) => r.cat);
  const stocks = countBy(rowsInScope(["stocks"]), (r) => r.stock || "未填");
  const brands = countBy(rowsInScope(["brands"]), (r) => r.brand || "未填");

  h += '<div class="fzones-grid">'
    + '<div class="fzone product-filter-zone"><div class="zone-head">' + ic("layers", 12) + " 产品分类（制造类别 → 配方大类 → 品类三级 → 库存小类 → 品牌）</div>"
    + row("制造类别", renderWithMore("mfg", mfgs, 8, "filter-mfg", f.mfg))
    + row("配方大类", renderWithMore("formula", formulas, 8, "filter-formula", f.formula))
    + row("品类三级", renderWithMore("cats", cats, 9, "filter-cat", f.cats))
    + row("库存小类", renderWithMore("stocks", stocks, 8, "filter-stock", f.stocks, "sm"))
    + row("品牌", renderWithMore("brands", brands, 9, "filter-brand", f.brands, "sm"))
    + "</div>";

  /* ---- 分区二：范围与状态判断 ---- */
  const scRows = rowsInScope(["scope"]);
  let scC2y = 0, scRoute = 0;
  const cutoff = (DATASET.meta && DATASET.meta.createdCutoff) || "0000-00-00";
  for (const r of scRows) {
    if (String(r.created || "") >= cutoff) scC2y++;
    if (r.route) scRoute++;
  }
  const stRows = rowsInScope(["status"]);
  const stCnt = countBy(stRows, (r) => r.status || "未填");
  const preRows = rowsInScope(["pre"]);
  const preCnt = countBy(preRows, (r) => r.pre || "未填");
  const cntOf = (list, k) => { for (const [a, b] of list) if (a === k) return b; return 0; };
  let onlyChips = chip(f.onlyBlock, ic("alert-octagon", 11) + " 重点核查(矛盾/错值) " + num(rowsInScope(["onlyBlock"]).filter((r) => r.blocking).length), "toggle-only", 'data-v="onlyBlock"', "warn")
    + chip(f.onlyIssue, "有异常 " + num(rowsInScope(["onlyIssue"]).filter((r) => r.issueCount > 0).length), "toggle-only", 'data-v="onlyIssue"')
    + chip(f.onlyVconf, ic("link", 11) + " 同V码冲突 " + num(rowsInScope(["onlyVconf"]).filter((r) => r.vconf).length), "toggle-only", 'data-v="onlyVconf"', "warn")
    + chip(f.onlyPdf, "工艺属性检查 " + num(rowsInScope(["onlyPdf"]).filter((r) => r.pdfCount > 0).length), "toggle-only", 'data-v="onlyPdf"')
    + chip(f.onlyBasket, "对比篮 " + num(rowsInScope(["onlyBasket"]).filter((r) => basketSet.has(r.material)).length), "toggle-only", 'data-v="onlyBasket"');
  if (f.onlyPdfRule) {
    const rule = (DATASET.pdfRules || []).find((x) => String(x.no) === f.onlyPdfRule);
    onlyChips += chip(true, "规则 " + esc(f.onlyPdfRule) + (rule ? " " + esc(rule.title) : "") + " ✕", "pdf-rule-filter", 'data-v="' + esc(f.onlyPdfRule) + '"', "warn");
  }
  if (f.onlyFieldIssue) onlyChips += chip(true, "字段异常：" + esc(f.onlyFieldIssue) + " ✕", "clear-field-issue", "", "warn");

  h += '<div class="filter-right-stack"><div class="fzone"><div class="zone-head">' + ic("sliders", 12) + " 数据范围与状态判断</div>"
    + row("数据范围",
      chip(f.scope === "", "全部 " + num(scRows.length), "filter-scope", 'data-v=""')
      + chip(f.scope === "created2y", "近2年创建 " + num(scC2y), "filter-scope", 'data-v="created2y"'))
    + row("物料状态",
      chip(f.status === "", "全部 " + num(stRows.length), "filter-status", 'data-v=""')
      + chip(f.status === "有效", "有效 " + num(cntOf(stCnt, "有效")), "filter-status", 'data-v="有效"')
      + chip(f.status === "无效", "无效 " + num(cntOf(stCnt, "无效")), "filter-status", 'data-v="无效"'))
    + row("预失效",
      chip(f.pre === "", "全部 " + num(preRows.length), "filter-pre", 'data-v=""')
      + ["Y", "N", "F", "X"].map((p) => chip(f.pre === p, p + " " + num(cntOf(preCnt, p)), "filter-pre", 'data-v="' + p + '"')).join(""))
    + row("质量仅看", onlyChips)
    + "</div>" + renderCustomFilters() + "</div></div>";
  document.getElementById("filterBar").innerHTML = h;
  document.querySelector('#customFilterZone .custom-filter-list').scrollTop = previousCustomScroll;
}
function renderResultLine() {
  const report = querySearchReport(), batch = report.batch;
  const source = '<span class="source-time" title="数据源：' + esc(DATASET.meta.source || '') + '">数据时间 ' + esc(DATASET.meta.sourceStamp || '未提供') + '</span>';
  let h = '<div class="result-feedback"><span>' + (state.q ? '搜索“' + esc(state.q.length > 45 ? state.q.slice(0, 45) + '…' : state.q).replace(/\n/g, ' · ') + '”' : '勾选物料可对比，点击编码或说明可速览') + '</span>'
    + (state.q && !batch ? '<span>· ' + derived.total.toLocaleString() + ' 条匹配' + (state.sort.explicit ? '，按' + esc(schemaByKey.get(state.sort.key)?.label || state.sort.key) + (state.sort.dir === 1 ? '升序' : '降序') : state.qMode === 'smart' ? '，精准命中优先' : '') + '</span>' : '') + source + '</div>';
  if (batch) {
    const detail = (label, codes, action) => !codes.length ? '' : '<div><b>' + label + ' ' + codes.length + ' 个</b> ' + (action ? '<button class="tool-btn" data-act="copy-query-codes" data-v="' + action + '">复制编码</button>' : '') + '<div class="batch-code-list">' + codes.map(esc).join('、') + '</div></div>';
    h += '<details class="batch-feedback"><summary>批量查码 <b>' + batch.total + '</b> 个 · 当前找到 <b>' + batch.found.length + '</b> 个 · 未找到 <b>' + batch.missing.length + '</b> 个 · 被筛选排除 <b>' + batch.excluded.length + '</b> 个 · 一码多料 <b>' + batch.ambiguous.length + '</b> 个'
      + (batch.repeated ? '<span>（已合并 ' + batch.repeated + ' 个重复输入）</span>' : '') + '<span>查看明细 ▾</span></summary><div class="batch-problems">'
      + detail('未找到', batch.missing, 'missing') + detail('被筛选排除', batch.excluded, 'excluded')
      + detail('一码多料', batch.ambiguous.map((x) => x.code + '（' + x.count + '条）'), '')
      + (batch.excluded.length ? '<div><button class="tool-btn" data-act="search-all-scope">保留搜索词，查看全部状态与分类</button></div>' : '')
      + (!batch.missing.length && !batch.excluded.length && !batch.ambiguous.length ? '全部编码已匹配到物料。' : '') + '</div></details>';
  } else if (state.q && derived.total && report.excluded > 0) {
    h += '<span class="query-scope-note">另有 ' + report.excluded.toLocaleString() + ' 条匹配被当前筛选排除</span><button class="view-shortcut-config" data-act="search-all-scope">放宽筛选</button>';
  }
  document.getElementById("resultLine").innerHTML = h;
}

/* ---------- 对比篮（查询区内联条，空时隐藏） ---------- */
function renderBasket() {
  const dock = document.getElementById("basketDock");
  const toggle = document.getElementById("basketToggle");
  const quickCompare = document.getElementById("basketCompareQuick");
  const row = document.getElementById("basketRow");
  const body = document.getElementById("basketBody");
  const acts = document.getElementById("basketActions");
  if (!state.basket.length) {
    dock.hidden = true;
    state.basketExpanded = false;
    row.style.display = "none";
    body.innerHTML = "";
    acts.innerHTML = "";
    return;
  }
  dock.hidden = false;
  toggle.innerHTML = ic("layers", 14) + ' 已选 ' + state.basket.length + '/8 个物料 ' + (state.basketExpanded ? '▴' : '▾');
  toggle.setAttribute("aria-expanded", String(state.basketExpanded));
  quickCompare.disabled = state.basket.length < 2;
  quickCompare.title = state.basket.length < 2 ? "至少选择两条物料即可对比" : "直接对比已选物料";
  row.style.display = state.basketExpanded ? "flex" : "none";
  body.innerHTML = '<div class="basket">' + state.basket.map((m) => {
    const r = byMaterial.get(m);
    return '<span class="bsku"><span class="m">' + esc(m) + "</span>"
      + (r && r.blocking ? '<span class="sev high" title="阻断"></span>' : "")
      + '<button data-act="basket-remove" data-material="' + esc(m) + '" title="移除">' + ic("x", 12) + "</button></span>";
  }).join("") + "</div>";
  acts.innerHTML = '<button class="tool-btn primary" data-act="basket-compare">' + ic("swap", 13) + " 对比已选（" + state.basket.length + "/8）</button>"
    + '<button class="tool-btn" data-act="basket-clear">' + ic("x", 13) + " 清空</button>";
}

/* ---------- 结果：表格 / 卡片 ---------- */
function blockingShortLabel(r) {
  if (!r || !r.blocking) return "";
  const evs = buildConcreteFocusEvidences(r);
  if (!evs.length) return "需核查";
  return evs[0].subKey + (evs.length > 1 ? " 等" + evs.length + "项" : "");
}
function blockingTooltip(r) {
  if (!r || !r.blocking) return "";
  const evs = buildConcreteFocusEvidences(r);
  return evs.map((e, i) => (i + 1) + ". " + e.title + " [" + e.proof + "]").join("；");
}
function boolCell(key, v, r) {
  if (key === "blocking") {
    if (!v) return '<span class="tag green">' + ic("check", 11) + "正常</span>";
    const lbl = blockingShortLabel(r);
    const tip = blockingTooltip(r);
    return '<span class="tag solid-red" title="' + esc(tip || "存在数值矛盾或成对缺失，需重点核查") + '">' + ic("alert-octagon", 11) + " " + esc(lbl) + "</span>";
  }
  if (key === "vconf") {
    if (!v) return "";
    const g = r && r.vcode ? vconfByVcode.get(r.vcode) : null;
    const tip = g
      ? "V码 " + r.vcode + " 存在 " + g.specCount + " 种规格冲突（共 " + g.materialCount + " 个物料）· 点击查看该 V码冲突组详情与对比"
      : "点击查看同 V码冲突详情";
    return '<span class="tag red clickable" data-act="vconf-inspect" data-vcode="' + esc(r && r.vcode ? r.vcode : "") + '" title="' + esc(tip) + '">' + ic("link", 11) + "冲突" + (g ? "(" + g.specCount + "规/" + g.materialCount + "码)" : "") + "</span>";
  }
  if (key === "flags") {
    if (!r._flags.length) return '<span class="tag green">' + ic("check", 11) + " 无异常</span>";
    return '<div class="flagsum">' + flagsChips(r) + "</div>";
  }
  return fmtOrDash(v);
}

/* ---------- 问题明细 → 可读分组标签 ---------- */
const FLAG_SHORT = {
  MISS: "缺失", PFM: "工艺缺失", NUM: "错值", PFN: "数值异常", PFC: "矛盾",
  PAIR: "不成对", LEVEL: "层级不符", BOX: "盒巾待确认", VCONF: "同V码冲突",
  SPEC: "装数不符", ROUTE: "路线异常", PFI: "提示", PFP: "待核",
};
function flagsChips(r) {
  const byCode = {};
  for (const fl of r._flags) {
    const p = fl.split(":");
    const field = p.length >= 3 ? p[p.length - 1] : (p[1] || "");
    (byCode[p[0]] = byCode[p[0]] || []).push(field);
  }
  const fk = DATASET.flagFieldToKey || {};
  const sevRank = (c) => { const m = FLAG_META[c]; return m ? (m.sev === "high" ? 0 : m.sev === "mid" ? 1 : 2) : 2; };
  const codes = Object.keys(byCode).sort((a, b) => sevRank(a) - sevRank(b));
  const out = [];
  for (const code of codes) {
    const meta = FLAG_META[code] || { name: code, sev: "mid", icon: "tag" };
    const fields = [...new Set(byCode[code])].filter(Boolean);
    let text = "";
    if (["VCONF", "ROUTE", "SPEC"].includes(code)) {
      text = ""; /* 标签本身已说明问题 */
    } else if (["PFC", "PFP", "BOX", "PFI"].includes(code)) {
      text = fields.length ? "：" + fields.slice(0, 2).map(esc).join("；") + (fields.length > 2 ? " 等" + fields.length + " 项" : "") : "";
    } else {
      const parts = fields.slice(0, 3).map((f) => {
        const k = fk[f] || f;
        const val = r[k];
        if ((code === "NUM" || code === "PFN") && val !== null && val !== undefined && val !== "") return esc(f) + "=" + esc(fmt(val));
        return esc(f);
      });
      text = "：" + parts.join("、") + (fields.length > 3 ? " 等" + fields.length + " 项" : "");
    }
    const cls = meta.sev === "high" ? "red" : meta.sev === "mid" ? "orange" : "";
    if (code === "VCONF" && r.vcode) {
      out.push('<span class="tag ' + cls + ' fsum clickable" data-act="vconf-inspect" data-vcode="' + esc(r.vcode) + '" title="点击查看 V码 ' + esc(r.vcode) + ' 的同V码规格冲突对比">'
        + ic(meta.icon, 10) + esc(FLAG_SHORT[code] || code) + " (" + esc(r.vcode) + ")</span>");
    } else {
      out.push('<span class="tag ' + cls + ' fsum" title="' + esc(meta.name + (fields.length ? "：" + fields.join("、") : "")) + '">'
        + ic(meta.icon, 10) + esc(FLAG_SHORT[code] || code) + text + "</span>");
    }
  }
  return out.join("");
}
const RESULT_COLUMN_CLASSES = new Map([
  ["部门", "col-department"], ["申请人", "col-person"], ["cat", "col-category"],
  ["物料说明（繁体）", "col-long-text"], ["物料说明（英文）", "col-english-text"],
  ["版本描述", "col-long-text"], ["产品质量标准", "col-long-text"], ["配方", "col-long-text"], ["是否超标准", "col-long-text"],
  ...["产品描述", "中类说明", "stock", "stockCat", "series", "关键工艺", "压线/压花", "粗压花", "筒芯", "码数", "纸盒尺寸", "报关规格", "品类（五级架构）", "标准/迷你", "折叠规格", "中包包装方式"].map((k) => [k, "col-medium-text"]),
  ...["小包/袋/盒产品条码", "手抽/中袋条形码", "外包装条形码（选择组织）", "基准条码", "物料中类", "产品系列号"].map((k) => [k, "col-code"]),
]);
function resultColumnClass(key) {
  if (PINNED_KEYS.includes(key)) return "";
  if (RESULT_COLUMN_CLASSES.has(key)) return RESULT_COLUMN_CLASSES.get(key);
  const type = (schemaByKey.get(key) || {}).type;
  return type === "date" ? "col-date" : (type === "text" || type === "enum") ? "col-text" : type === "number" ? "col-number" : "";
}
// 字段定位仅控制当前表格的位置和提示，不写入个人配置。
const fieldLocator = { query: "", key: "", active: 0 };
function matchingResultFields(query, keys = orderedVisibleKeys()) {
  const norm = (v) => String(v || "").toLowerCase().replace(/\s+/g, "");
  const q = norm(query);
  return keys.map((key, index) => {
    const s = schemaByKey.get(key), label = norm(s.label);
    const rank = !q || label === q ? 0 : label.startsWith(q) ? 1 : label.includes(q) ? 2 : norm(key).includes(q) ? 3 : -1;
    return { key, label: s.label, index, rank };
  }).filter((s) => s.rank >= 0).sort((a, b) => a.rank - b.rank || a.index - b.index);
}
function fieldLocatorHtml() {
  return '<div class="field-locator" id="fieldLocator">'
    + '<label for="fieldLocatorInput">' + ic("search", 14) + ' 定位字段</label>'
    + '<div class="field-locator-control"><input id="fieldLocatorInput" type="text" value="' + esc(fieldLocator.query) + '" placeholder="输入字段名，快速定位" autocomplete="off" role="combobox" aria-label="搜索并定位表格字段" aria-autocomplete="list" aria-expanded="false" aria-controls="fieldLocatorOptions">'
    + '<button type="button" data-act="field-locator-clear" aria-label="清除字段定位" title="清除字段定位"' + (fieldLocator.query ? '' : ' hidden') + '>×</button></div>'
    + '<div class="field-locator-popup" id="fieldLocatorPopup" hidden><div class="field-locator-count" id="fieldLocatorCount" role="status"></div><div class="field-locator-options" id="fieldLocatorOptions" role="listbox" aria-label="匹配的表格字段"></div></div>'
    + '<span class="sr-only" id="fieldLocatorStatus" role="status"></span></div>';
}
function cellHtml(key, r, stickyIdx, selectable = false) {
  const s = schemaByKey.get(key);
  const v = r[key];
  let inner;
  const clsArr = [];
  if (selectable && fieldLocator.key === key) clsArr.push("field-located");
  if (stickyIdx >= 0 && stickyIdx < 4) clsArr.push("sticky-col", "sc-" + stickyIdx);
  const columnClass = resultColumnClass(key);
  if (columnClass) clsArr.push(columnClass);
  if (s.type === "bool" || s.type === "flags") inner = boolCell(key, v, r);
  else if (key === "desc") inner = '<div class="cell-desc" title="' + esc(v) + '"><button class="quick-view-link" data-act="view-detail" data-material="' + esc(r.material) + '" aria-label="速览：' + esc(v) + '">' + highlight(v, state.tokens) + "</button></div>";
  else if (key === "material" || key === "vcode") {
    clsArr.push("mono");
    if (key === "material") {
      inner = '<a href="' + esc(buildDetailDeepLinkUrl(r.material)) + '" class="mono" style="color:var(--blue-deep);text-decoration:none;border-bottom:1px dashed #9ec5fa" data-act="open-detail-page" data-material="' + esc(r.material) + '" title="查看完整物料详情">' + (v ? highlight(v, state.tokens) : '<span style="color:var(--subtle)">—</span>') + "</a>";
      if (selectable) inner = '<div class="material-select"><input type="checkbox" data-act="select-material" data-material="' + esc(r.material) + '" aria-label="选择物料 ' + esc(r.material) + ' 加入对比"' + (basketSet.has(r.material) ? ' checked' : '') + '>' + inner + '</div>';
    } else {
      inner = '<span class="mono">' + (v ? highlight(v, state.tokens) : '<span style="color:var(--subtle)">—</span>') + "</span>";
    }
  } else if (key === "spec") {
    inner = v ? '<span class="mono" style="word-break:break-word;white-space:normal">' + highlight(v, state.tokens) + "</span>" : '<span style="color:var(--subtle)">—</span>';
  } else if (s.type === "number") {
    inner = v === null || v === undefined || v === "" ? "—" : esc(fmt(v));
    clsArr.push("num");
  } else if (v === null || v === undefined || v === "") inner = '<span style="color:var(--subtle)">—</span>';
  else inner = highlight(fmt(v), state.tokens);
  const clsAttr = clsArr.length ? ' class="' + clsArr.join(" ") + '"' : "";
  return '<td data-field="' + esc(key) + '"' + clsAttr + ">" + inner + "</td>";
}
function tableXnavHtml(tableId, colCount) {
  return '<div class="table-xnav" data-xnav-for="' + esc(tableId) + '">'
    + (tableId === "mainTableWrap" ? fieldLocatorHtml() : '<span class="xn-hint">✋ <b>按住表格任意处左右拖拽平移</b> <span style="font-weight:500;color:var(--muted)">· 或 <kbd>Shift</kbd>+滚轮 · 共 ' + colCount + ' 列（左2列+右操作列已冻结）</span></span>')
    + '<div class="xn-btns">'
    + '<button type="button" class="xn-btn" data-act="xnav-step" data-target="' + esc(tableId) + '" data-dir="start" title="跳到最左侧">⏮ 最左</button>'
    + '<button type="button" class="xn-btn" data-act="xnav-step" data-target="' + esc(tableId) + '" data-dir="left" title="向左滚动一屏">◀ 左移</button>'
    + '</div>'
    + '<div class="xn-track-wrap">'
    + '<input type="range" class="xn-range" min="0" max="1000" value="0" data-xnav-range="' + esc(tableId) + '" title="拖动滑块快速横向定位列（无需滚到表格底部）">'
    + '<span class="xn-pos" data-xnav-pos="' + esc(tableId) + '">0%</span>'
    + '</div>'
    + '<div class="xn-btns">'
    + '<button type="button" class="xn-btn" data-act="xnav-step" data-target="' + esc(tableId) + '" data-dir="right" title="向右滚动一屏">右移 ▶</button>'
    + '<button type="button" class="xn-btn" data-act="xnav-step" data-target="' + esc(tableId) + '" data-dir="end" title="跳到最右侧">最右 ⏭</button>'
    + '</div></div>';
}
function renderResults() {
  if (typeof closeColumnFilterMenu === "function") closeColumnFilterMenu();
  renderViewShortcuts();
  renderQueryWorkspace();
  const body = document.getElementById("resultsBody");
  const vis = orderedVisibleKeys();
  if (fieldLocator.key && !vis.includes(fieldLocator.key)) { fieldLocator.key = ""; fieldLocator.query = ""; }
  if (!derived.total) {
    const report = querySearchReport();
    const excluded = report.globalTotal > 0;
    body.innerHTML = '<div class="empty">' + ic("search", 30) + '<div>' + (excluded ? '匹配的物料被当前筛选条件排除了' : state.q ? '没有找到匹配的物料' : '当前筛选范围内没有物料') + '</div>'
      + '<p>' + (excluded ? '全库有 ' + report.globalTotal.toLocaleString() + ' 条匹配记录，可以保留搜索词并放宽筛选。' : state.q ? '请核对编码，或减少描述关键词；也可以调整搜索范围和匹配方式。' : '可以调整上方筛选条件，或查看全部物料。') + '</p>'
      + '<div class="empty-actions"><button class="tool-btn" data-act="search-all-scope">查看全部状态与分类</button>'
      + (state.qMode !== 'smart' || state.qField !== 'all' ? '<button class="tool-btn" data-act="q-reset-mode">扩大搜索方式</button>' : '') + '</div></div>';
    return;
  }
  if (state.view === "card") { body.innerHTML = '<div class="results-viewport results-card-viewport" tabindex="0" role="region" aria-label="查询结果卡片，可上下滚动">' + renderCards(vis) + '</div>'; return; }
  const prevWrap = document.getElementById("mainTableWrap");
  const prevScrollLeft = prevWrap ? prevWrap.scrollLeft : 0;
  const pageKey = [state.page, state.sort.key, state.sort.dir, derived.total, ...derived.pageRows.map((r) => r.material)].join("|");
  const prevScrollTop = prevWrap && prevWrap._pageKey === pageKey ? prevWrap.scrollTop : 0;
  let h = tableXnavHtml("mainTableWrap", vis.length + 1) + '<div class="table-wrap results-viewport" id="mainTableWrap" tabindex="0" role="region" aria-label="查询结果表格，可上下左右滚动"><table class="grid' + (vis.length >= 80 ? ' is-all-fields' : '') + '"><thead><tr>';
  for (let i = 0; i < vis.length; i++) {
    const k = vis[i];
    const s = schemaByKey.get(k);
    const on = state.sort.key === k;
    const stCls = (i < 4 ? " sticky-col sc-" + i : "") + (resultColumnClass(k) ? " " + resultColumnClass(k) : "") + (fieldLocator.key === k ? " field-located" : "");
    const pinBadge = i < 4 ? '<span style="font-size:10px;color:var(--blue);margin-left:2px" title="固定冻结列">📌</span>' : "";
    const filtered = Object.prototype.hasOwnProperty.call(state.filters.columnFilters || {}, k);
    h += '<th class="column-header' + stCls + (filtered ? ' column-filtered' : '') + '" data-field="' + esc(k) + '" aria-sort="' + (on ? state.sort.dir === 1 ? 'ascending' : 'descending' : 'none') + '"><div class="column-heading">'
      + '<button type="button" class="column-label" data-column-action="open" data-field="' + esc(k) + '" aria-label="筛选和排序：' + esc(s.label) + '" aria-haspopup="dialog" aria-expanded="false">' + esc(s.label) + pinBadge
      + (on ? '<span class="arrow">' + (state.sort.dir === 1 ? '▲' : '▼') + '</span>' : '') + '</button>'
      + '<button type="button" class="column-dropdown" data-column-action="open" data-field="' + esc(k) + '" aria-label="' + esc(s.label) + (filtered ? '，已筛选' : '') + '筛选菜单" aria-haspopup="dialog" aria-expanded="false">' + ic(filtered ? 'filter' : 'chevron-down', 13) + '</button></div></th>';
  }
  h += '<th class="sticky-right" title="右侧固定冻结操作列">操作 📌</th></tr></thead><tbody>';
  for (const r of derived.pageRows) {
    h += '<tr class="row' + (r.blocking ? " blocked" : "") + (basketSet.has(r.material) ? " selected" : "") + '" data-material="' + esc(r.material) + '">';
    for (let i = 0; i < vis.length; i++) {
      h += cellHtml(vis[i], r, i < 4 ? i : -1, true);
    }
    h += '<td class="sticky-right"><div class="rowact">'
      + '<button data-act="view-detail" data-material="' + esc(r.material) + '" title="速览物料">' + ic("eye", 13) + '<span>速览</span></button>'
      + '<button data-act="copy-material" data-material="' + esc(r.material) + '" title="复制物料编码">' + ic("copy", 13) + '</button>'
      + "</div></td></tr>";
  }
  h += "</tbody></table></div>";
  body.innerHTML = h;
  const nw = document.getElementById("mainTableWrap");
  nw._pageKey = pageKey;
  nw.scrollLeft = prevScrollLeft;
  nw.scrollTop = prevScrollTop;
  if (typeof syncTableXnav === "function") syncTableXnav("mainTableWrap");
}
function renderCards(vis) {
  return '<div class="card-grid">' + derived.pageRows.map((r) => {
    let h = '<div class="sku-card' + (basketSet.has(r.material) ? ' selected' : '') + '">'
      + '<div class="hd"><div style="min-width:0;flex:1"><div class="code material-select"><input type="checkbox" data-act="select-material" data-material="' + esc(r.material) + '" aria-label="选择物料 ' + esc(r.material) + ' 加入对比"' + (basketSet.has(r.material) ? ' checked' : '') + '>'
      + '<a class="material-detail-link" href="' + esc(buildDetailDeepLinkUrl(r.material)) + '" data-act="open-detail-page" data-material="' + esc(r.material) + '" title="查看完整物料详情">' + highlight(r.material, state.tokens) + '</a></div>'
      + '<div class="card-identity">V码：' + (r.vcode ? highlight(r.vcode, state.tokens) : '—') + ' · 规格：' + (r.spec ? highlight(r.spec, state.tokens) : '—') + '</div>'
      + '<button class="quick-view-link dsc" data-act="view-detail" data-material="' + esc(r.material) + '">' + highlight(r.desc, state.tokens) + '</button></div>'
      + '<div class="acts"><button class="mini-btn" data-act="view-detail" data-material="' + esc(r.material) + '" title="速览物料">' + ic('eye', 12) + '</button><button class="mini-btn" data-act="copy-material" data-material="' + esc(r.material) + '" title="复制物料编码">' + ic('copy', 12) + '</button></div></div><dl class="fields">';
    for (const k of vis) {
      const s = schemaByKey.get(k);
      if (k === "material" || k === "vcode" || k === "spec" || k === "desc") continue;
      let v = r[k];
      if (s.type === "bool" || s.type === "flags") v = boolCell(k, v, r);
      else if (v === null || v === undefined || v === "") v = '<span style="color:var(--subtle)">—</span>';
      else v = highlight(fmt(v), state.tokens);
      h += "<dt>" + esc(s.label) + "</dt><dd>" + v + "</dd>";
    }
    h += "</dl></div>";
    return h;
  }).join("") + "</div>";
}
function renderPager() {
  const el = document.getElementById("pager");
  const p = state.page, pages = derived.pages;
  let nums = [];
  const win = 2;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - p) <= win) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  let h = '<button data-act="page" data-v="' + (p - 1) + '"' + (p <= 1 ? " disabled" : "") + ">" + ic("chevron-left", 13) + "</button>";
  for (const n of nums) {
    h += n === "…" ? '<span style="padding:0 4px">…</span>'
      : '<button data-act="page" data-v="' + n + '"' + (n === p ? ' class="on"' : "") + ">" + n + "</button>";
  }
  h += '<button data-act="page" data-v="' + (p + 1) + '"' + (p >= pages ? " disabled" : "") + ">" + ic("chevron-right", 13) + "</button>";
  h += '<span style="margin-left:6px">第 ' + p + " / " + pages + " 页</span>";
  if (!derived.total) h = '<span>暂无符合条件的记录</span>';
  h += '<div class="pg-jump"><label for="pageSizeSel">每页</label><select id="pageSizeSel" aria-label="每页条数">'
    + [50, 100, 200].map((n) => '<option value="' + n + '"' + (n === state.pageSize ? " selected" : "") + ">" + n + "</option>").join("")
    + '</select><span>条</span><span class="pg-total" aria-live="polite">共 <b id="searchResultTotal">' + derived.total.toLocaleString() + '</b> 条记录</span></div>';
  el.innerHTML = h;
}
