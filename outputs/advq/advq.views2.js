/* ============ 视图层 · 第二部分：详情 / 字段管理 / 对比 / 字段分析 / 规则 ============ */
"use strict";

/* ---------- SKU 分析（内置方法，预设自既有口径） ---------- */
function parseBoxDims(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === "无" || ["不适用", "n/a", "na"].includes(s.toLowerCase())) return null;
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  return nums.slice(-3).map(Number);
}
function analyzeSku(r) {
  const cards = [];
  const govTag = (g) => '<span class="tag ' + (GOV_COLOR[g] || "") + '">' + ic(GOV_ICON[g] || "tag", 11) + esc((GOV_META[g] || {}).name || g) + "</span>";
  const statusPill = (st, text) => {
    const map = { ok: ["green", "check-circle", "通过"], warn: ["orange", "alert-triangle", "关注"], bad: ["red", "alert-octagon", "异常"], na: ["", "ban", "不适用"] };
    const m = map[st] || map.na;
    return '<span class="tag ' + m[0] + '">' + ic(m[1], 11) + esc(text || m[2]) + "</span>";
  };
  const card = (id, st, text, html, sec) => {
    const a = ANALYSES.find((x) => x.id === id);
    cards.push({ icon: a.icon, name: a.name, gov: a.gov, status: st, text: text, html: html, sec: sec || "general" });
  };

  /* 1 关键字段完整性 */
  if (r.ruleCat === "其他" || r.score === null) {
    card("completeness", "na", "不适用", "非卫卷/面巾/纸巾/餐巾四品类，不做关键字段完整率分析。");
  } else {
    const miss = r._flags.filter((f) => f.startsWith("MISS:")).map((f) => f.slice(5));
    card("completeness", miss.length ? "warn" : "ok", miss.length ? "缺失 " + miss.length + " 项" : "完整",
      donutHtml(r.score, "必填完整度") + (miss.length
        ? '<div class="kv" style="margin-top:9px"><dt>缺失必填</dt><dd>' + miss.map(esc).join("、") + "</dd></div>"
        : '<div style="margin-top:9px;color:var(--green)">' + ic("check-circle", 13) + " 品类必填字段均已维护（填“无”视为已确认）</div>"));
  }
  /* 2 明显错值 */
  {
    const bad = r._flags.filter((f) => f.startsWith("NUM:"));
    if (bad.length) {
      card("numeric", "bad", bad.length + " 项", '<div class="kv">' + bad.map((f) => {
        const fld = f.slice(4);
        return "<dt>" + esc(fld) + "</dt><dd><b style='color:var(--red)'>" + esc(fmt(r[fld])) + "</b> ≤ 0</dd>";
      }).join("") + "</div>");
    } else card("numeric", "ok", "通过", "净重、成品定量、层数、原始装数均大于 0（未维护的字段不参与判断）。");
  }
  /* 3 盒巾/纸盒尺寸口径 */
  if (r.ruleCat === "面巾") {
    const box = r["纸盒尺寸"];
    const dims = parseBoxDims(box);
    const variant = box && String(box).trim() !== "无" ? "盒巾" : "软抽";
    if (variant === "软抽") {
      card("box", "ok", "软抽", "纸盒尺寸为空/无 → 软抽：长宽取小包长度/宽度（" + esc(fmt(r["小包长度"]) || "—") + " × " + esc(fmt(r["小包宽度"]) || "—") + "），高度取单包高度 " + esc(fmt(r["单包高度"]) || "—") + "。");
    } else if (dims) {
      card("box", "ok", "盒巾", "维护了有效纸盒尺寸 → 盒巾：长宽直接取纸盒 " + dims[0] + " × " + dims[1] + "mm（高 " + dims[2] + "），小包长宽高不再必填。");
    } else {
      card("box", "warn", "待确认", "纸盒尺寸「" + esc(box) + "」无法解析出长×宽×高，盒巾长宽无法取值，需业务裁定。" + govTag("adjudication"));
    }
  } else {
    card("box", "na", "不适用", "纸盒尺寸口径仅面巾适用。");
  }
  /* 4 包装层级与成对校验 */
  {
    const pairs = r._flags.filter((f) => f.startsWith("PAIR:"));
    const levels = r._flags.filter((f) => f.startsWith("LEVEL:"));
    const bad = pairs.concat(levels);
    card("packaging", bad.length ? "warn" : "ok", bad.length ? bad.length + " 项" : "成对完整",
      '<div class="kv"><dt>包装层级</dt><dd>' + (r.pack ? esc(r.pack) : "—") + "</dd></div>"
      + (pairs.length ? '<div class="kv" style="margin-top:7px"><dt>未成对</dt><dd>' + pairs.map((f) => esc(f.slice(5))).join("、") + "（单位与数量必须成对维护）</dd></div>" : "")
      + (levels.length ? '<div class="kv" style="margin-top:7px"><dt>层级不一致</dt><dd>' + levels.map((f) => esc(f.slice(6))).join("、") + "（与中包包装方式/面巾证据不对齐）</dd></div>" : ""));
  }
  /* 5 同V码规格一致性 */
  {
    if (!r.vcode) card("vcode", "na", "无V码", "该物料未维护 V 码，不参与同 V 码冲突分组。");
    else if (r.vconf) {
      const g = vconfByVcode.get(r.vcode);
      card("vcode", "warn", "冲突", "V 码 <b>" + esc(r.vcode) + "</b> 对应 " + (g ? g.materialCount : "多个") + " 个物料、"
        + (g ? g.specCount : "多种") + " 种装数/规格组合（已剔除内部周转）："
        + (g ? '<div class="kv" style="margin-top:7px">' + g.specs.map((s) => "<dt>" + esc(s[0]) + "</dt><dd>装数 " + esc(fmt(s[1])) + " · 规格 " + esc(s[2] || "—") + "</dd>").join("") + "</div>" : "")
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">'
        + '<button class="mini-btn primary" data-act="vconf-compare" data-vcode="' + esc(r.vcode) + '">' + ic("swap", 12) + " 一键对比该 V 码全部冲突 SKU</button>"
        + '<button class="mini-btn" data-act="vconf-inspect" data-vcode="' + esc(r.vcode) + '">' + ic("link", 12) + " 在「同V码冲突」板块查看</button>"
        + '<button class="mini-btn" data-act="vconf-lock-results" data-vcode="' + esc(r.vcode) + '">' + ic("search", 12) + " 在查询结果中锁定此 V 码</button>"
        + "</div>");
    } else card("vcode", "ok", "无冲突", "同 V 码下装数与物料规格乘积表达式一致。");
  }
  /* 6 装数与规格乘积 */
  {
    if (r.load && r.specP) {
      const ok = Math.abs(r.load - r.specP) <= Math.max(0.5, Math.abs(r.load) * 1e-6);
      card("spec", ok ? "ok" : "warn", ok ? "一致" : "不一致",
        '<div class="kv"><dt>原始装数</dt><dd>' + esc(fmt(r.load)) + "</dd><dt>物料规格</dt><dd>" + esc(r.spec || "—") + "</dd>"
        + "<dt>标准化</dt><dd>" + esc(r.specC || "—") + "</dd><dt>规格乘积</dt><dd>" + esc(fmt(r.specP)) + "</dd></div>");
    } else {
      card("spec", "na", "无法比对", "原始装数或物料规格缺失/无法解析乘积表达式。");
    }
  }
  /* 7 工艺属性自动检查（示例校验规范，2026-10-13；范围 = 有效物料） */
  {
    const imported = /进口/.test(String(r.prodType || "")) || String(r.material).indexOf("1900") === 0;
    if (!processInScope(r)) {
      card("pdfrules", "na", "不适用", "此物料不满足当前工艺属性规则的总适用范围。");
    } else {
      const pf = r._flags.filter((f) => f.indexOf("PF") === 0);
      if (!pf.length) {
        card("pdfrules", "ok", "通过", "按当前已启用的工艺属性规则重算，未发现问题。");
      } else {
        const byRule = {};
        for (const fl of pf) {
          const p = fl.split(":");
          const no = p[1] || "?";
          (byRule[no] = byRule[no] || []).push([p[0], p[2] || ""]);
        }
        const fm = DATASET.pdfFlagMeta || {};
        const blockN = r.pdfBlock || 0;
        card("pdfrules", blockN ? "bad" : "warn", r.pdfCount + " 项" + (blockN ? "（阻断 " + blockN + "）" : ""),
          '<div style="display:grid;gap:7px">' + Object.keys(byRule).sort().map((no) => {
            const rule = (DATASET.pdfRules || []).find((x) => String(x.no) === no);
            const items = byRule[no];
            const hasBlock = items.some(([c]) => c === "PFN" || c === "PFC");
            const hasMid = items.some(([c]) => c === "PFP");
            return '<div style="display:flex;gap:7px;align-items:baseline;flex-wrap:wrap">'
              + '<span class="sev ' + (hasBlock ? "high" : hasMid ? "mid" : "low") + '"></span>'
              + '<b>' + esc(rule ? "规则" + no + " · " + rule.title : "规则" + no) + "</b>"
              + '<span style="color:var(--muted)">' + items.map(([c, fld]) => esc((fm[c] || {}).name || c) + (fld ? "：" + fld : "")).join("；") + "</span></div>";
          }).join("") + "</div>"
          + '<div style="margin-top:8px;font-size:11.5px;color:var(--subtle)">PFM=必填缺失（提示）/ PFN=数值异常 / PFC=逻辑矛盾 / PFI=规范提示 / PFP=一致性待核；默认规范来源（当前按已保存规则）：' + esc(DATASET.meta.pdfSpec || "PDF") + "</div>");
      }
    }
  }
  /* 8 物料状态与效期 */
  {
    const st = r.status === "有效" ? "ok" : "warn";
    card("status", st, r.status || "—",
      '<div class="kv"><dt>物料状态</dt><dd>' + (r.status === "有效" ? '<span class="tag green">有效</span>' : '<span class="tag red">无效</span>') + "</dd>"
      + "<dt>预失效</dt><dd>" + (r.pre ? esc(r.pre) : "—") + "</dd>"
      + "<dt>创建时间</dt><dd>" + (r.created ? esc(r.created.slice(0, 10)) : "—") + "</dd>"
      + "<dt>最后更新</dt><dd>" + (r.updated ? esc(r.updated.slice(0, 10)) : "—") + "</dd></div>");
  }
  /* 9 异常清单（实时计算） */
  {
    if (!r._flags.length) {
      card("issues", "ok", "无异常", "按当前 MDM 数据实时计算，未发现异常。");
    } else {
      card("issues", r.blocking ? "bad" : "warn", r._flags.length + " 项",
        '<div style="display:grid;gap:6px">' + r._flags.map((fl) => {
          const parts = fl.split(":");
          const type = parts[0];
          const field = parts.length >= 3 ? parts[parts.length - 1] : (parts[1] || "");
          const meta = FLAG_META[type] || { name: type, sev: "low", gov: "route", icon: "tag" };
          const vkey = (DATASET.flagFieldToKey || {})[field] || field;
          const hasVal = meta.sev === "high" && field && r[vkey] !== undefined && r[vkey] !== "" && r[vkey] !== null;
          return '<div style="display:flex;gap:7px;align-items:baseline;flex-wrap:wrap">'
            + '<span class="sev ' + meta.sev + '"></span><b>' + esc(meta.name) + "</b>" + govTag(meta.gov)
            + (field ? '<span style="color:var(--muted)">字段：' + esc(field) + "</span>" : "")
            + (hasVal ? '<span style="color:var(--red)">当前值 ' + esc(fmt(r[vkey])) + "</span>" : "")
            + "</div>";
        }).join("") + "</div>");
    }
  }
  /* ===== MPS 工艺路线专项校验（每次基于当前 MDM 源表实时重算，不引用历史快照结论） ===== */
  /* 10 工艺路线完整度 */
  if (!r.route) {
    card("route", "na", "非干巾四品类", "该物料不在干巾四品类（卫卷/面巾/纸巾/餐巾）工艺路线实时推导范围内。", "route");
  } else {
    const bad = r.routeStatus === "逻辑异常";
    card("route", bad ? "bad" : (r.routeStatus === "完整" ? "ok" : "warn"), r.routeStatus || "—",
      '<div class="kv"><dt>实时推导路线</dt><dd>' + esc(r.route) + "</dd>"
      + (r.routeNodes ? "<dt>节点完成度</dt><dd>" + esc(r.routeNodes) + "（完整/总数）</dd>" : "")
      + (r.routeMissing ? "<dt>待补 MDM 字段</dt><dd>" + esc(r.routeMissing) + "</dd>" : "")
      + "</div>", "route");
  }
  /* 11 MPS 路线专项校验（实时计算的包装数组交叉与设备规则缺口） */
  {
    const list = routeIssueMap.get(r.material) || [];
    if (!r.route) {
      card("history", "na", "不适用", "非干巾四品类，不执行 MPS 工艺路线专项校验。", "route");
    } else if (!list.length) {
      card("history", "ok", "无异常", "按当前 MDM 源表实时重算（V2.3.2 规则），包装数组交叉校验与工段设备规则均无异常。", "route");
    } else {
      card("history", list.some((x) => x[0] === "高") ? "bad" : "warn", list.length + " 条",
        '<div style="display:grid;gap:6px">' + list.map((x) => {
          return '<div style="display:flex;gap:7px;align-items:baseline;flex-wrap:wrap">'
            + '<span class="sev ' + (x[0] === "高" ? "high" : "mid") + '"></span><b>' + esc(x[1]) + "</b>"
            + (x[2] ? '<span style="color:var(--muted)">[' + esc(x[2]) + "]</span>" : "")
            + '<span style="color:var(--muted)">' + esc(x[3]) + "</span></div>";
        }).join("") + "</div>", "route");
    }
  }
  return cards;
}
const TYPE_GOV = {
  包装数组缺失: "packaging", 包装数组异常: "packaging", 中包存在性冲突: "packaging", 包装层级冲突: "packaging",
  出货单位冲突: "packaging", 包装层级与路线冲突: "packaging", 包装层级不一致: "packaging",
  盒巾长宽匹配异常: "adjudication", 板化规则待确认: "adjudication",
  设备规则未覆盖: "device", 加赠设备规则未覆盖: "device",
  品类模板未覆盖: "route", 临时规则应用: "route", 卫卷小包尺寸无法计算: "supplement", 包装形态待补: "supplement",
};
function govNameOfType(t) { const g = TYPE_GOV[t]; return g ? (GOV_META[g] || {}).name || "" : ""; }

/* ---------- 详情抽屉与全屏详情页共用 ---------- */
function anaCardHtml(c) {
  return '<div class="ana-card"><div class="ah">'
    + '<span class="ana-ico" style="background:var(--' + (GOV_COLOR[c.gov] || "blue") + '-soft);color:var(--' + (GOV_COLOR[c.gov] || "blue") + ')">' + ic(c.icon, 15) + "</span>"
    + '<span class="nm">' + esc(c.name) + '</span><span class="st">'
    + (c.status === "ok" ? '<span class="tag green">' + ic("check-circle", 11) + " " + esc(c.text) + "</span>"
      : c.status === "warn" ? '<span class="tag orange">' + ic("alert-triangle", 11) + " " + esc(c.text) + "</span>"
      : c.status === "bad" ? '<span class="tag red">' + ic("alert-octagon", 11) + " " + esc(c.text) + "</span>"
      : '<span class="tag">' + ic("ban", 11) + " " + esc(c.text) + "</span>")
    + "</span></div>"
    + '<div class="ab">' + c.html + "</div></div>";
}
function anaSecHtml(sec) {
  return sec === "route"
    ? ic("route", 13) + " MPS 工艺路线专项校验<span class='sec-note'>独立板块 · 每次基于当前 MDM 源表实时重算（不计入全局 MDM 阻断）</span>"
    : ic("check-circle", 13) + " 一般性 MDM 质量校验<span class='sec-note'>数据完整性 / 数值 / 包装 / 工艺属性</span>";
}
function skuTagsHtml(r) {
  return (r.blocking ? '<span class="tag solid-red">' + ic("alert-octagon", 11) + "阻断</span>" : '<span class="tag green">' + ic("check", 11) + "正常</span>")
    + (r.status ? '<span class="tag ' + (r.status === "有效" ? "green" : "red") + '">' + esc(r.status) + "</span>" : "")
    + (r.pre ? '<span class="tag' + (r.pre === "Y" ? " orange" : "") + '">预失效 ' + esc(r.pre) + "</span>" : "")
    + '<span class="tag blue">' + esc(r.cat) + "</span>"
    + (r.ruleCat !== "其他" ? '<span class="tag">规则品类 ' + esc(r.ruleCat) + "</span>" : "")
    + (r.vcode ? '<span class="tag">V码 ' + esc(r.vcode) + "</span>" : "")
    + (r.score !== null ? '<span class="tag">完整度 ' + r.score + "%</span>" : "")
    + '<span class="tag">异常 ' + (r.issueCount || 0) + " 项</span>";
}

/* ---------- 详情抽屉（表格快速查看） ---------- */
function quickDetailSectionsHtml(r, view = normalizeQuickDetailView(state.quickDetailView)) {
  let h = "";
  for (const section of view.sections) {
    if (!section.enabled) continue;
    const keys = section.fields.filter((key) => !view.hideEmpty || (r[key] !== null && r[key] !== undefined && String(r[key]).trim() !== ""));
    if (!keys.length) continue;
    h += '<section class="quick-detail-section" data-quick-section="' + esc(section.id) + '"><h4>' + esc(section.title) + '</h4><dl class="quick-detail-grid columns-' + view.columns + '">' + keys.map((key) => '<div data-field="' + esc(key) + '"><dt>' + esc(schemaByKey.get(key).label) + '</dt><dd>' + formatDpFieldVal(r, key) + '</dd></div>').join('') + '</dl></section>';
  }
  return h;
}
function renderDetail() {
  const drawer = document.getElementById("detailDrawer");
  const mask = document.getElementById("drawerMask");
  if (!state.detail || !byMaterial.has(state.detail) || state.detailPage) {
    drawer.classList.remove("open"); mask.classList.remove("open");
    document.getElementById("detailBody").innerHTML = "";
    return;
  }
  const r = byMaterial.get(state.detail);
  document.getElementById("detailTitle").textContent = "物料速览";
  document.getElementById("detailCode").textContent = r.material;
  document.getElementById("detailActs").innerHTML =
    '<button class="tb-btn" data-act="quick-config-open">' + ic("sliders", 13) + " 自定义速览</button>"
    + '<button class="tb-btn" data-act="detail-copy">' + ic("copy", 13) + " 复制编码</button>"
    + '<button class="tb-btn" data-act="detail-add-basket">' + ic("plus", 13) + " 加入对比</button>"
    + '<button class="tb-btn" data-act="detail-copy-info">' + ic("copy", 13) + " 复制信息</button>"
    + '<button class="tb-btn" data-act="detail-fullscreen">' + ic("maximize", 13) + " 完整详情</button>"
    + '<button class="tb-btn" data-act="close-drawer">' + ic("x", 13) + " 关闭</button>";
  const view = normalizeQuickDetailView(state.quickDetailView);
  const cards = view.showAnalysis ? analyzeSku(r) : [];
  let h = view.showDescription ? '<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:13px 15px;margin-bottom:12px">'
    + '<div style="font-size:15px;font-weight:750;line-height:1.5">' + esc(r.desc) + "</div>"
    + "</div>" : "";
  h += quickDetailSectionsHtml(r, view);
  if (view.showAnalysis) {
    h += '<details class="quick-detail-more"><summary>查看校验分析（' + cards.length + ' 项）</summary>';
    let lastSec = null;
    for (const c of cards) {
      if (c.sec !== lastSec) { lastSec = c.sec; h += '<div class="ana-sec">' + anaSecHtml(c.sec) + "</div>"; }
      h += anaCardHtml(c);
    }
    h += '</details>';
  }
  if (view.showAllFields) {
    h += '<details class="quick-detail-more"><summary>查看全部 MDM 字段</summary>';
    /* 全字段表（仅展示主 MDM 字段，不含 MPS 工艺路线专属字段） */
    const mdmKeys = state.order.filter((k) => !MDM_HIDDEN_KEYS.has(k));
    h += '<div class="ana-card"><div class="ah"><span class="ana-ico" style="background:var(--blue-soft);color:var(--blue)">' + ic("table", 15) + "</span><span class='nm'>全部 MDM 字段（" + mdmKeys.length + "）</span></div><div class='ab' style='padding:0'>";
    const groups = {};
    mdmKeys.forEach((k) => { const s = schemaByKey.get(k); (groups[s.group] = groups[s.group] || []).push(k); });
    const reqMap = requiredMapFor(r.ruleCat);
    h += '<table class="fields-table"><tbody>';
    for (const g of Object.keys(groups)) {
      h += '<tr class="grp"><td colspan="2">' + esc(g) + "</td></tr>";
      for (const k of groups[g]) {
        const s = schemaByKey.get(k);
        const req = reqMap.has(k);
        let v = r[k];
        if (s.type === "bool" || s.type === "flags") v = boolCell(k, v, r);
        else if (v === null || v === undefined || v === "") v = '<span style="color:var(--subtle)">—</span>';
        else v = esc(fmt(v));
        h += "<tr><td class='k'>" + esc(s.label) + (req ? '<span class="req-star" title="品类必填">*</span>' : "") + "</td><td>" + v + "</td></tr>";
      }
    }
    h += "</tbody></table></div></div></details>";
  }
  document.getElementById("detailBody").innerHTML = h;
  drawer.classList.add("open"); mask.classList.add("open");
}

/* 速览编辑使用草稿，勾选与拖拽只更新编辑区，保存后才应用到抽屉。 */
let quickDetailDraft = null, quickDetailSectionId = "", quickDetailSearch = "";
function quickDetailActiveSection() { return quickDetailDraft && quickDetailDraft.sections.find((s) => s.id === quickDetailSectionId); }
function openQuickDetailConfig() {
  quickDetailDraft = normalizeQuickDetailView(state.quickDetailView);
  quickDetailSectionId = quickDetailDraft.sections[0].id; quickDetailSearch = "";
  renderQuickDetailEditor();
  const mask = document.getElementById("modal-mask");
  mask.classList.add("open");
  mask.onclick = (e) => { if (e.target === mask) closeQuickDetailConfig(); };
  syncBodyScrollLock();
  document.getElementById("quickConfigTitle").focus({ preventScroll: true });
}
function closeQuickDetailConfig() {
  if (!document.getElementById("quickDetailConfig")) return;
  quickDetailDraft = null;
  const mask = document.getElementById("modal-mask"), box = document.getElementById("modal-box");
  mask.classList.remove("open"); mask.onclick = null;
  box.classList.remove("quick-config-box"); box.innerHTML = "";
  syncBodyScrollLock();
  const button = document.querySelector('#detailActs [data-act="quick-config-open"]');
  if (button) button.focus({ preventScroll: true });
}
function renderQuickDetailEditor() {
  if (!quickDetailDraft) return;
  const box = document.getElementById("modal-box"), top = box.scrollTop;
  box.classList.add("quick-config-box");
  const opt = (key, label) => '<label><input type="checkbox" data-quick-option="' + key + '"' + (quickDetailDraft[key] ? ' checked' : '') + '> ' + label + '</label>';
  box.innerHTML = '<div id="quickDetailConfig" role="dialog" aria-modal="true" aria-labelledby="quickConfigTitle"><h3 id="quickConfigTitle" tabindex="-1">自定义速览</h3>'
    + '<p>选中分区后配置字段；拖拽调整顺序，也可使用移动按钮。保存后应用于所有物料的速览。</p>'
    + '<div class="quick-config-options"><label>每行字段 <select aria-label="速览每行字段数" data-quick-option="columns"><option value="2"' + (quickDetailDraft.columns === 2 ? ' selected' : '') + '>2 个</option><option value="3"' + (quickDetailDraft.columns === 3 ? ' selected' : '') + '>3 个</option></select></label>'
    + opt('hideEmpty','隐藏空值') + opt('showDescription','物料说明') + opt('showAnalysis','校验分析入口') + opt('showAllFields','全部字段入口') + '</div>'
    + '<div class="quick-config-layout"><div><div class="quick-config-heading"><b>展示分区</b><button class="mini-btn" data-act="quick-section-add"' + (quickDetailDraft.sections.length >= 20 ? ' disabled' : '') + '>＋ 新增分区</button></div><div id="quickConfigSections">'
    + quickDetailDraft.sections.map((s, i) => '<div class="quick-config-section' + (s.id === quickDetailSectionId ? ' active' : '') + '" data-quick-section="' + esc(s.id) + '">'
      + '<div class="quick-section-top"><button type="button" class="quick-drag" draggable="true" data-quick-drag="section" data-v="' + esc(s.id) + '" aria-label="拖动分区：' + esc(s.title) + '" title="拖动调整分区顺序">⠿</button><input aria-label="分区名称 ' + (i + 1) + '" maxlength="60" value="' + esc(s.title) + '" data-quick-title="' + esc(s.id) + '"></div>'
      + '<div class="quick-section-controls"><label><input type="checkbox" data-quick-enabled="' + esc(s.id) + '"' + (s.enabled ? ' checked' : '') + '> 显示</label><button class="mini-btn" data-act="quick-section-select" data-v="' + esc(s.id) + '" aria-label="配置' + esc(s.title) + '字段">配置字段</button>'
      + '<button class="mini-btn" data-act="quick-section-move" data-v="' + esc(s.id) + '" data-delta="-1" title="分区上移"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="mini-btn" data-act="quick-section-move" data-v="' + esc(s.id) + '" data-delta="1" title="分区下移"' + (i === quickDetailDraft.sections.length - 1 ? ' disabled' : '') + '>↓</button>'
      + '<button class="mini-btn" data-act="quick-section-remove" data-v="' + esc(s.id) + '" aria-label="删除' + esc(s.title) + '分区"' + (quickDetailDraft.sections.length === 1 ? ' disabled' : '') + '>×</button></div></div>').join('')
    + '</div></div><div class="quick-config-fields"><div class="quick-config-heading"><b id="quickConfigFieldTitle"></b></div><div id="quickConfigSelected" class="quick-config-selected"></div>'
    + '<label class="sr-only" for="quickConfigFieldSearch">搜索速览字段</label><input id="quickConfigFieldSearch" placeholder="搜索要添加的字段…" value="' + esc(quickDetailSearch) + '"><div id="quickConfigChoices" class="quick-config-choices"></div></div></div>'
    + '<div id="quickConfigError" role="alert"></div><div class="macts"><span id="quickConfigStatus">' + esc(personalConfig.status) + '</span><button class="tool-btn" data-act="quick-config-reset">恢复默认</button><button class="tool-btn" data-act="quick-config-cancel">取消</button><button class="tool-btn primary" data-act="quick-config-save">保存配置</button></div></div>';
  renderQuickDetailDraftFields(); renderQuickDetailFieldChoices(); box.scrollTop = top;
}
function renderQuickDetailDraftFields() {
  const section = quickDetailActiveSection(); if (!section) return;
  document.getElementById("quickConfigFieldTitle").textContent = section.title + ' · 已选 ' + section.fields.length + ' 个字段';
  document.getElementById("quickConfigSelected").innerHTML = section.fields.map((key, i) => '<span class="quick-config-chip" draggable="true" data-quick-drag="field" data-v="' + esc(key) + '" title="拖动调整字段顺序">'
    + '<span class="quick-drag">⠿</span><span>' + esc(schemaByKey.get(key).label) + '</span><button data-act="quick-field-move" data-v="' + esc(key) + '" data-delta="-1" aria-label="前移' + esc(schemaByKey.get(key).label) + '"' + (i === 0 ? ' disabled' : '') + '>‹</button><button data-act="quick-field-move" data-v="' + esc(key) + '" data-delta="1" aria-label="后移' + esc(schemaByKey.get(key).label) + '"' + (i === section.fields.length - 1 ? ' disabled' : '') + '>›</button><button data-act="quick-field-remove" data-v="' + esc(key) + '" aria-label="移除' + esc(schemaByKey.get(key).label) + '">×</button></span>').join('')
    || '<div class="quick-config-note">在下方选择要展示的字段</div>';
  document.querySelectorAll('#quickConfigChoices input[data-quick-field]').forEach((input) => { input.checked = section.fields.includes(input.dataset.quickField); });
}
function renderQuickDetailFieldChoices() {
  const section = quickDetailActiveSection(); if (!section) return;
  const query = quickDetailSearch.trim().toLowerCase();
  const keys = schemaKeys.filter((key) => !MDM_HIDDEN_KEYS.has(key) && (!query || (schemaByKey.get(key).label + ' ' + key + ' ' + schemaByKey.get(key).group).toLowerCase().includes(query)));
  document.getElementById("quickConfigChoices").innerHTML = keys.map((key) => '<label><input type="checkbox" data-quick-field="' + esc(key) + '"' + (section.fields.includes(key) ? ' checked' : '') + '><span>' + esc(schemaByKey.get(key).label) + '</span><small>' + esc(schemaByKey.get(key).group) + '</small></label>').join('') || '<div class="quick-config-note">没有匹配的 MDM 字段</div>';
}
function moveQuickDetailItem(kind, source, target) {
  if (!quickDetailDraft) return false;
  const section = quickDetailActiveSection(), list = kind === "section" ? quickDetailDraft.sections : section ? section.fields : [];
  const from = list.findIndex((item) => (kind === "section" ? item.id : item) === source);
  const to = list.findIndex((item) => (kind === "section" ? item.id : item) === target);
  if (from < 0 || to < 0 || from === to) return false;
  const [item] = list.splice(from, 1); list.splice(to, 0, item); return true;
}
function saveQuickDetailConfig() {
  if (!quickDetailDraft) return;
  try {
    validateQuickDetailView(quickDetailDraft);
    const next = normalizeQuickDetailView(quickDetailDraft);
    if (!next.sections.some((s) => s.enabled && s.fields.length)) throw new Error("请至少保留一个已显示且包含字段的分区");
    state.quickDetailView = next; saveState(); renderDetail(); closeQuickDetailConfig();
    toast(personalConfig.available ? "已保存速览配置" : "已应用速览配置，暂存浏览器；本机保存状态可在个人配置中查看");
  } catch (e) { document.getElementById("quickConfigError").textContent = e.message; }
}
function requiredMapFor(ruleCat) {
  const set = new Set();
  const groups = (DATASET.fieldRules || {})[ruleCat] || [];
  for (const g of groups) if (g.required) g.fields.forEach((f) => set.add(f));
  return set;
}

/* ---------- 全屏详情页（深链直达 / 抽屉一键展开 · 多维表格自定义视窗画布 + 条件路由引擎）---------- */
const KEY_FIELDS = [
  "material", "vcode", "cat", "formula", "stock", "stockCat", "spec", "load",
  "unit", "net", "netNG", "gross", "quant", "pack", "brand", "series",
  "status", "pre", "created", "updated", "prodType", "ecom",
];

function formatDpFieldVal(r, k) {
  const s = schemaByKey.get(k);
  let v = r[k];
  if (s && (s.type === "bool" || s.type === "flags")) return boolCell(k, v, r);
  if (k === "created" || k === "updated") return v ? esc(String(v).slice(0, 10)) : '<span style="color:var(--subtle)">—</span>';
  if (v === null || v === undefined || v === "") return '<span style="color:var(--subtle)">—</span>';
  return esc(fmt(v));
}

/* 详情页的标识信息只展示一次；分类字段若已在下方表格中展示，不再堆成标签。 */
function renderDetailIdentity(r, banner, otherFields) {
  const identityKeys = new Set(["material", "vcode", "desc", "spec", "status", "pre", "blocking", "issueCount"]);
  const classificationKeys = new Set(["制造类别", "品类一级", "品类二级", "cat", "ruleCat", "formula", "stock"]);
  const extraKeys = [...new Set(banner && Array.isArray(banner.fields) ? banner.fields : [])]
    .filter((k) => schemaByKey.has(k) && !identityKeys.has(k) && !(classificationKeys.has(k) && otherFields.has(k)));
  const codeOrder = [...new Set([...(banner && Array.isArray(banner.fields) ? banner.fields : []).filter((k) => ["material", "vcode", "spec"].includes(k)), "material", "vcode", "spec"])];
  const item = (k, label) => '<div class="dp-summary-kv" data-field="' + esc(k) + '"><dt>' + esc(label || (schemaByKey.get(k) || {}).label || k) + '</dt><dd>' + formatDpFieldVal(r, k) + '</dd></div>';
  let status = (r.status ? '<span class="tag ' + (r.status === "有效" ? 'green' : 'red') + '">' + esc(r.status) + '</span>' : '')
    + (r.pre ? '<span class="tag' + (r.pre === "Y" ? ' orange' : '') + '">预失效 ' + esc(r.pre) + '</span>' : '')
    + (r.blocking ? '<span class="tag solid-red">' + ic("alert-octagon", 11) + '阻断</span>' : '')
    + '<span class="tag ' + (r.issueCount ? 'red' : 'green') + '">' + ('MDM 异常 ' + (r.issueCount || 0) + ' 项') + '</span>';
  return '<section class="dp-identity" aria-label="物料摘要">'
    + '<div class="dp-identity-top"><h1 class="dp-identity-name">' + esc(r.desc || "未填写物料说明") + '</h1><div class="dp-identity-status">' + status + '</div></div>'
    + '<dl class="dp-identity-codes">' + codeOrder.filter((k) => k !== "vcode" || r.vcode && r.vcode !== r.material).map((k) => item(k, k === "material" ? "物料编码" : k === "vcode" ? "V码" : "规格")).join('') + '</dl>'
    + (extraKeys.length ? '<dl class="dp-identity-extra">' + extraKeys.map((k) => item(k)).join('') + '</dl>' : '')
    + '</section>';
}
function closeDetailViewSettings() {
  const content = document.getElementById("dpViewSettings");
  if (!content) return;
  const mask = document.getElementById("modal-mask");
  mask.classList.remove("open"); mask.onclick = null;
  document.getElementById("modal-box").classList.remove("dp-settings-box");
  document.getElementById("modal-box").innerHTML = "";
  syncBodyScrollLock();
  const button = document.querySelector('#dpActs [data-act="open-dp-view-settings"]');
  if (button) button.focus({ preventScroll: true });
}
function openDetailViewSettings() {
  const r = byMaterial.get(state.detail); if (!r) return;
  const { tpl, reason } = matchDpTemplateForSku(r);
  const list = state.dpTemplates || [];
  const mask = document.getElementById("modal-mask"), box = document.getElementById("modal-box");
  box.classList.add("dp-settings-box");
  box.innerHTML = '<div id="dpViewSettings"><h3>视窗设置</h3>'
    + '<p>当前视窗：<b>' + esc(tpl.name) + '</b></p>'
    + '<label class="dp-settings-label" for="dpTplPreviewSel">预览视窗</label><select id="dpTplPreviewSel" class="dp-tpl-sel">'
    + '<option value=""' + (!state.dpOverrideTplId ? ' selected' : '') + '>按生效条件自动匹配</option>'
    + list.map((t) => '<option value="' + esc(t.id) + '"' + (state.dpOverrideTplId === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('') + '</select>'
    + '<details class="dp-match-reason"><summary>查看匹配依据</summary><p>' + esc(reason) + '</p></details>'
    + '<div class="dp-settings-links"><button class="tool-btn" data-act="open-dp-config-tpl" data-tpl="' + esc(tpl.id) + '">' + ic("edit", 13) + ' 编辑视窗与字段</button>'
    + '<button class="tool-btn" data-act="open-dp-config-rules">' + ic("filter", 13) + ' 配置生效条件</button></div>'
    + '<div class="macts"><button class="tool-btn primary" data-act="close-dp-view-settings">完成</button></div></div>';
  mask.classList.add("open");
  mask.onclick = (e) => { if (e.target === mask) closeDetailViewSettings(); };
  syncBodyScrollLock();
  document.getElementById("dpTplPreviewSel").focus({ preventScroll: true });
}

function renderDpBlock(r, blk, reqMap) {
  const span = [3, 4, 5, 6, 7, 8, 9, 10, 12].includes(Number(blk.span)) ? Number(blk.span) : 6;
  const fields = Array.isArray(blk.fields) ? blk.fields.filter((k) => schemaByKey.has(k) && !MDM_HIDDEN_KEYS.has(k)) : [];
  const subBoxes = Array.isArray(blk.subBoxes) ? blk.subBoxes : [];
  const compareRows = Array.isArray(blk.compareRows) ? blk.compareRows : [];

  let bodyHtml = "";

  /* 自定义的其他摘要区块采用普通键值排列，不再自动重复状态和标识。 */
  if (blk.type === "banner") {
    bodyHtml = '<dl class="dp-banner-fields">' + fields.map((k) => '<div class="dp-summary-kv" data-field="' + esc(k) + '"><dt>' + esc((schemaByKey.get(k) || {}).label || k) + '</dt><dd>' + formatDpFieldVal(r, k) + '</dd></div>').join('') + '</dl>';
  }
  /* 2. 横向指标条表（草图底部卷类：节距 | 卷高 | 节数 | 米数 | 净含量 | 毛重/卷，或 品类一级|品类二级|品类三级） */
  else if (blk.type === "strip_table") {
    if (fields.length) {
      bodyHtml += '<div style="overflow-x:auto"><table class="dp-strip-table"><thead><tr>'
        + fields.map((k) => "<th>" + esc((schemaByKey.get(k) || {}).label || k) + "</th>").join("")
        + "</tr></thead><tbody><tr>"
        + fields.map((k) => "<td>" + formatDpFieldVal(r, k) + "</td>").join("")
        + "</tr></tbody></table></div>";
    }
  }
  /* 3. 常规字段网格（适用于 fields / pack_SpecBox / dept_compare 的上部常规字段） */
  else if (fields.length) {
    bodyHtml += '<div class="dp-fgrid">'
      + fields.map((k) => {
          const lb = (schemaByKey.get(k) || {}).label || k;
          const req = reqMap.has(k);
          return '<div class="dp-fcell">'
            + '<div class="fc-k"><span>' + esc(lb) + (req ? '<span class="req-star" title="品类必填">*</span>' : "") + '</span></div>'
            + '<div class="fc-v">' + formatDpFieldVal(r, k) + "</div>"
            + "</div>";
        }).join("")
      + "</div>";
  }

  /* 4. 嵌套子框（草图右上：中包 长×宽×高 / 外包装 长×宽×高） */
  if (subBoxes.length) {
    bodyHtml += '<div class="dp-subbox-list">'
      + subBoxes.map((sb) => {
          const sfs = (sb.fields || []).filter((k) => schemaByKey.has(k));
          /* 自动合成前3个尺寸字段为 长×宽×高 表达式 */
          const dimVals = sfs.slice(0, 3).map((k) => fmt(r[k]) || "—");
          const expr = dimVals.length === 3 ? dimVals.join(" × ") : "";
          return '<div class="dp-subbox">'
            + '<div class="sb-title"><span>' + ic("package", 12) + " " + esc(sb.title || "尺寸规格子框") + '</span>'
            + (expr ? '<span class="sb-expr">' + esc(expr) + "</span>" : "")
            + "</div>"
            + '<div class="sb-items">'
            + sfs.map((k) => '<span>' + esc((schemaByKey.get(k) || {}).label || k) + "：<b>" + formatDpFieldVal(r, k) + "</b></span>").join("")
            + "</div></div>";
        }).join("")
      + "</div>";
  }

  /* 5. 跨部门相似字段横向对比（草图左下角：五级架构 vs MDM vs 市场部/OEM 横向并排对比） */
  if (compareRows.length) {
    bodyHtml += '<div class="dp-cmp-wrap">'
      + '<div class="dp-cmp-hd"><span>' + ic("swap", 12) + ' 跨部门相似字段横向对比（五级架构 / 市场部 / MDM / 生产）</span>'
      + '<span style="font-weight:500;font-size:11px">值不一致时自动高亮提示 · 字段可自由增删</span></div>'
      + '<table class="dp-cmp-table"><tbody>'
      + compareRows.map((cr) => {
          const cfs = (cr.fields || []).filter((k) => schemaByKey.has(k));
          const nonEmptyVals = cfs.map((k) => fmt(r[k]).trim()).filter(Boolean);
          const hasDiff = new Set(nonEmptyVals).size > 1;
          return "<tr>"
            + '<td class="dim-name">' + esc(cr.dim || "对比维度") + (hasDiff ? ' <span class="tag orange" style="font-size:10px;padding:0 5px" title="不同部门字段值存在差异">差异</span>' : "") + "</td>"
            + "<td>"
            + (cfs.length ? cfs.map((k) => {
                const lb = (schemaByKey.get(k) || {}).label || k;
                return '<span class="dept-cell' + (hasDiff ? " diff-warn" : "") + '">'
                  + '<span class="dept-tag">' + esc(lb) + '：</span>'
                  + '<span class="dept-val">' + formatDpFieldVal(r, k) + "</span>"
                  + "</span>";
              }).join("") : '<span style="color:var(--subtle);font-size:12px">暂未配置对比字段</span>')
            + "</td></tr>";
        }).join("")
      + "</tbody></table></div>";
  }

  if (!bodyHtml) {
    bodyHtml = '<div style="color:var(--subtle);font-size:12px;padding:8px 0">此区块暂未添加字段，可在「视窗设置」中编辑</div>';
  }

  return '<div class="dp-block span-' + span + '">'
    + '<div class="dp-block-hd">'
    + '<span class="bh-title">' + ic(blk.type === "dept_compare" ? "swap" : blk.type === "pack_SpecBox" ? "package" : blk.type === "strip_table" ? "ruler" : "layers", 14) + " " + esc(blk.title || "未命名区块") + "</span>"
    + '<button class="mini-btn" style="padding:2px 8px;min-height:24px;font-size:11px" data-act="open-dp-config-tpl" data-tpl="' + esc(blk._tplId || "") + '" title="编辑此区块与字段">' + ic("sliders", 11) + " 配置字段</button>"
    + "</div>"
    + '<div class="dp-block-bd">' + bodyHtml + "</div>"
    + "</div>";
}

function renderDetailPage() {
  const page = document.getElementById("detailPage");
  const body = document.getElementById("detailPageBody");
  const r = state.detail && byMaterial.has(state.detail) ? byMaterial.get(state.detail) : null;
  if (!r || !state.detailPage) { page.classList.remove("open"); body.innerHTML = ""; return; }
  page.classList.add("open");

  const matched = matchDpTemplateForSku(r);
  const tpl = matched.tpl;
  const mdmKeys = state.order.filter((k) => !MDM_HIDDEN_KEYS.has(k));

  document.getElementById("dpTitle").textContent = "物料详情";
  document.getElementById("dpCode").textContent = "";
  document.getElementById("dpActs").innerHTML =
    '<button class="tb-btn" data-act="detail-add-basket">' + ic("plus", 13) + ' 加入对比</button>'
    + '<button class="tb-btn" data-act="detail-copy-link">' + ic("link", 13) + ' 复制链接</button>'
    + '<button class="tb-btn" data-act="open-dp-view-settings">' + ic("sliders", 13) + ' 视窗设置</button>'
    + '<details class="dp-more"><summary class="tb-btn">更多 <span aria-hidden="true">▾</span></summary><div class="dp-more-menu">'
    + '<button data-act="toggle-dp-classic">' + ic("table", 13) + (state.dpShowClassicCols ? ' 收起全量字段与校验' : ' 展开全量字段与校验') + '</button>'
    + '<button data-act="detail-copy">' + ic("copy", 13) + ' 复制物料编码</button>'
    + '<button data-act="detail-export">' + ic("download", 13) + ' 导出 JSON</button></div></details>';

  const reqMap = requiredMapFor(r.ruleCat);
  const blocks = tpl.blocks || [];
  const banner = blocks.find((b) => b.type === "banner");
  const otherFields = new Set(blocks.filter((b) => b.type !== "banner").flatMap((b) => b.fields || []));
  let h = renderDetailIdentity(r, banner, otherFields);
  h += '<div class="dp-canvas-grid">';
  for (const blk of blocks) {
    if (blk === banner) {
      // 摘要的字段已合并到上方；保留用户配置的嵌套尺寸框和横向对比。
      if ((blk.subBoxes || []).length || (blk.compareRows || []).length) h += renderDpBlock(r, { ...blk, type: "fields", fields: [], _tplId: tpl.id }, reqMap);
      continue;
    }
    h += renderDpBlock(r, { ...blk, _tplId: tpl.id }, reqMap);
  }
  h += "</div>";

  /* 底部：内置 MDM & MPS 校验摘要条 + 可选展开的经典三栏全量明细 */
  const cards = analyzeSku(r);
  const badCards = cards.filter((c) => c.status === "bad" || c.status === "warn");
  h += '<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
    + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px">'
    + '<b style="color:var(--blue-deep)">' + ic("clipboard", 13) + " 单品自动校验摘要：</b>"
    + (badCards.length
        ? badCards.map((c) => '<span class="tag ' + (c.status === "bad" ? "red" : "orange") + '">' + ic(c.icon, 11) + esc(c.name) + "：" + esc(c.text) + "</span>").join("")
        : '<span class="tag green">' + ic("check-circle", 11) + " 全部校验通过</span>")
    + "</div>"
    + '<button class="mini-btn" data-act="toggle-dp-classic">' + ic("table", 12) + (state.dpShowClassicCols ? " 收起全量 " + mdmKeys.length + " 项 MDM 字段与校验卡片 ▲" : " 展开全量 " + mdmKeys.length + " 项 MDM 字段与校验卡片 ▾") + "</button>"
    + "</div>";

  if (state.dpShowClassicCols) {
    const kvItem = (k) => {
      const s = schemaByKey.get(k);
      const req = reqMap.has(k);
      return '<div class="fg-item"><dt>' + esc(s.label) + (req ? '<span class="req-star" title="品类必填">*</span>' : "") + "</dt><dd>" + formatDpFieldVal(r, k) + "</dd></div>";
    };
    h += '<div class="dp-cols">';
    h += '<div class="dp-col dp-col-key">'
      + '<div class="dp-col-hd">' + ic("star", 12) + " SKU 关键信息</div>"
      + '<div class="dp-info-card">'
      + '<div style="font-size:15px;font-weight:750;line-height:1.5">' + esc(r.desc) + "</div>"
      + '<div class="tags">' + skuTagsHtml(r) + "</div>"
      + '<div class="key-grid">' + KEY_FIELDS.filter((k) => schemaByKey.has(k)).map(kvItem).join("") + "</div>"
      + "</div></div>";

    const groups = {};
    mdmKeys.forEach((k) => { const s = schemaByKey.get(k); (groups[s.group] = groups[s.group] || []).push(k); });
    h += '<div class="dp-col dp-col-fields">'
      + '<div class="dp-col-hd">' + ic("table", 12) + " 全部 MDM 字段明细 · " + Object.keys(groups).length + " 组 " + mdmKeys.length + " 项 · <span class='req-star'>*</span> 品类必填</div>";
    h += '<div class="fg-grid">' + Object.keys(groups).map((g) => {
      return '<div class="fg-card"><div class="fg-hd"><span>' + esc(g) + '</span><span class="fg-n">' + groups[g].length + " 项</span></div>"
        + '<div class="fg-list">' + groups[g].map(kvItem).join("") + "</div></div>";
    }).join("") + "</div></div>";

    h += '<div class="dp-col dp-col-checks">'
      + '<div class="dp-col-hd">' + ic("clipboard", 12) + " 校验信息 · 内置分析 " + cards.length + " 项 · 异常 " + (r.issueCount || 0) + " 项"
      + (r.blocking ? " · <b style='color:var(--red)'>阻断</b>" : "") + "</div>";
    let secHtml = "";
    let lastSec = null;
    for (const c of cards) {
      if (c.sec !== lastSec) {
        if (secHtml) h += '<div class="dp-ana-grid">' + secHtml + "</div>";
        lastSec = c.sec;
        secHtml = "";
        h += '<div class="dp-sec-sub">' + anaSecHtml(c.sec) + "</div>";
      }
      secHtml += anaCardHtml(c);
    }
    if (secHtml) h += '<div class="dp-ana-grid">' + secHtml + "</div>";
    h += "</div></div>";
  }

  body.innerHTML = h;
}

/* ---------- 单品详情视窗 · 模板画布与条件路由配置器（类多维表格自定义视窗插件） ---------- */
function buildFieldOptionsHtml(selectedKey) {
  const groups = {};
  schemaKeys.forEach((k) => {
    if (MDM_HIDDEN_KEYS.has(k)) return;
    const s = schemaByKey.get(k);
    (groups[s.group] = groups[s.group] || []).push(s);
  });
  return Object.keys(groups).map((g) => {
    return '<optgroup label="' + esc(g) + '">'
      + groups[g].map((s) => '<option value="' + esc(s.key) + '"' + (s.key === selectedKey ? " selected" : "") + ">" + esc(s.label) + " (" + esc(s.key) + ")</option>").join("")
      + "</optgroup>";
  }).join("");
}

function countTemplateHits() {
  const counts = {};
  const list = state.dpTemplates || [];
  list.forEach((t) => { counts[t.id] = 0; });
  const prevOverride = state.dpOverrideTplId;
  state.dpOverrideTplId = "";
  for (const r of rows) {
    const m = matchDpTemplateForSku(r);
    if (m && m.tpl) counts[m.tpl.id] = (counts[m.tpl.id] || 0) + 1;
  }
  state.dpOverrideTplId = prevOverride;
  return counts;
}

function renderDpSortableFields(fields, context) {
  const attrs = Object.entries(context).map(([k, v]) => ' data-' + k + '="' + esc(String(v)) + '"').join('');
  const deleteAct = context.kind === "compare" ? "dp-cmp-field-del" : context.kind === "subbox" ? "dp-subbox-field-del" : "dp-blk-field-del";
  return '<div class="cfg-sortable-fields"' + attrs + ' aria-label="拖拽调整字段顺序">'
    + fields.map((fk, fi) => {
      const label = (schemaByKey.get(fk) || {}).label || fk;
      return '<span class="cfg-field-chip" data-field-key="' + esc(fk) + '" data-fidx="' + fi + '" title="拖动调整字段顺序">'
        + '<span class="cfg-field-grip" aria-hidden="true">' + ic("grip", 12) + '</span><span class="cfg-field-name">' + esc(label) + '</span>'
        + '<button data-act="dp-template-field-move"' + attrs + ' data-fidx="' + fi + '" data-dir="-1"' + (fi === 0 ? ' disabled' : '') + ' aria-label="左移 ' + esc(label) + '">‹</button>'
        + '<button data-act="dp-template-field-move"' + attrs + ' data-fidx="' + fi + '" data-dir="1"' + (fi === fields.length - 1 ? ' disabled' : '') + ' aria-label="右移 ' + esc(label) + '">›</button>'
        + '<button data-act="' + deleteAct + '"' + attrs + ' data-fidx="' + fi + '" aria-label="移除 ' + esc(label) + '">✕</button></span>';
    }).join('')
    + (!fields.length ? '<span class="cfg-fields-empty">从上方选择字段后，可拖拽调整顺序</span>' : '') + '</div>';
}

function renderDpConfigModal() {
  const modal = document.getElementById("dpConfigModal");
  const body = document.getElementById("dpConfigBody");
  const acts = document.getElementById("dpConfigActs");
  if (!modal || !body) return;
  if (!state.dpConfigOpen) {
    modal.classList.remove("open");
    body.innerHTML = "";
    return;
  }
  modal.classList.add("open");

  const tpls = state.dpTemplates;
  if (!tpls.find((t) => t.id === state.dpEditingTplId) && tpls.length) {
    state.dpEditingTplId = tpls[0].id;
  }
  const curTpl = tpls.find((t) => t.id === state.dpEditingTplId) || tpls[0];
  const hitCounts = countTemplateHits();
  const fieldOptsEmpty = '<option value="">+ 选择要添加的字段（可跨区块重复）…</option>' + buildFieldOptionsHtml("");

  acts.innerHTML =
    '<button class="tb-btn" data-act="dp-cfg-tab" data-v="canvas"' + (state.dpConfigTab === "canvas" ? ' style="background:var(--blue);border-color:var(--blue);color:#fff"' : "") + '>' + ic("grid", 13) + " 1. 视窗画布与字段自由配置</button>"
    + '<button class="tb-btn" data-act="dp-cfg-tab" data-v="rules"' + (state.dpConfigTab === "rules" ? ' style="background:var(--blue);border-color:var(--blue);color:#fff"' : "") + '>' + ic("route", 13) + " 2. 条件路由逻辑配置页</button>"
    + '<button class="tb-btn" data-act="dp-reset-defaults">' + ic("refresh", 13) + " 恢复内置预设模板</button>"
    + '<button class="tb-btn" data-act="close-dp-config">' + ic("check", 13) + " 完成并返回看板</button>";

  /* ===== Tab 2：条件路由逻辑层专属配置页 ===== */
  if (state.dpConfigTab === "rules") {
    const sorted = [...tpls].sort((a, b) => (a.isDefault ? 1 : 0) - (b.isDefault ? 1 : 0) || (a.priority || 50) - (b.priority || 50));
    let h = '<div class="cfg-card" style="margin-bottom:14px">'
      + '<div class="cfg-card-hd"><span>' + ic("route", 14) + " 条件路由逻辑引擎 · 当条件成立时自动使用对应视窗模板</span>"
      + '<button class="mini-btn primary" data-act="dp-tpl-add">' + ic("plus", 12) + ' 新建视窗模板与路由规则</button></div>'
      + '<div class="cfg-card-bd">'
      + '<div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">匹配顺序：按优先级数值从小到大依次判断条件；第一个条件成立的模板立即生效；若全部未命中，则自动使用底部的「默认兜底模板」。当前全量数据共 <b>' + rows.length.toLocaleString() + "</b> 个 SKU。</div>";

    sorted.forEach((t, idx) => {
      const hits = hitCounts[t.id] || 0;
      h += '<div class="cfg-block-editor" style="border-left:4px solid ' + (t.isDefault ? "var(--teal)" : "var(--blue)") + '">'
        + '<div class="be-hd">'
        + '<span class="tag ' + (t.isDefault ? "teal" : "blue") + '">路由顺位 #' + (idx + 1) + "</span>"
        + '<b style="font-size:14px;color:var(--blue-deep)">' + esc(t.name) + "</b>"
        + (t.isDefault ? '<span class="tag green">默认兜底模板（无条件命中时生效）</span>' : '<span style="font-size:12px;color:var(--muted)">优先级权重：<input type="number" class="cfg-input" style="width:68px" data-act="dp-tpl-priority" data-tpl="' + esc(t.id) + '" value="' + (t.priority || 10) + '"></span>')
        + '<span class="tag ' + (hits > 0 ? "green" : "") + '" style="margin-left:auto">当前命中 <b>' + hits.toLocaleString() + "</b> 个 SKU</span>"
        + '<button class="mini-btn primary" data-act="dp-edit-tpl-canvas" data-tpl="' + esc(t.id) + '">' + ic("grid", 12) + " 配置该模板画布字段</button>"
        + "</div>";

      if (t.isDefault) {
        h += '<div style="font-size:12px;color:var(--muted)">该模板为默认兜底模板，无需设置前置条件。你也可以将其他模板设为默认兜底。</div>';
      } else {
        h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12.5px">'
          + "<span>当满足以下</span>"
          + '<select class="cfg-select" data-act="dp-tpl-logic" data-tpl="' + esc(t.id) + '">'
          + '<option value="OR"' + ((t.logic || "OR") === "OR" ? " selected" : "") + '>任一条件 (OR)</option>'
          + '<option value="AND"' + (t.logic === "AND" ? " selected" : "") + '>全部条件 (AND)</option>'
          + "</select>"
          + "<span>时，自动切换到《<b>" + esc(t.name) + "</b>》视窗：</span>"
          + '<button class="mini-btn" data-act="dp-cond-add" data-tpl="' + esc(t.id) + '">' + ic("plus", 12) + " 添加条件</button>"
          + "</div>";
        const conds = t.conditions || [];
        if (!conds.length) {
          h += '<div style="color:var(--orange);font-size:12px">尚未配置触发条件，请点击「+ 添加条件」</div>';
        } else {
          conds.forEach((c, ci) => {
            h += '<div class="cfg-rule-row">'
              + '<span class="tag">条件 ' + (ci + 1) + "</span>"
              + '<select class="cfg-select" data-act="dp-cond-field" data-tpl="' + esc(t.id) + '" data-idx="' + ci + '">' + buildFieldOptionsHtml(c.field) + "</select>"
              + '<select class="cfg-select" data-act="dp-cond-op" data-tpl="' + esc(t.id) + '" data-idx="' + ci + '">'
              + DP_OPERATORS.map((o) => '<option value="' + o.op + '"' + (c.op === o.op ? " selected" : "") + ">" + esc(o.label) + "</option>").join("")
              + "</select>"
              + (c.op === "empty" || c.op === "notEmpty" ? "" : '<input type="text" class="cfg-input" style="min-width:220px" placeholder="输入匹配值（属于多项用逗号分隔，如 面巾,纸巾,餐巾）" data-act="dp-cond-val" data-tpl="' + esc(t.id) + '" data-idx="' + ci + '" value="' + esc(c.val || "") + '">')
              + '<button class="mini-btn danger" data-act="dp-cond-del" data-tpl="' + esc(t.id) + '" data-idx="' + ci + '">' + ic("x", 12) + " 删除</button>"
              + "</div>";
          });
        }
      }
      h += "</div>";
    });
    h += "</div></div>";
    body.innerHTML = h;
    return;
  }

  /* ===== Tab 1：视窗画布与字段自由配置（左：模板列表，右：当前模板的条件 + 区块 + 跨部门横向对比插入） ===== */
  let h = '<div class="cfg-layout">';

  /* 左侧栏：模板列表与管理 */
  h += '<div class="cfg-side">'
    + '<div class="cfg-card">'
    + '<div class="cfg-card-hd"><span>' + ic("layers", 13) + " 视窗模板列表 (" + tpls.length + ")</span>"
    + '<button class="mini-btn primary" data-act="dp-tpl-add">' + ic("plus", 12) + ' 新建模板</button></div>'
    + '<div class="cfg-card-bd">';
  tpls.forEach((t) => {
    const on = t.id === curTpl.id;
    const hits = hitCounts[t.id] || 0;
    h += '<div class="cfg-tpl-item' + (on ? " on" : "") + '" data-act="dp-select-tpl" data-tpl="' + esc(t.id) + '">'
      + '<div class="ti-top"><span>' + esc(t.name) + '</span><span class="tag ' + (t.isDefault ? "teal" : "blue") + '">' + (t.isDefault ? "默认兜底" : "P" + (t.priority || 10)) + "</span></div>"
      + '<div class="ti-cond">' + esc(t.desc || "") + "</div>"
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--muted)">'
      + '<span>区块：<b>' + (t.blocks || []).length + '</b> 个 · 命中 <b>' + hits.toLocaleString() + "</b> SKU</span>"
      + '<span style="display:flex;gap:4px">'
      + '<button class="mini-btn" style="padding:1px 6px;min-height:20px;font-size:11px" data-act="dp-tpl-dup" data-tpl="' + esc(t.id) + '" title="复制此模板">复制</button>'
      + (tpls.length > 1 ? '<button class="mini-btn danger" style="padding:1px 6px;min-height:20px;font-size:11px" data-act="dp-tpl-del" data-tpl="' + esc(t.id) + '" title="删除此模板">删除</button>' : "")
      + "</span></div></div>";
  });
  h += "</div></div>";

  /* 左侧辅助说明卡 */
  h += '<div class="cfg-card">'
    + '<div class="cfg-card-hd"><span>' + ic("star", 13) + " 多维视窗自由配置说明</span></div>"
    + '<div class="cfg-card-bd" style="font-size:12px;color:var(--muted);line-height:1.6">'
    + "1. <b>字段可跨域重复</b>：同一个字段（如「品牌」「是否电商」「品类三级」）可同时添加到顶部通栏、常规卡片和跨部门横向对比表中。<br>"
    + "2. <b>插入跨部门相似字段横向对比</b>：在任意区块内点击「<b>+ 插入跨部门相似字段横向对比行</b>」，即可把五级架构、市场部、MDM、生产口径的相似字段放在同一行横向并排比对。<br>"
    + "3. <b>条件路由</b>：当单品满足模板设定的条件（如 <code>品类二级=非卷</code> 或 <code>规则品类=卫卷</code>）时自动切换至该模板。"
    + "</div></div></div>";

  /* 右侧主编辑区：当前模板的基础信息 + 触发条件 + 画布区块列表 */
  h += '<div class="cfg-main">';

  /* 1) 模板基本信息与触发条件 */
  h += '<div class="cfg-card" style="margin-bottom:14px">'
    + '<div class="cfg-card-hd"><span>' + ic("sliders", 14) + " 正在编辑模板：" + esc(curTpl.name) + "</span>"
    + '<div style="display:flex;gap:6px">'
    + (!curTpl.isDefault ? '<button class="mini-btn" data-act="dp-tpl-set-default" data-tpl="' + esc(curTpl.id) + '">设为默认兜底模板</button>' : '<span class="tag teal">当前为默认兜底模板</span>')
    + "</div></div>"
    + '<div class="cfg-card-bd">'
    + '<div style="display:grid;grid-template-columns:1fr 1.6fr 110px;gap:10px;margin-bottom:12px">'
    + '<label style="font-size:12px;color:var(--muted)">模板名称<input type="text" class="cfg-input" style="width:100%;margin-top:3px" data-act="dp-tpl-name" data-tpl="' + esc(curTpl.id) + '" value="' + esc(curTpl.name) + '"></label>'
    + '<label style="font-size:12px;color:var(--muted)">模板说明<input type="text" class="cfg-input" style="width:100%;margin-top:3px" data-act="dp-tpl-desc" data-tpl="' + esc(curTpl.id) + '" value="' + esc(curTpl.desc || "") + '"></label>'
    + '<label style="font-size:12px;color:var(--muted)">路由优先级<input type="number" class="cfg-input" style="width:100%;margin-top:3px" data-act="dp-tpl-priority" data-tpl="' + esc(curTpl.id) + '" value="' + (curTpl.priority || 10) + '"' + (curTpl.isDefault ? " disabled" : "") + "></label>"
    + "</div>";

  /* 触发条件区 */
  if (!curTpl.isDefault) {
    h += '<div style="background:#f4f9ff;border:1px solid #c4dbfb;border-radius:9px;padding:10px 12px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12.5px">'
      + '<b style="color:var(--blue-deep)">' + ic("route", 13) + " 模板生效条件：</b>"
      + "<span>当单品满足以下</span>"
      + '<select class="cfg-select" data-act="dp-tpl-logic" data-tpl="' + esc(curTpl.id) + '">'
      + '<option value="OR"' + ((curTpl.logic || "OR") === "OR" ? " selected" : "") + '>任一条件 (OR)</option>'
      + '<option value="AND"' + (curTpl.logic === "AND" ? " selected" : "") + '>全部条件 (AND)</option>'
      + "</select>"
      + "<span>时自动使用本模板</span>"
      + '<button class="mini-btn primary" style="margin-left:auto" data-act="dp-cond-add" data-tpl="' + esc(curTpl.id) + '">' + ic("plus", 12) + " 添加触发条件</button>"
      + "</div>";
    const conds = curTpl.conditions || [];
    if (!conds.length) {
      h += '<div style="font-size:12px;color:var(--orange)">暂未设置条件（点击右上角「+ 添加触发条件」，如：品类二级 等于 非卷，或 规则品类 等于 卫卷）</div>';
    } else {
      conds.forEach((c, ci) => {
        h += '<div class="cfg-rule-row">'
          + '<span class="tag blue">条件 ' + (ci + 1) + "</span>"
          + '<select class="cfg-select" data-act="dp-cond-field" data-tpl="' + esc(curTpl.id) + '" data-idx="' + ci + '">' + buildFieldOptionsHtml(c.field) + "</select>"
          + '<select class="cfg-select" data-act="dp-cond-op" data-tpl="' + esc(curTpl.id) + '" data-idx="' + ci + '">'
          + DP_OPERATORS.map((o) => '<option value="' + o.op + '"' + (c.op === o.op ? " selected" : "") + ">" + esc(o.label) + "</option>").join("")
          + "</select>"
          + (c.op === "empty" || c.op === "notEmpty" ? "" : '<input type="text" class="cfg-input" style="min-width:210px" placeholder="匹配值（多项用逗号分隔）" data-act="dp-cond-val" data-tpl="' + esc(curTpl.id) + '" data-idx="' + ci + '" value="' + esc(c.val || "") + '">')
          + '<button class="mini-btn danger" data-act="dp-cond-del" data-tpl="' + esc(curTpl.id) + '" data-idx="' + ci + '">' + ic("x", 12) + "</button>"
          + "</div>";
      });
    }
    h += "</div>";
  } else {
    h += '<div style="background:#e8f7fa;border:1px solid #bde7ee;border-radius:9px;padding:9px 12px;font-size:12px;color:var(--teal)">'
      + ic("check-circle", 13) + " 当前模板为<b>默认兜底模板</b>：当单品未命中其他条件模板时，将自动使用此模板展示。</div>";
  }
  h += "</div></div>";

  /* 2) 画布区块与组件编辑器（支持一键插入「跨部门相似字段横向对比」等功能块） */
  h += '<div class="cfg-card">'
    + '<div class="cfg-card-hd cfg-sort-heading"><span>' + ic("grid", 14) + " 视窗画布区块配置（共 " + (curTpl.blocks || []).length + ' 个区块）</span><small class="cfg-sort-hint">拖动字段或区块左侧手柄排序 · 自动保存</small><span id="dpSortStatus" role="status" aria-live="polite"></span>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
    + '<button class="mini-btn primary" data-act="dp-block-add" data-tpl="' + esc(curTpl.id) + '" data-btype="dept_compare">' + ic("swap", 12) + " + 插入「跨部门相似字段横向对比」区块</button>"
    + '<button class="mini-btn" data-act="dp-block-add" data-tpl="' + esc(curTpl.id) + '" data-btype="fields">' + ic("plus", 12) + " + 插入自由字段区块</button>"
    + '<button class="mini-btn" data-act="dp-block-add" data-tpl="' + esc(curTpl.id) + '" data-btype="pack_SpecBox">' + ic("package", 12) + " + 插入重量体积+嵌套子框</button>"
    + '<button class="mini-btn" data-act="dp-block-add" data-tpl="' + esc(curTpl.id) + '" data-btype="strip_table">' + ic("ruler", 12) + " + 插入横向指标条表(如卷类)</button>"
    + "</div></div>"
    + '<div class="cfg-card-bd cfg-block-list" data-tpl="' + esc(curTpl.id) + '">';

  (curTpl.blocks || []).forEach((blk, bi) => {
    const bfs = Array.isArray(blk.fields) ? blk.fields : [];
    const sbs = Array.isArray(blk.subBoxes) ? blk.subBoxes : [];
    const crs = Array.isArray(blk.compareRows) ? blk.compareRows : [];
    h += '<div class="cfg-block-editor" data-bidx="' + bi + '">'
      + '<div class="be-hd">'
      + '<span class="cfg-block-grip" title="拖动调整区块顺序" aria-label="拖动区块">' + ic("grip", 15) + '</span>'
      + '<span class="tag blue" data-block-number>区块 #' + (bi + 1) + "</span>"
      + '<input type="text" class="cfg-input" style="font-weight:700;min-width:220px" data-act="dp-blk-title" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" value="' + esc(blk.title || "") + '" placeholder="区块标题">'
      + '<label style="font-size:12px;color:var(--muted)">展示样式：'
      + '<select class="cfg-select" data-act="dp-blk-type" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '">'
      + DP_BLOCK_TYPES.map((bt) => '<option value="' + bt.type + '"' + (blk.type === bt.type ? " selected" : "") + ">" + esc(bt.label) + "</option>").join("")
      + "</select></label>"
      + '<label style="font-size:12px;color:var(--muted)">宽度占比：'
      + '<select class="cfg-select" data-act="dp-blk-span" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '">'
      + [[12, "全宽 (12/12)"], [8, "2/3 宽 (8/12)"], [7, "7/12 宽 (左宽)"], [6, "半宽 (6/12)"], [5, "5/12 宽 (右窄)"], [4, "1/3 宽 (4/12)"]].map(([sp, lb]) => '<option value="' + sp + '"' + (Number(blk.span) === sp ? " selected" : "") + ">" + lb + "</option>").join("")
      + "</select></label>"
      + '<div style="margin-left:auto;display:flex;gap:4px">'
      + '<button class="mini-btn" data-act="dp-blk-move" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" data-dir="-1"' + (bi === 0 ? " disabled" : "") + ' title="上移区块">↑</button>'
      + '<button class="mini-btn" data-act="dp-blk-move" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" data-dir="1"' + (bi === curTpl.blocks.length - 1 ? " disabled" : "") + ' title="下移区块">↓</button>'
      + '<button class="mini-btn danger" data-act="dp-blk-del" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" title="删除区块">' + ic("x", 12) + "</button>"
      + "</div></div>";

    /* A. 本区块常规展示字段（可跨域重复添加） */
    h += '<div style="margin-bottom:8px">'
      + '<div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:5px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">'
      + '<span>区块展示字段（共 ' + bfs.length + ' 项，可与其他区块重复）：</span>'
      + '<select class="cfg-select" data-act="dp-blk-field-add" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '">' + fieldOptsEmpty + "</select>"
      + "</div>"
      + renderDpSortableFields(bfs, { kind: "block", tpl: curTpl.id, bidx: bi })
      + "</div>";

    /* B. 跨部门相似字段横向对比表编辑器（可在任意区块内插入对比行，字段完全自由配置） */
    if (blk.type === "dept_compare" || crs.length > 0) {
      h += '<div style="background:#fff5f5;border:1px solid #f3c8c6;border-radius:9px;padding:10px 12px;margin-top:8px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">'
        + '<span style="font-size:12.5px;font-weight:750;color:#b8322f">' + ic("swap", 13) + " 跨部门相似字段横向对比配置（每行可将不同部门使用的相似字段并排横向对比，字段自由增删）</span>"
        + '<button class="mini-btn primary" data-act="dp-cmp-row-add" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '">' + ic("plus", 12) + " + 新增横向对比维度行</button>"
        + "</div>";
      crs.forEach((cr, ri) => {
        const cfs = cr.fields || [];
        h += '<div class="cfg-cmp-row-box">'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
          + '<span class="tag red">对比行 ' + (ri + 1) + "</span>"
          + '<input type="text" class="cfg-input" style="width:140px;font-weight:700" placeholder="对比维度名(如:品牌口径)" data-act="dp-cmp-row-dim" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" data-ridx="' + ri + '" value="' + esc(cr.dim || "") + '">'
          + '<select class="cfg-select" data-act="dp-cmp-field-add" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" data-ridx="' + ri + '">'
          + '<option value="">+ 向本行添加要横向对比的部门字段…</option>' + buildFieldOptionsHtml("")
          + "</select>"
          + '<button class="mini-btn danger" style="margin-left:auto;padding:2px 8px;min-height:24px" data-act="dp-cmp-row-del" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" data-ridx="' + ri + '">' + ic("x", 11) + " 删除此行</button>"
          + "</div>"
          + renderDpSortableFields(cfs, { kind: "compare", tpl: curTpl.id, bidx: bi, ridx: ri })
          + "</div>";
      });
      h += "</div>";
    } else {
      h += '<div style="margin-top:6px"><button class="mini-btn" style="font-size:11.5px;padding:3px 9px;min-height:26px;border-style:dashed;color:#b8322f;border-color:#e9b3b0" data-act="dp-cmp-row-add" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '">' + ic("swap", 11) + " + 在本区块内插入「跨部门相似字段横向对比」表格</button></div>";
    }

    /* C. 嵌套尺寸子框编辑器（如 中包：长×宽×高 / 外包装：长×宽×高） */
    if (blk.type === "pack_SpecBox" || sbs.length > 0) {
      h += '<div style="background:#f4f9ff;border:1px solid #c4dbfb;border-radius:9px;padding:10px 12px;margin-top:8px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">'
        + '<span style="font-size:12.5px;font-weight:750;color:var(--blue-deep)">' + ic("package", 13) + " 内嵌尺寸/规格子框配置（前3个字段自动合成为 长×宽×高 表达式）</span>"
        + '<button class="mini-btn" data-act="dp-subbox-add" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '">' + ic("plus", 12) + " + 新增嵌套子框</button>"
        + "</div>";
      sbs.forEach((sb, si) => {
        const sfs = sb.fields || [];
        h += '<div class="cfg-cmp-row-box">'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
          + '<span class="tag blue">子框 ' + (si + 1) + "</span>"
          + '<input type="text" class="cfg-input" style="width:170px;font-weight:700" placeholder="子框标题(如:中包：长×宽×高)" data-act="dp-subbox-title" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" data-sidx="' + si + '" value="' + esc(sb.title || "") + '">'
          + '<select class="cfg-select" data-act="dp-subbox-field-add" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" data-sidx="' + si + '">'
          + '<option value="">+ 向子框添加字段…</option>' + buildFieldOptionsHtml("")
          + "</select>"
          + '<button class="mini-btn danger" style="margin-left:auto;padding:2px 8px;min-height:24px" data-act="dp-subbox-del" data-tpl="' + esc(curTpl.id) + '" data-bidx="' + bi + '" data-sidx="' + si + '">' + ic("x", 11) + " 删除子框</button>"
          + "</div>"
          + renderDpSortableFields(sfs, { kind: "subbox", tpl: curTpl.id, bidx: bi, sidx: si })
          + "</div>";
      });
      h += "</div>";
    }

    h += "</div>";
  });

  h += "</div></div></div></div>";
  body.innerHTML = h;
}

/* ---------- 字段管理抽屉（横竖两屏对照：左屏已选字段顺序实时对应横版列/竖版行，右屏全量字段分组池；勾选右屏时仅局部更新左屏与预览条，右屏 DOM 不重建不闪跳） ---------- */
function buildFieldDrawerPreviewHtml(visList, pinnedSet) {
  return '<span style="font-size:11.5px;color:var(--blue-deep);font-weight:700;white-space:nowrap">' + ic("table", 12) + " 横版列序 / " + ic("list", 12) + " 竖版行序实时预览（共 " + visList.length + " 项，前 4 列固定冻结）：</span>"
    + (visList.length ? visList.map((k, idx) => '<span class="pv-chip"' + (pinnedSet.has(k) ? ' style="background:#e8f2ff;border-color:var(--blue)"' : "") + '>' + (idx + 1) + ". " + esc((schemaByKey.get(k) || {}).label || k) + (pinnedSet.has(k) ? " 📌" : "") + "</span>").join("") : '<span style="font-size:11.5px;color:var(--subtle)">暂未勾选字段</span>');
}

function buildFieldDrawerLeftListHtml(visList, pinnedSet) {
  if (!visList.length) {
    return '<div class="empty" style="padding:28px 12px">未选择任何展示字段，请从右侧字段池勾选或点击上方预设</div>';
  }
  let h = "";
  visList.forEach((k, i) => {
    const s = schemaByKey.get(k);
    const isPin = pinnedSet.has(k);
    h += '<div class="field-row"' + (isPin ? ' style="background:#f4f9ff;border-color:#c4dbfb"' : ' draggable="true"') + ' data-key="' + k + '">'
      + '<span class="seq">' + (i + 1) + "</span>"
      + '<span class="grip" title="' + (isPin ? "核心冻结列（固定在前4列）" : "按住拖拽调整顺序") + '">' + (isPin ? "📌" : ic("grip", 14)) + "</span>"
      + '<span class="lb" title="' + esc(s.label) + '">' + esc(s.label) + (isPin ? ' <small style="color:var(--blue);font-weight:600">[冻结常驻]</small>' : "") + "</span>"
      + '<span class="tg">' + esc(s.group) + "</span>"
      + '<span class="mv">'
      + (isPin
        ? '<span style="font-size:11px;color:var(--subtle);padding:0 4px">固定列</span>'
        : '<button data-act="field-top" data-v="' + k + '"' + (i <= 4 ? " disabled" : "") + ' title="置顶到第5列">⇈</button>'
          + '<button data-act="field-up" data-v="' + k + '"' + (i <= 4 ? " disabled" : "") + ' title="上移">↑</button>'
          + '<button data-act="field-down" data-v="' + k + '"' + (i === visList.length - 1 ? " disabled" : "") + ' title="下移">↓</button>'
          + '<button data-act="field-remove" data-v="' + k + '" title="移出展示">' + ic("x", 11) + "</button>")
      + "</span></div>";
  });
  return h;
}

/* 当用户在字段管理抽屉内勾选/取消/排序字段时，仅局部更新左屏列表与右屏复选框状态及角标，绝不重建右屏 DOM，保持右屏滚动位置与操作焦点丝滑无闪烁 */
function syncFieldDrawerInPlace() {
  const drawer = document.getElementById("fieldDrawer");
  if (!drawer || !state.fieldDrawer) return false;
  const pvEl = document.getElementById("fdPreviewStrip");
  const leftHdCnt = document.getElementById("fdLeftCount");
  const leftList = document.getElementById("fieldList");
  const rightBd = document.getElementById("fdPoolBody");
  if (!pvEl || !leftList || !rightBd) return false;

  const visList = orderedVisibleKeys();
  const visSet = new Set(visList);
  const posMap = new Map();
  visList.forEach((k, idx) => posMap.set(k, idx + 1));
  const pinnedSet = new Set(PINNED_KEYS);

  const prevLeftScroll = leftList.scrollTop;
  pvEl.innerHTML = buildFieldDrawerPreviewHtml(visList, pinnedSet);
  if (leftHdCnt) leftHdCnt.textContent = String(visList.length);
  leftList.innerHTML = buildFieldDrawerLeftListHtml(visList, pinnedSet);
  leftList.scrollTop = prevLeftScroll;

  /* 原位更新右屏每个字段卡片的选中样式、checkbox 状态与 #序号 角标，不销毁任何 DOM 节点 */
  rightBd.querySelectorAll(".fd-pool-item[data-pool-key]").forEach((lbl) => {
    const k = lbl.getAttribute("data-pool-key");
    const on = visSet.has(k);
    lbl.classList.toggle("on", on);
    const cb = lbl.querySelector('input[type="checkbox"]');
    if (cb && cb.checked !== on) cb.checked = on;
    const badge = lbl.querySelector(".fd-pos-badge");
    if (badge) {
      if (on) {
        badge.textContent = "#" + posMap.get(k);
        badge.style.display = "";
      } else {
        badge.textContent = "";
        badge.style.display = "none";
      }
    }
  });

  /* 原位更新右屏各分组标题的 (已选/总数) 计数 */
  rightBd.querySelectorAll("[data-grp-count]").forEach((cntEl) => {
    const g = cntEl.getAttribute("data-grp-count");
    let total = 0, onCnt = 0;
    for (const k of schemaKeys) {
      if (MDM_HIDDEN_KEYS.has(k)) continue;
      const s = schemaByKey.get(k);
      if (s && s.group === g) {
        total++;
        if (visSet.has(k)) onCnt++;
      }
    }
    cntEl.textContent = "(" + onCnt + "/" + total + ")";
  });
  syncSavedViewControls();
  return true;
}

function renderFieldDrawer() {
  const drawer = document.getElementById("fieldDrawer");
  const mask = document.getElementById("drawerMask");
  if (!state.fieldDrawer) { drawer.classList.remove("open"); if (!state.detail && !state.compareOpen) mask.classList.remove("open"); return; }

  /* 如果抽屉已经处于打开且结构已渲染完成，直接走原位无闪烁更新，避免右屏重刷 */
  if (drawer.classList.contains("open") && document.getElementById("fdPoolBody")) {
    syncFieldDrawerInPlace();
    mask.classList.add("open");
    return;
  }

  const visList = orderedVisibleKeys();
  const visSet = new Set(visList);
  const pinnedSet = new Set(PINNED_KEYS);

  shortcutDraft = [...state.viewShortcuts];
  let h = '<div class="fd-viewbar">'
    + '<div class="fd-view-controls"><strong>我的视图</strong><select id="fdSavedViewSel" aria-label="选择自定义视图"></select>'
    + '<input id="fdViewName" maxlength="40" placeholder="输入视图名称，如：质量核查" aria-label="自定义视图名称">'
    + '<button class="tool-btn primary" data-act="field-view-save">保存视图</button>'
    + '<button class="tool-btn" data-act="field-view-create">新增视图</button>'
    + '<button class="tool-btn" id="fdViewNew" data-act="field-view-copy">另存为</button>'
    + '<button class="tool-btn" id="fdViewDelete" data-act="field-view-delete">删除</button></div>'
    + '<div class="fd-view-hint"><span id="fdViewStatus"></span><span>保存字段选择与排列顺序</span><span id="fdConfigStatus"></span></div></div>'
    + '<details class="fd-shortcuts" id="fdShortcutEditor"><summary>常用视图配置 <span>选择显示在查询结果标题栏的视图，并调整顺序</span></summary>'
    + '<div id="fdShortcutOptions"></div><div class="fd-shortcut-actions"><span id="fdShortcutStatus"></span><button class="tool-btn primary" data-act="save-shortcuts">保存快捷视图</button></div></details>'
    + '<div class="fd-toolbar">'
    + '<span class="fd-lbl">视图预设：</span>'
    + mdmPresetNames().map((p) => '<button class="tool-btn" data-act="preset" data-v="' + esc(p) + '">' + esc(p) + "</button>").join("")
    + '<span style="margin-left:auto;display:flex;gap:6px">'
    + '<button class="tool-btn" data-act="fields-all">全选 (' + state.order.length + ')</button>'
    + '<button class="tool-btn" data-act="fields-none">仅留核心4列</button>'
    + "</span></div>";

  /* 顶部横竖两屏实时预览条 */
  h += '<div class="fd-preview-strip" id="fdPreviewStrip">'
    + buildFieldDrawerPreviewHtml(visList, pinnedSet)
    + "</div>";

  h += '<div class="fd-split">';

  /* 左屏（屏一）：已启用字段展示顺序（前4列固定冻结，第5列起支持拖拽 / 置顶 / 上移 / 下移 / 移除） */
  h += '<div class="fd-pane">'
    + '<div class="fd-pane-hd"><span>' + ic("table", 14) + ' 左屏：已启用字段排序（<span id="fdLeftCount">' + visList.length + "</span> 项）</span>"
    + '<span class="sub">前4列常驻冻结 · 其余可拖拽排序</span></div>'
    + '<div class="fd-pane-bd" id="fieldList">'
    + buildFieldDrawerLeftListHtml(visList, pinnedSet)
    + "</div></div>";

  /* 右屏（屏二）：全量字段分组池（基于『物料属性查询报表-成品（含工艺）』123个表头列 + 质量衍生字段分组，已排除 MPS 工艺路线专属字段） */
  const groups = {};
  const poolKeys = schemaKeys.filter((k) => !MDM_HIDDEN_KEYS.has(k));
  poolKeys.forEach((k) => {
    const s = schemaByKey.get(k);
    (groups[s.group] = groups[s.group] || []).push(k);
  });
  h += '<div class="fd-pane">'
    + '<div class="fd-pane-hd"><span>' + ic("grid", 14) + " 右屏：MDM 候选字段池（" + Object.keys(groups).length + " 组 " + poolKeys.length + " 项 · 含 123 列报表全表头）</span>"
    + '<span class="sub">连续勾选不刷屏 · 实时同步左屏</span></div>'
    + '<div class="fd-pane-bd" id="fdPoolBody">';
  for (const g of Object.keys(groups)) {
    const gKeys = groups[g];
    const gOn = gKeys.filter((k) => visSet.has(k)).length;
    h += '<div class="fd-grp-title"><span>' + esc(g) + ' <small style="color:var(--subtle);font-weight:500" data-grp-count="' + esc(g) + '">(' + gOn + "/" + gKeys.length + ")</small></span>"
      + '<span style="display:flex;gap:6px">'
      + '<button class="mini-btn" style="padding:2px 7px;min-height:22px;font-size:11px" data-act="field-grp-all" data-v="' + esc(g) + '">本组全选</button>'
      + '<button class="mini-btn" style="padding:2px 7px;min-height:22px;font-size:11px" data-act="field-grp-none" data-v="' + esc(g) + '">本组清空</button>'
      + "</span></div>"
      + '<div class="fd-pool-grid">';
    for (const k of gKeys) {
      const s = schemaByKey.get(k);
      const on = visSet.has(k);
      const isPin = pinnedSet.has(k);
      const pos = on ? (visList.indexOf(k) + 1) : "";
      h += '<label class="fd-pool-item' + (on ? " on" : "") + '" data-pool-key="' + esc(k) + '"' + (isPin ? ' title="核心4列常驻保留，不可取消"' : "") + '>'
        + '<input type="checkbox" data-act="field-toggle" data-v="' + k + '"' + (on ? " checked" : "") + (isPin ? " disabled" : "") + ">"
        + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(s.label) + '">' + esc(s.label) + (isPin ? " 📌" : "") + "</span>"
        + '<span class="tag blue fd-pos-badge" style="padding:0 5px;font-size:10px' + (pos ? "" : ";display:none") + '">' + (pos ? "#" + pos : "") + "</span>"
        + "</label>";
    }
    h += "</div>";
  }
  h += "</div></div></div>";

  document.getElementById("fieldBody").innerHTML = h;
  drawer.classList.add("open"); mask.classList.add("open");
  syncSavedViewControls(); renderShortcutEditor();
}

/* ---------- 对比抽屉 ---------- */
function renderCompare() {
  const drawer = document.getElementById("compareDrawer");
  const mask = document.getElementById("drawerMask");
  if (!state.compareOpen || state.basket.length < 2) {
    drawer.classList.remove("open");
    if (!state.detail && !state.fieldDrawer) mask.classList.remove("open");
    document.getElementById("compareBody").innerHTML = "";
    return;
  }
  const list = state.basket.map((m) => byMaterial.get(m)).filter(Boolean);
  const vis = orderedVisibleKeys();
  let h = '<table class="cmp-table"><thead><tr><th style="min-width:120px">字段</th>'
    + list.map((r) => '<th><div class="skuhd"><span class="mono" style="font-weight:750">' + esc(r.material) + "</span>"
      + '<span style="font-weight:500;color:var(--muted);font-size:11.5px">' + esc(r.desc.slice(0, 26)) + "</span>"
      + '<span>' + (r.blocking ? '<span class="tag solid-red">阻断</span>' : '<span class="tag green">正常</span>') + "</span></div></th>").join("")
    + "</tr></thead><tbody>";
  for (const k of vis) {
    const s = schemaByKey.get(k);
    const vals = list.map((r) => r[k]);
    const norm = vals.map((v) => (v === null || v === undefined ? "" : String(v)));
    const diff = new Set(norm).size > 1;
    if (state.cmpDiffOnly && !diff) continue;
    h += "<tr><td class='k'>" + esc(s.label) + "</td>"
      + list.map((r, i) => {
        let v = r[k];
        if (s.type === "bool") v = boolCell(k, v, r);
        else if (v === null || v === undefined || v === "") v = "—";
        else v = esc(fmt(v));
        return '<td class="' + (diff ? "diff" : "") + '">' + v + "</td>";
      }).join("") + "</tr>";
  }
  h += "</tbody></table>";
  document.getElementById("compareBody").innerHTML = h;
  drawer.classList.add("open"); mask.classList.add("open");
}

/* ---------- 字段分析（三域分离：必审适用域 / 条件选填域 / 不适用域 N/A + 7大业务族群透视矩阵 + 同义异形词检测） ---------- */
function donutHtml(pct, label, subText) {
  const R = 26, C = 2 * Math.PI * R;
  const raw = isFinite(Number(pct)) ? Number(pct) : 0;
  const v = Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
  const disp = Number.isInteger(v) ? String(v) : v.toFixed(1);
  const color = v >= 90 ? "var(--green)" : v >= 60 ? "var(--orange)" : "var(--red)";
  return '<div class="donut-wrap"><svg width="72" height="72" viewBox="0 0 72 72">'
    + '<circle cx="36" cy="36" r="' + R + '" fill="none" stroke="#eef3f8" stroke-width="9"/>'
    + '<circle cx="36" cy="36" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + (C * v / 100).toFixed(1) + " " + C.toFixed(1) + '" transform="rotate(-90 36 36)"/>'
    + '<text x="36" y="40" text-anchor="middle" font-size="13.5" font-weight="750" fill="var(--ink)">' + disp + '%</text></svg>'
    + '<div class="dl"><b>' + esc(label || "") + "</b>" + (subText ? '<div style="font-size:11px;color:var(--subtle);margin-top:2px">' + subText + "</div>" : "") + "</div></div>";
}
function hbarsHtml(items, total, fieldKey) {
  return items.map(([lb, n]) => {
    const pct = total ? (n / total * 100) : 0;
    const pctStr = pct > 0 && pct < 0.1 ? "<0.1%" : (Math.round(pct * 10) / 10) + "%";
    const actAttr = fieldKey ? ' style="cursor:pointer" data-act="ana-drill-val" data-field="' + esc(fieldKey) + '" data-val="' + esc(lb) + '" title="点击在查询结果中精准筛选「' + esc(lb) + '」"' : "";
    return '<div class="bar-row"' + actAttr + '><span class="bl" title="' + esc(lb) + '">' + esc(lb) + '</span><div class="bt"><div class="bf" style="width:' + Math.max(1.5, pct).toFixed(1) + '%"></div></div><span class="bn">' + n.toLocaleString() + ' <small style="color:var(--subtle)">(' + pctStr + ')</small></span></div>';
  }).join("");
}
function vbarsHtml(items) {
  const max = Math.max(1, ...items.map((i) => i[1]));
  return '<svg viewBox="0 0 ' + (items.length * 42) + ' 112" style="width:100%;height:112px">'
    + items.map(([lb, n], i) => {
      const hgt = Math.max(2, n / max * 82);
      return '<rect x="' + (i * 42 + 6) + '" y="' + (92 - hgt) + '" width="28" height="' + hgt + '" rx="3" fill="var(--blue)" opacity="' + (0.55 + 0.45 * n / max).toFixed(2) + '"/>'
        + '<text x="' + (i * 42 + 20) + '" y="' + (88 - hgt) + '" text-anchor="middle" font-size="10" fill="var(--ink)">' + n.toLocaleString() + "</text>"
        + '<text x="' + (i * 42 + 20) + '" y="106" text-anchor="middle" font-size="9.5" fill="var(--muted)">' + esc(String(lb).slice(0, 7)) + "</text>";
    }).join("") + "</svg>";
}

/* 7 大业务产品族群定义（用于跨品类适用域分离，彻底消除全局一刀切误判） */
const BIZ_FAMILIES = [
  { id: "dry_mian", name: "干巾·面巾", short: "面巾", desc: "软抽、盒巾、悬挂式面巾、乳霜软抽等面巾品系" },
  { id: "dry_roll", name: "干巾·卫卷", short: "卫卷", desc: "有芯卷纸、无芯卷纸、公用卫生纸、卷装擦手纸/抹布等卷类" },
  { id: "dry_zhi",  name: "干巾·纸巾", short: "纸巾", desc: "手帕纸（标准/迷你）等随身折叠纸巾" },
  { id: "dry_can",  name: "干巾·餐巾", short: "餐巾", desc: "餐巾纸、公用擦手纸、抽取式多用纸抹布等" },
  { id: "wet",      name: "湿巾品系",  short: "湿巾", desc: "生活用纸湿巾、成人/婴儿/女性护理湿巾等含液产品" },
  { id: "care",     name: "护理品系",  short: "护理", desc: "成人纸尿裤/片/垫、卫生巾、安心裤、护垫、内裤等个护品" },
  { id: "other",    name: "器具/无纺布/其他", short: "其他", desc: "分配器、干巾无纺布、空气清新剂、礼盒组合等其他品" },
];

function getRowFamily(r) {
  if (r.ruleCat === "面巾") return "dry_mian";
  if (r.ruleCat === "卫卷") return "dry_roll";
  if (r.ruleCat === "纸巾") return "dry_zhi";
  if (r.ruleCat === "餐巾") return "dry_can";
  const cat = String(r.cat || "");
  const stCat = String(r.stockCat || "");
  if (cat.indexOf("湿巾") >= 0 || stCat.indexOf("湿纸巾") >= 0) return "wet";
  const c1 = String(r["品类一级"] || "");
  if (c1.indexOf("护理") >= 0 || /尿裤|尿片|护理垫|护垫|卫生巾|内裤|棉条/.test(cat)) return "care";
  return "other";
}

function isConfirmedNoneVal(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s === "无" || s === "无要求" || s === "无节距" || s === "不适用" || s.toLowerCase() === "n/a";
}

function isFilledVal(v) {
  if (v === null || v === undefined || v === "") return false;
  const s = String(v).trim();
  if (!s) return false;
  return !isConfirmedNoneVal(s);
}

/* 构建每个字段的「客观规则必审域 + 实测使用域」画像（彻底废除主观“不适用/越界”臆测）
   - req: 有明确 PDF 工艺规范 / MDM 必填矩阵 / 品类刚需规则要求的必审域（留空计入“规则必审待补”）
   - 其余品系不设主观“越界(N/A)”，由 computeFieldScopeStats 根据实测填报率客观归为：
     🟢 主力使用域 (≥50%) / 🔹 按需选填域 (0%~50%) / ⚪ 暂未启用 (0%) */
const _fieldScopeCache = new Map();
function getFieldScopeSpec(key) {
  if (_fieldScopeCache.has(key)) return _fieldScopeCache.get(key);

  /* 1. 读取干巾四品类 fieldRules 矩阵 */
  const reqDryCats = new Set();
  const optDryCats = new Set();
  const dryNameMap = { "面巾": "dry_mian", "卫卷": "dry_roll", "纸巾": "dry_zhi", "餐巾": "dry_can" };
  for (const [catName, grps] of Object.entries(DATASET.fieldRules || {})) {
    const famId = dryNameMap[catName];
    if (!famId) continue;
    for (const g of grps) {
      if ((g.fields || []).includes(key)) {
        if (g.required) reqDryCats.add(famId);
        else optDryCats.add(famId);
      }
    }
  }

  let spec = null;

  /* 2. 基于真实业务数据与 PDF/MDM 官方校验规则定义必审域 */
  if (key === "码数") {
    spec = {
      scopeType: "scoped",
      badge: "护理刚需+面巾主力",
      badgeCls: "blue",
      scopeTitle: "「护理品系」（纸尿裤/纸尿片/护理垫/卫生巾/裤型卫生巾/护垫等尺码刚需，实测 82.0% 已维护 L/M/XL/女护规格）与「干巾·面巾」（软抽/面巾 S/M/L/XL 幅宽码数，实测 70.5% 已维护）为核心适用域；其他品系按需选填",
      ruleRef: "护理品系尺码刚需规范 + 面巾幅宽码数规范（实测护理 968 条、面巾 2,216 条）",
      whyNotGlobal: "卫卷、湿巾、手帕纸等不以尺码（S/M/L/XL/女护规格）区分产品，若按全表粗算会把卫卷和湿巾的正常留空混入分母；应聚焦护理品系与面巾品系审视。",
      classifyRow: (r, fam) => {
        if (fam === "care") {
          const cat = String(r.cat || "");
          if (/护肤|清洁|洗护/.test(cat)) return "opt";
          return "req";
        }
        if (fam === "dry_mian") return "req";
        return "opt";
      },
    };
  } else if (key === "wetNet") {
    spec = {
      scopeType: "scoped",
      badge: "湿巾必审+护理常用",
      badgeCls: "blue",
      scopeTitle: "「湿巾品系」（非组合装）规则必审（实测 99.7%）；「护理品系」常规高频维护（实测 73.8% 维护不含液净重）；干巾四品类无药液留空属正常",
      ruleRef: "示例工艺属性规范 · 规则4（不含液成品净重 ≤ 净重）",
      whyNotGlobal: "干巾四品类不含药液无需填写（0%），而湿巾（99.7%）与护理品（73.8%）高频使用，分品系审视才能真实反映湿巾与护理的维护质量。",
      classifyRow: (r, fam) => (fam === "wet" && r.isCombo !== "是" ? "req" : "opt"),
    };
  } else if (key === "liquid") {
    spec = {
      scopeType: "scoped",
      badge: "湿巾必审",
      badgeCls: "blue",
      scopeTitle: "「湿巾品系」（非组合装）规则必审（实测 91.3%）；非湿巾产品不含液留空属正常",
      ruleRef: "示例工艺属性规范 · 规则4（湿巾含液量规范）",
      whyNotGlobal: "仅湿巾产品存在药液配比与含液量，其他干巾/护理品留空（0%）属正常产品特性。",
      classifyRow: (r, fam) => (fam === "wet" && r.isCombo !== "是" ? "req" : "opt"),
    };
  } else if (["卷径", "筒芯", "节距", "卷高", "节数", "米数", "净含量", "毛重/卷", "小卷形状"].includes(key)) {
    const isReqRoll = ["卷径", "筒芯", "节距", "卷高", "节数", "米数", "净含量", "毛重/卷"].includes(key);
    spec = {
      scopeType: "scoped",
      badge: isReqRoll ? "干巾·卫卷必审" : "干巾·卫卷选填",
      badgeCls: isReqRoll ? "blue" : "orange",
      scopeTitle: "「干巾·卫卷」卷类产品专属几何与计量参数（实测卫卷 90.5%~95.4% 已维护）；非卷类折叠品按需或留空",
      ruleRef: "MDM 四品类必填矩阵 + 示例校验规范规则5/6（卷类几何与名称一致性）",
      whyNotGlobal: "折叠类面巾/纸巾/餐巾及湿巾无卷芯与节距，聚焦「干巾·卫卷」可避免非卷类留空稀释完成率。",
      classifyRow: (r, fam) => (fam === "dry_roll" ? (isReqRoll ? "req" : "opt") : "opt"),
    };
  } else if (key === "纸盒尺寸") {
    spec = {
      scopeType: "scoped",
      badge: "面巾(盒抽必审)",
      badgeCls: "orange",
      scopeTitle: "「干巾·面巾」主力维护（实测 94.7% 已填具体尺寸或确认填“无”）；其中盒抽变体必审具体长×宽×高，软抽填“无”即确认",
      ruleRef: "MDM 面巾盒巾/软抽变体口径（规则3）",
      whyNotGlobal: "纸盒尺寸用于区分面巾下的盒抽与软抽并校验纸盒与纸张长宽匹配，其他品系按需少量使用。",
      classifyRow: (r, fam) => (fam === "dry_mian" ? "req" : "opt"),
    };
  } else if (key === "抽(张)/包(盒)") {
    spec = {
      scopeType: "scoped",
      badge: "面巾/餐巾必审·湿巾常用",
      badgeCls: "blue",
      scopeTitle: "「干巾·面巾 (96.6%)」与「干巾·餐巾 (99.9%)」规则必审；「湿巾品系 (46.9%)」「干巾·纸巾 (14.6%)」「护理 (5.3%)」按需维护",
      ruleRef: "MDM 四品类必填矩阵 + 示例校验规范规则9",
      whyNotGlobal: "面巾与餐巾以“抽/包”为核心计数（>96%），湿巾有近半数抽取式产品使用本字段，而卫卷用节数/米数。",
      classifyRow: (r, fam) => (fam === "dry_mian" || fam === "dry_can" ? "req" : "opt"),
    };
  } else if (key === "是否悬挂式") {
    spec = {
      scopeType: "scoped",
      badge: "面巾必审·全品系常用",
      badgeCls: "blue",
      scopeTitle: "「干巾·面巾 (97.3%)」规则必审；同时在餐巾 (60.6%)、湿巾 (47.4%)、其他 (47.3%)、护理 (44.4%)、卫卷 (42.8%)、纸巾 (40.8%) 中均广泛维护（是/否）",
      ruleRef: "MDM 面巾必填矩阵 + 跨品类悬挂装通用属性",
      whyNotGlobal: "面巾中用于区分悬挂式软抽与普通软抽（必审），同时其余品系也有 40%~60% 维护了是否悬挂式。",
      classifyRow: (r, fam) => (fam === "dry_mian" ? "req" : "opt"),
    };
  } else if (key === "张/片数") {
    spec = {
      scopeType: "scoped",
      badge: "纸巾/餐巾/湿巾/护理主力",
      badgeCls: "blue",
      scopeTitle: "「干巾·纸巾 (100%)」「干巾·餐巾 (97.9%)」「湿巾品系 (96.0%)」必审适用；「护理品系 (92.5%，含卫生巾片数及确认填“无”)」主力维护",
      ruleRef: "MDM 四品类必填矩阵 + 示例校验规范规则9（抽/张/片数口径）",
      whyNotGlobal: "面巾使用「抽(张)/包(盒)」，卫卷使用「节数/米数」，而纸巾、餐巾、湿巾与护理品系（>92%）以本字段为核心计数。",
      classifyRow: (r, fam) => (fam === "dry_zhi" || fam === "dry_can" || (fam === "wet" && r.isCombo !== "是") ? "req" : "opt"),
    };
  } else if (key === "标准/迷你") {
    spec = {
      scopeType: "scoped",
      badge: "干巾·纸巾必审",
      badgeCls: "blue",
      scopeTitle: "「干巾·纸巾（手帕纸）」必审适用（实测 93.5% 已维护标准/迷你规格）；其余品系按需选填",
      ruleRef: "MDM 四品类必填矩阵（纸巾折叠与成品）",
      whyNotGlobal: "标准/迷你是手帕纸的核心规格分类，按「干巾·纸巾」审视可准确反映手帕纸维护完整度。",
      classifyRow: (r, fam) => (fam === "dry_zhi" ? "req" : "opt"),
    };
  } else if (key === "折数" || key === "折叠规格") {
    const isReq = key === "折数";
    spec = {
      scopeType: "scoped",
      badge: isReq ? "餐巾/湿巾主力" : "湿巾主力维护",
      badgeCls: "blue",
      scopeTitle: isReq
        ? "「干巾·餐巾 (96.1%)」与「湿巾品系 (94.4%)」主力必审维护；其他折叠纸品按需选填"
        : "「湿巾品系 (94.1%)」主力维护；其他折叠纸品按需选填",
      ruleRef: "MDM 餐巾与湿巾折叠工艺规范",
      whyNotGlobal: "实测该字段主要服务餐巾（96.1%）与湿巾（94.4%）的折叠工艺管理。",
      classifyRow: (r, fam) => (isReq ? (fam === "dry_can" || (fam === "wet" && r.isCombo !== "是") ? "req" : "opt") : (fam === "wet" && r.isCombo !== "是" ? "req" : "opt")),
    };
  } else if (key === "纸长" || key === "纸宽") {
    spec = {
      scopeType: "scoped",
      badge: "面巾/纸巾/餐巾/湿巾必审",
      badgeCls: "blue",
      scopeTitle: "「干巾·面巾 (96.6%)、干巾·纸巾 (99.8%)、干巾·餐巾 (99.9%)、湿巾品系 (94.6%)」规则必审；护理 (4.7%) 与其他 (9.4%) 按需维护",
      ruleRef: "MDM 四品类必填矩阵 + 示例校验规范规则7（纸长/纸宽与软抽长宽互换校验）",
      whyNotGlobal: "卫卷使用「卷高×节距」表达单节尺寸，非卷类干巾与湿巾使用「纸长×纸宽」。",
      classifyRow: (r, fam) => (["dry_mian", "dry_zhi", "dry_can"].includes(fam) || (fam === "wet" && r.isCombo !== "是") ? "req" : "opt"),
    };
  } else if (["rollNet", "rollGross"].includes(key)) {
    spec = {
      scopeType: "scoped",
      badge: "干巾四品类+湿巾必审",
      badgeCls: "blue",
      scopeTitle: "「干巾四品类（面巾/卫卷/纸巾/餐巾）+ 湿巾品系」规则必审；护理 (6.9%) 与其他 (20.5%) 按需维护",
      ruleRef: "示例工艺属性规范 · 规则10（小卷/包净重 < 小卷/包毛重 及 ×装数一致性）",
      whyNotGlobal: "干巾与湿巾按单卷/单包克重核查（规则10），个护与器具类按需维护。",
      classifyRow: (r, fam) => (["dry_mian", "dry_roll", "dry_zhi", "dry_can"].includes(fam) || (fam === "wet" && r.isCombo !== "是") ? "req" : "opt"),
    };
  } else if (key === "quant") {
    spec = {
      scopeType: "scoped",
      badge: "干巾必审+湿巾主力",
      badgeCls: "blue",
      scopeTitle: "「干巾四品类（95.6%~99.9%）」与「湿巾品系（94.4%）」高频必审维护；护理品系无原纸定量概念留空属正常",
      ruleRef: "示例工艺属性规范 · 规则3（成品定量 g/m² 校验）",
      whyNotGlobal: "成品定量针对生活用纸原纸与湿巾基材克重，护理品系无需维护。",
      classifyRow: (r, fam) => (String(r["制造类别"] || "") !== "其他" && ["dry_mian", "dry_roll", "dry_zhi", "dry_can"].includes(fam) ? "req" : "opt"),
    };
  } else if (key === "pian") {
    spec = {
      scopeType: "scoped",
      badge: "湿巾/护理(含片单位)必审",
      badgeCls: "orange",
      scopeTitle: "当「包装规格单位 1~4」含 pian / 片 时必审（实测「湿巾品系 99.9%」「护理品系 97.2%」均已维护 pian数量）；按包/卷计量的干巾留空属正常",
      ruleRef: "示例工艺属性规范 · 规则11（pian数量 × 规格乘积 = 1）",
      whyNotGlobal: "湿巾与护理品（尿裤/卫生巾/护理垫）绝大部分以“片”为最小单位（>97% 维护），而干巾以抽/卷/包为单位无需维护。",
      classifyRow: (r) => {
        const uStr = [r["包装规格单位1"], r["包装规格单位2"], r["包装规格单位3"], r["包装规格单位4"]].map((x) => String(x || "").toLowerCase()).join("|");
        return (uStr.indexOf("pian") >= 0 || uStr.indexOf("片") >= 0) ? "req" : "opt";
      },
    };
  } else if (key === "销售小类（市场部）") {
    spec = {
      scopeType: "scoped",
      badge: "护理品系主力维护",
      badgeCls: "blue",
      scopeTitle: "「护理品系」核心分类字段（实测护理品系 88.7% 即 1,047/1,180 条已维护）；干巾与湿巾主要使用五级架构销售小类",
      ruleRef: "市场部个护品类管理口径（实测护理 88.7% 维护）",
      whyNotGlobal: "该字段主要由个人护理品类（失禁护理、女性护理）维护，按护理品系审视才准确。",
      classifyRow: (r, fam) => (fam === "care" ? "req" : "opt"),
    };
  } else if (key === "单/多片装" || key === "配方") {
    spec = {
      scopeType: "scoped",
      badge: "湿巾品系主力维护",
      badgeCls: "blue",
      scopeTitle: "「湿巾品系」核心工艺/包装属性（实测湿巾 " + (key === "单/多片装" ? "99.8%" : "93.6%") + " 已维护）；其余品系按需选填",
      ruleRef: "湿巾工艺与包装管理规范",
      whyNotGlobal: "该字段专门服务湿巾品系（单片独立装 vs 多片装、药液配方），干巾和护理通常不启用。",
      classifyRow: (r, fam) => (fam === "wet" ? "req" : "opt"),
    };
  } else if (["小包/袋/盒产品条码", "手抽/中袋条形码", "外包装条形码（选择组织）", "基准条码"].includes(key)) {
    spec = {
      scopeType: "scoped",
      badge: "电商必审·全品系通用",
      badgeCls: "orange",
      scopeTitle: "「是否电商 = 是」的产品规则必审（至少维护一项条码）；线下零售产品同样高频维护（实测基准条码全品类 >90%、小包/中袋条码 >87%）",
      ruleRef: "示例工艺属性规范 · 规则1（电商条码一致性）",
      whyNotGlobal: "零售与电商产品均高频维护条码，仅部分商用大盘纸或内部专供品无需零售条码。",
      classifyRow: (r) => (r.ecom === "是" ? "req" : "opt"),
    };
  } else if (reqDryCats.size > 0 || optDryCats.size > 0) {
    /* 干巾四品类矩阵中定义的字段（如小包长宽高、单提长宽高、中包包装方式、层数、压线/压花、装箱方式等） */
    const reqNames = [...reqDryCats].map((fid) => (BIZ_FAMILIES.find((f) => f.id === fid) || {}).short || fid);
    const badge = reqNames.length === 4 ? "干巾四品类必审" : (reqNames.length ? reqNames.join("/") + "必审·跨品系通用" : "跨品系选填适用");
    spec = {
      scopeType: "scoped",
      badge,
      badgeCls: reqNames.length ? "blue" : "orange",
      scopeTitle: (reqNames.length ? "规则必审域：「" + reqNames.join("、") + "」；" : "")
        + "湿巾、护理及其他品系根据产品包装形态常规维护（见下方 7 大业务族群实测覆盖率矩阵）",
      ruleRef: "MDM 干巾四品类关键字段完整性矩阵" + (["小包长度", "小包宽度", "单包高度"].includes(key) ? " + 示例校验规范规则8" : ""),
      whyNotGlobal: "不同品系的包装与工艺形态不同（例如卫卷无小包长宽高，但面巾/纸巾/湿巾高频维护；单提长宽高在干巾/湿巾/护理中均广泛维护），按族群分层可准确识别真正缺口。",
      classifyRow: (r, fam) => {
        if (fam === "dry_mian" && ["小包长度", "小包宽度", "单包高度"].includes(key)) {
          const box = r["纸盒尺寸"];
          if (box && String(box).trim() !== "无" && parseBoxDims(box)) return "opt";
        }
        if (["小包长度", "小包宽度", "单包高度"].includes(key) && fam === "wet" && r.isCombo !== "是") {
          return "req";
        }
        return reqDryCats.has(fam) ? "req" : "opt";
      },
    };
  } else if (["net", "netNG", "gross", "spec", "load", "unit", "cat", "brand", "status", "material", "desc", "体积", "重量单位", "体积单位", "长(外包装)", "宽(外包装)", "高(外包装)", "包装一单位", "包装一数量", "包装二单位", "包装二数量"].includes(key)) {
    spec = {
      scopeType: "global",
      badge: "全品类核心必审",
      badgeCls: "green",
      scopeTitle: "全品类通用核心主数据字段（干巾、湿巾、护理及所有成品均需维护，实测覆盖率 >98%）",
      ruleRef: "MDM 全局主数据基础规范 + 示例校验规范规则2（净重/不含赠品净重/毛重三件套）",
      whyNotGlobal: "此字段属于跨品类全局通用核心属性，所有有效成品均在必审适用域内。",
      classifyRow: () => "req",
    };
  } else if (["包装规格单位1", "包装规格数量1"].includes(key)) {
    spec = {
      scopeType: "global",
      badge: "一级包装成对必审",
      badgeCls: "green",
      scopeTitle: "全品类一级包装规格必审（单位1与数量1必须成对维护且数量>0）",
      ruleRef: "MDM 包装层级与成对校验规范（规则4）",
      whyNotGlobal: "所有成品至少具备一级基础包装单位与数量。",
      classifyRow: () => "req",
    };
  } else if (["包装规格单位2", "包装规格数量2", "包装规格单位3", "包装规格数量3", "包装规格单位4", "包装规格数量4"].includes(key)) {
    const lvl = key.slice(-1);
    const uKey = "包装规格单位" + lvl, qKey = "包装规格数量" + lvl;
    spec = {
      scopeType: "scoped",
      badge: "第" + lvl + "级包装成对适用",
      badgeCls: "orange",
      scopeTitle: "当产品存在第 " + lvl + " 级包装（单位" + lvl + "/数量" + lvl + "任一已填）时必审成对；单层/少层包装留空属正常",
      ruleRef: "MDM 包装层级与成对校验规范（单位1~4与数量1~4必须成对）",
      whyNotGlobal: "仅当产品具备第 " + lvl + " 级包装时才需成对维护，双双留空代表无该包装层级。",
      classifyRow: (r) => {
        const u = r[uKey], q = r[qKey];
        const hasU = u !== null && u !== undefined && String(u).trim() !== "";
        const hasQ = q !== null && q !== undefined && String(q).trim() !== "";
        return (hasU || hasQ) ? "req" : "opt";
      },
    };
  } else {
    spec = {
      scopeType: "optional",
      badge: "按品系实测分布",
      badgeCls: "",
      scopeTitle: "跨品类通用/扩展属性（系统根据下方 7 大业务族群的实测填报密度自动区分「🟢主力使用域 ≥50%」「🔹按需选填域」与「⚪暂未启用 0%」）",
      ruleRef: "MDM 成品属性表（123列实测分布）",
      whyNotGlobal: "不同品系对该字段的实际使用率不同，系统已自动剔除 0% 暂未启用的品系分母，避免跨品类假缺失。",
      classifyRow: () => "opt",
    };
  }

  _fieldScopeCache.set(key, spec);
  return spec;
}

/* 计算单个字段在指定行集 rs 上的客观适用域与 7 大族群实测分布 */
function computeFieldScopeStats(key, rs) {
  const spec = getFieldScopeSpec(key);
  let reqTotal = 0, reqFilled = 0, reqNone = 0, reqMiss = 0;
  let optTotal = 0, optFilled = 0, optNone = 0, optEmpty = 0;
  let globalFilled = 0, globalNone = 0;

  const byFam = {};
  BIZ_FAMILIES.forEach((f) => {
    byFam[f.id] = {
      id: f.id,
      name: f.name,
      short: f.short,
      total: 0,
      filled: 0,
      none: 0,
      empty: 0,
      reqTotal: 0,
      reqFilled: 0,
      reqNone: 0,
      reqMiss: 0,
      optTotal: 0,
      optFilled: 0,
      optNone: 0,
      optEmpty: 0,
      densityPct: 0,
      role: "opt", /* req=规则必审域 | high=主力使用域(≥50%) | opt=按需选填域(>0%) | zero=暂未启用(0%) */
    };
  });

  for (const r of rs) {
    const fam = getRowFamily(r);
    const rowRole = spec.classifyRow(r, fam);
    const v = r[key];
    const isNone = isConfirmedNoneVal(v);
    const isFill = !isNone && isFilledVal(v);

    if (isFill) globalFilled++;
    else if (isNone) globalNone++;

    const fb = byFam[fam];
    if (fb) {
      fb.total++;
      if (isFill) fb.filled++;
      else if (isNone) fb.none++;
      else fb.empty++;
    }

    if (rowRole === "req") {
      reqTotal++;
      if (fb) fb.reqTotal++;
      if (isFill) {
        reqFilled++;
        if (fb) fb.reqFilled++;
      } else if (isNone) {
        reqNone++;
        if (fb) fb.reqNone++;
      } else {
        reqMiss++;
        if (fb) fb.reqMiss++;
      }
    } else {
      optTotal++;
      if (fb) fb.optTotal++;
      if (isFill) {
        optFilled++;
        if (fb) fb.optFilled++;
      } else if (isNone) {
        optNone++;
        if (fb) fb.optNone++;
      } else {
        optEmpty++;
        if (fb) fb.optEmpty++;
      }
    }
  }

  /* 基于各族群真实数据覆盖率 + 规则必审数，客观判定每个族群的角色，并汇总“活跃适用域（排除 0% 未启用品系）” */
  let activeFamTotal = 0, activeFamConfirmed = 0;
  let zeroFamTotal = 0, highFamCount = 0, reqFamCount = 0;
  BIZ_FAMILIES.forEach((f) => {
    const fb = byFam[f.id];
    if (!fb || fb.total === 0) return;
    const confirmed = fb.filled + fb.none;
    fb.densityPct = Math.round((confirmed / fb.total) * 1000) / 10;
    if (fb.reqTotal > 0) {
      fb.role = "req";
      reqFamCount++;
      activeFamTotal += fb.total;
      activeFamConfirmed += confirmed;
    } else if (fb.densityPct >= 50) {
      fb.role = "high";
      highFamCount++;
      activeFamTotal += fb.total;
      activeFamConfirmed += confirmed;
    } else if (confirmed > 0) {
      fb.role = "opt";
    } else {
      fb.role = "zero";
      zeroFamTotal += fb.total;
    }
  });

  const hasReqScope = reqTotal > 0;
  /* 若存在明确规则必审行，则必审适用域确认率以 reqTotal 为分母；否则以实测主力使用域(≥50%)或全量为分母 */
  const scopeDenom = hasReqScope ? reqTotal : (activeFamTotal > 0 ? activeFamTotal : rs.length);
  const scopeConfirmed = hasReqScope ? (reqFilled + reqNone) : (activeFamTotal > 0 ? activeFamConfirmed : (globalFilled + globalNone));
  const scopeRate = scopeDenom ? (scopeConfirmed / scopeDenom * 100) : 100;
  const globalRate = rs.length ? ((globalFilled + globalNone) / rs.length * 100) : 0;

  return {
    spec,
    total: rs.length,
    hasReqScope,
    reqTotal, reqFilled, reqNone, reqMiss,
    optTotal, optFilled, optNone, optEmpty,
    activeFamTotal, activeFamConfirmed, zeroFamTotal, highFamCount, reqFamCount,
    globalFilled, globalNone,
    scopeDenom, scopeConfirmed,
    scopeRate: Math.round(scopeRate * 10) / 10,
    globalRate: Math.round(globalRate * 10) / 10,
    byFam,
  };
}

/* 同义异形词 / 分隔符不统一自动聚类检测 */
function detectSynonymClusters(items) {
  const map = new Map();
  for (const [val, cnt] of items) {
    const s = String(val).trim();
    if (s.length < 2) continue;
    /* 归一化：统一大小写、全角半角、乘号(* x X ×)、连接符(_ - / 空格 括号) */
    const norm = s
      .toLowerCase()
      .replace(/[×xX＊*]/g, "×")
      .replace(/[\s_\-\/\\|·•,，。()（）【】\[\]]+/g, "")
      .trim();
    if (!norm || norm.length < 2) continue;
    if (!map.has(norm)) map.set(norm, []);
    map.get(norm).push([s, cnt]);
  }
  const clusters = [];
  for (const [norm, arr] of map.entries()) {
    if (arr.length >= 2) {
      const total = arr.reduce((a, b) => a + b[1], 0);
      clusters.push({ norm, variants: arr.sort((a, b) => b[1] - a[1]), total });
    }
  }
  return clusters.sort((a, b) => b.total - a.total).slice(0, 8);
}

function renderAnalyze() {
  const pick = document.getElementById("analyzePick");
  const out = document.getElementById("analyzeOut");
  if (!pick || !out) return;

  const af = state.analyzeFilter || { q: "", sort: "issue", scopeMode: "scope", valMode: "top", family: "" };
  const rsAll = derived.filtered || [];
  const anaKeys = state.order.filter((k) => !MDM_HIDDEN_KEYS.has(k));

  /* 预先计算每个字段在当前筛选范围内的适用域统计与关联异常数 */
  const fk = DATASET.flagFieldToKey || {};
  const fieldIssueCounts = {};
  for (const r of rsAll) {
    for (const fl of (r._flags || [])) {
      const seg = fl.split(":").pop();
      const k = fk[seg] || seg;
      fieldIssueCounts[k] = (fieldIssueCounts[k] || 0) + 1;
    }
  }

  const fieldSummaries = anaKeys.map((k) => {
    const s = schemaByKey.get(k);
    const st = computeFieldScopeStats(k, rsAll);
    const issueCnt = fieldIssueCounts[k] || 0;
    return { key: k, schema: s, st, issueCnt };
  });

  /* 排序与搜索过滤左侧字段列表 */
  const q = (af.q || "").trim().toLowerCase();
  const filteredFields = fieldSummaries.filter((item) => {
    if (!q) return true;
    return item.schema.label.toLowerCase().includes(q)
      || item.key.toLowerCase().includes(q)
      || item.schema.group.toLowerCase().includes(q)
      || item.st.spec.badge.toLowerCase().includes(q);
  });

  if (af.sort === "issue") {
    filteredFields.sort((a, b) => (b.st.reqMiss + b.issueCnt + b.st.naFilled) - (a.st.reqMiss + a.issueCnt + a.st.naFilled));
  } else if (af.sort === "miss") {
    filteredFields.sort((a, b) => b.st.reqMiss - a.st.reqMiss || a.st.scopeRate - b.st.scopeRate);
  } else if (af.sort === "nafill") {
    filteredFields.sort((a, b) => b.st.naFilled - a.st.naFilled || b.issueCnt - a.issueCnt);
  }

  /* 左侧：134 字段健康度雷达导航栏 */
  let ph = '<div style="display:grid;gap:7px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<span style="font-size:12.5px;font-weight:750;color:var(--ink)">' + ic("layers", 13) + " 字段适用域健康度导航（" + filteredFields.length + "/" + anaKeys.length + "）</span>"
    + '</div>'
    + '<input type="text" id="anaFieldSearch" class="vconf-search" style="width:100%;padding:5px 9px;font-size:12px" placeholder="搜字段名 / 分组 / 适用域（如：卫卷、湿巾）…" value="' + esc(af.q || "") + '">'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap">'
    + '<button class="fchip sm' + (af.sort === "issue" ? " on" : "") + '" data-act="ana-sort-fields" data-v="issue">待处理优先</button>'
    + '<button class="fchip sm' + (af.sort === "miss" ? " on" : "") + '" data-act="ana-sort-fields" data-v="miss">适用域缺口优先</button>'
    + '<button class="fchip sm' + (af.sort === "nafill" ? " on" : "") + '" data-act="ana-sort-fields" data-v="nafill">越界填报优先</button>'
    + '<button class="fchip sm' + (af.sort === "order" ? " on" : "") + '" data-act="ana-sort-fields" data-v="order">原表顺序</button>'
    + '</div>'
    + '<div class="ana-flist">';

  for (const item of filteredFields) {
    const k = item.key;
    const s = item.schema;
    const st = item.st;
    const on = k === state.analyzeField;
    const rate = st.scopeRate;
    const barCol = rate >= 95 ? "var(--green)" : rate >= 70 ? "var(--orange)" : "var(--red)";
    ph += '<div class="ana-fitem' + (on ? " on" : "") + '" data-act="ana-pick-field" data-v="' + esc(k) + '">'
      + '<div class="af-top">'
      + '<span class="af-name" title="' + esc(s.label) + '">' + esc(s.label) + '</span>'
      + '<span class="tag ' + st.spec.badgeCls + '" style="font-size:10px;padding:0 5px">' + esc(st.spec.badge) + '</span>'
      + '</div>'
      + '<div class="af-sub">'
      + '<span>' + esc(s.group) + " · " + (st.hasReqScope ? "适用域 " + st.reqTotal.toLocaleString() + " 条" : "选填域 " + st.optTotal.toLocaleString() + " 条") + '</span>'
      + '<span style="display:flex;gap:4px;align-items:center">'
      + (st.reqMiss > 0 ? '<b style="color:var(--red)">缺 ' + st.reqMiss.toLocaleString() + '</b>' : "")
      + (st.naFilled > 0 ? '<b style="color:var(--orange)" title="非适用域却填了值">越界 ' + st.naFilled.toLocaleString() + '</b>' : "")
      + '<b style="color:' + barCol + '">' + rate + '%</b>'
      + '</span></div>'
      + '<div class="af-bar"><i style="width:' + Math.max(2, rate) + '%;background:' + barCol + '"></i></div>'
      + '</div>';
  }
  ph += "</div></div>";
  pick.innerHTML = ph;

  /* 右侧：当前选中字段的三域分离深度诊断工作台 */
  const key = state.analyzeField;
  if (!key || !schemaByKey.has(key) || !rsAll.length) {
    out.innerHTML = renderScopeLinkageBar("字段分析") + (rsAll.length ? "" : '<div class="stat-card wide" style="color:var(--subtle)">当前筛选无数据，调整筛选后再分析。</div>');
    return;
  }

  const s = schemaByKey.get(key);
  const stAll = computeFieldScopeStats(key, rsAll);
  const spec = stAll.spec;

  /* 根据用户选择的 scopeMode（仅看必审适用域 vs 全量跨品类）与 family 过滤当前用于分布分析的行集 */
  const activeRows = rsAll.filter((r) => {
    const fam = getRowFamily(r);
    if (af.family && fam !== af.family) return false;
    if (af.scopeMode === "scope" && stAll.hasReqScope) {
      return spec.classifyRow(r, fam) === "req";
    }
    return true;
  });

  let filled = 0, noneCnt = 0, emptyCnt = 0;
  const vals = [];
  for (const r of activeRows) {
    const v = r[key];
    if (isConfirmedNoneVal(v)) { noneCnt++; continue; }
    if (isFilledVal(v)) { filled++; vals.push(v); continue; }
    emptyCnt++;
  }

  const biasGap = Math.round(Math.abs(stAll.scopeRate - stAll.globalRate) * 10) / 10;

  /* 1. 顶部：字段适用域边界说明与防误判横幅 */
  let h = renderScopeLinkageBar("字段分析") + '<div class="ana-scope-banner">'
    + '<div class="sb-top">'
    + '<span class="sb-title">' + ic("sliders", 14) + " 「" + esc(s.label) + "」业务适用域边界诊断</span>"
    + '<span class="tag ' + spec.badgeCls + '">' + esc(spec.badge) + '</span>'
    + '<span class="tag">' + esc(s.group) + " · " + esc(s.type) + '</span>'
    + '<span style="font-size:11.5px;color:var(--muted);margin-left:auto">依据：' + esc(spec.ruleRef) + '</span>'
    + '</div>'
    + '<div class="sb-desc">'
    + '<div>🎯 <b>适用范围说明</b>：' + esc(spec.scopeTitle) + '</div>'
    + '<div style="margin-top:3px;color:#3b5878">💡 <b>为什么不能按全表一刀切审批</b>：' + esc(spec.whyNotGlobal)
    + (stAll.zeroFamTotal > 0 ? '（当前筛选下有 <b>' + stAll.zeroFamTotal.toLocaleString() + '</b> 个物料所在族群暂未使用此字段，不据此判断缺失）' : "")
    + '</div></div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:2px">'
    + '<span style="font-size:11.5px;font-weight:700;color:var(--blue-deep)">下方分布图统计口径：</span>'
    + (stAll.hasReqScope
        ? '<button class="fchip sm' + (af.scopeMode === "scope" ? " on" : "") + '" data-act="ana-scope-mode" data-v="scope">🎯 仅统计必审适用域 (' + stAll.reqTotal.toLocaleString() + ' 条 · 推荐防误判)</button>'
          + '<button class="fchip sm' + (af.scopeMode === "all" ? " on" : "") + '" data-act="ana-scope-mode" data-v="all">🌐 统计当前筛选全品类 (' + rsAll.length.toLocaleString() + ' 条)</button>'
        : '<span class="tag">当前字段为跨品系选填/通用属性（共 ' + rsAll.length.toLocaleString() + ' 条）</span>')
    + (af.family ? '<button class="fchip sm on warn" data-act="ana-family-filter" data-v="">当前锁定族群：' + esc((BIZ_FAMILIES.find((f) => f.id === af.family) || {}).name || af.family) + ' ✕</button>' : "")
    + '</div></div>';

  /* 2. 三域分离核心指标卡片行（必审适用域 vs 选填域 vs 不适用域 N/A） */
  h += '<div class="stat-card">'
    + '<div class="lb">🎯 必审适用域确认率（剔除不适用域）</div>'
    + donutHtml(stAll.scopeRate, stAll.hasReqScope ? "必审适用域 (" + stAll.reqTotal.toLocaleString() + "条)" : "选填参考域 (" + stAll.optTotal.toLocaleString() + "条)",
        "有效值 " + (stAll.hasReqScope ? stAll.reqFilled : stAll.optFilled).toLocaleString()
        + ((stAll.hasReqScope ? stAll.reqNone : stAll.optNone) ? " + 填“无” " + (stAll.hasReqScope ? stAll.reqNone : stAll.optNone).toLocaleString() : ""))
    + '</div>';

  h += '<div class="stat-card">'
    + '<div class="lb">🌐 若按全表粗算有值率（对比参照）</div>'
    + donutHtml(stAll.globalRate, "全表粗算 (" + rsAll.length.toLocaleString() + "条)",
        biasGap >= 3 ? '<span style="color:var(--orange);font-weight:700">跨品类粗算会低估/偏差 ' + biasGap + '%</span>' : "与适用域口径基本一致")
    + '</div>';

  h += '<div class="stat-card">'
    + '<div class="lb">⚠️ 适用域内真正待补录</div>'
    + '<div class="vl" style="color:' + (stAll.reqMiss > 0 ? "var(--red)" : "var(--green)") + '">' + stAll.reqMiss.toLocaleString() + ' <small style="font-size:12px;font-weight:500;color:var(--muted)">个 SKU</small></div>'
    + '<div style="font-size:11.5px;color:var(--muted);margin-top:4px">'
    + (stAll.reqMiss > 0
        ? '仅统计必审适用域内为空的物料<div style="margin-top:6px"><button class="mini-btn primary" style="padding:3px 8px;min-height:24px;font-size:11.5px" data-act="ana-drill-missing" data-field="' + esc(key) + '" data-mode="req_miss">' + ic("filter", 11) + ' 筛选这 ' + stAll.reqMiss.toLocaleString() + ' 个待补 SKU</button></div>'
        : (stAll.hasReqScope ? "适用域内全部已维护或已确认填“无”" : "该字段无强制必审缺失"))
    + '</div></div>';

  h += '<div class="stat-card">'
    + '<div class="lb">🔹 选填域维护情况</div>'
    + '<div class="vl">' + stAll.optTotal.toLocaleString() + ' <small style="font-size:12px;font-weight:500;color:var(--muted)">个选填 SKU</small></div>'
    + '<div style="font-size:11.5px;color:var(--muted);margin-top:4px">'
    + '已维护或确认填“无” <b>' + (stAll.optFilled + stAll.optNone).toLocaleString() + '</b> 条'
    + ' · 按需未填 <b>' + stAll.optEmpty.toLocaleString() + '</b> 条'
    + '</div></div>';

  /* 3. 7 大业务族群 × 字段填报状态透视矩阵表（一眼看清哪个品类必填、哪个品类不适用、哪个品类越界） */
  h += '<div class="chart-box" style="grid-column:1/-1">'
    + '<div class="ct" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'
    + '<span>' + ic("grid", 13) + ' 7 大业务产品族群 × 「' + esc(s.label) + '」适用域与填报透视矩阵（点击任意族群可单独锁定分析）</span>'
    + '<span style="font-size:11px;font-weight:500;color:var(--subtle)">🎯必审适用域：按规则检查 ｜ 🟢主力使用域：维护密度≥50% ｜ 🔹按需选填 ｜ ⚪暂未启用</span>'
    + '</div>'
    + '<div style="overflow-x:auto"><table class="scope-matrix"><thead><tr>'
    + '<th>业务产品族群</th><th>该族群对本字段的角色</th><th>族群总 SKU</th><th>已填有效值</th><th>填“无”(已确认)</th><th>留空数与性质判定</th><th>确认率 / 越界诊断</th><th>快速聚焦</th>'
    + '</tr></thead><tbody>';

  for (const fam of BIZ_FAMILIES) {
    const fb = stAll.byFam[fam.id];
    if (!fb || fb.total === 0) continue;
    const isOnFam = af.family === fam.id;
    const roleTag = fb.role === "req"
      ? '<span class="tag blue">🎯 必审适用域</span>'
      : fb.role === "high"
      ? '<span class="tag green">🟢 主力使用域</span>'
      : fb.role === "opt"
      ? '<span class="tag">🔹 条件/选填域</span>'
      : '<span class="tag" style="background:#f1f4f8;color:var(--subtle)">⚪ 暂未启用</span>';

    let emptyDesc = "0";
    if (fb.empty > 0) {
      if (fb.reqMiss > 0) emptyDesc = '<b style="color:var(--red)">' + fb.reqMiss.toLocaleString() + ' 条 ⚠️待补录</b>' + (fb.optEmpty ? '；' + fb.optEmpty.toLocaleString() + ' 条选填未填' : '');
      else if (fb.role !== "zero") emptyDesc = '<span style="color:var(--muted)">' + fb.empty.toLocaleString() + ' 条（选填未填）</span>';
      else emptyDesc = '<span style="color:var(--green)">' + fb.empty.toLocaleString() + ' 条 ✅合理留空</span>';
    }

    let rateDesc = "";
    if (fb.role === "req") {
      const rPct = fb.reqTotal ? Math.round((fb.reqFilled + fb.reqNone) / fb.reqTotal * 1000) / 10 : 100;
      const col = rPct >= 95 ? "var(--green)" : rPct >= 70 ? "var(--orange)" : "var(--red)";
      rateDesc = '<b style="color:' + col + '">确认率 ' + rPct + '%</b>' + (fb.reqMiss > 0 ? ' <small style="color:var(--red)">(缺' + fb.reqMiss + ')</small>' : "");
    } else if (fb.role === "opt" || fb.role === "high") {
      const oPct = fb.total ? Math.round((fb.filled + fb.none) / fb.total * 1000) / 10 : 0;
      rateDesc = '<span style="color:var(--muted)">维护密度 ' + oPct + '%</span>';
    } else {
      rateDesc = '<span style="color:var(--subtle)">维护密度 0%</span>';
    }

    h += '<tr style="' + (isOnFam ? "background:#edf5ff;font-weight:650" : "") + '">'
      + '<td><b>' + esc(fam.name) + '</b><div style="font-size:10.5px;color:var(--subtle);font-weight:400">' + esc(fam.desc) + '</div></td>'
      + '<td>' + roleTag + '</td>'
      + '<td class="num">' + fb.total.toLocaleString() + '</td>'
      + '<td class="num"><b>' + fb.filled.toLocaleString() + '</b></td>'
      + '<td class="num">' + (fb.none ? fb.none.toLocaleString() : "—") + '</td>'
      + '<td>' + emptyDesc + '</td>'
      + '<td>' + rateDesc + '</td>'
      + '<td><button class="mini-btn' + (isOnFam ? " primary" : "") + '" style="padding:2px 8px;min-height:24px;font-size:11px" data-act="ana-family-filter" data-v="' + (isOnFam ? "" : esc(fam.id)) + '">' + (isOnFam ? "已锁定 ✕" : "仅看此族群") + '</button></td>'
      + '</tr>';
  }
  h += '</tbody></table></div></div>';

  /* 4. 数值分布 / 日期分布 / 文本枚举分布（基于当前选定的适用域行集 activeRows） */
  const scopeLabelText = (af.family ? ((BIZ_FAMILIES.find((f) => f.id === af.family) || {}).name + " · ") : "")
    + (af.scopeMode === "scope" && stAll.hasReqScope ? "仅必审适用域 " + activeRows.length.toLocaleString() + " 条" : "当前范围 " + activeRows.length.toLocaleString() + " 条");

  if (s.type === "number") {
    const nums = vals.map(Number).filter((n) => isFinite(n)).sort((a, b) => a - b);
    const bad = nums.filter((n) => n <= 0);
    const sum = nums.reduce((a, b) => a + b, 0);
    const med = nums.length ? (nums.length % 2 ? nums[(nums.length - 1) / 2] : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2) : 0;
    const p10 = nums.length ? nums[Math.floor(nums.length * 0.1)] : 0;
    const p90 = nums.length ? nums[Math.floor(nums.length * 0.9)] : 0;
    h += '<div class="stat-card"><div class="lb">最小值 / P10分位</div><div class="vl" style="font-size:18px">' + (nums.length ? fmt(nums[0]) + ' <small style="font-size:12px;color:var(--muted)">/ P10: ' + fmt(p10) + '</small>' : "—") + "</div></div>"
      + '<div class="stat-card"><div class="lb">中位数 / 平均值</div><div class="vl" style="font-size:18px">' + (nums.length ? fmt(med) + ' <small style="font-size:12px;color:var(--muted)">/ 均 ' + fmt(Math.round(sum / nums.length * 100) / 100) + '</small>' : "—") + "</div></div>"
      + '<div class="stat-card"><div class="lb">P90分位 / 最大值</div><div class="vl" style="font-size:18px">' + (nums.length ? fmt(p90) + ' <small style="font-size:12px;color:var(--muted)">/ 最大 ' + fmt(nums[nums.length - 1]) + '</small>' : "—") + "</div></div>"
      + '<div class="stat-card"><div class="lb">≤0 错值（' + esc(scopeLabelText) + '）</div><div class="vl" style="color:' + (bad.length ? "var(--red)" : "var(--green)") + '">' + bad.length + "</div></div>";
    if (nums.length) {
      const min = nums[0], max = nums[nums.length - 1];
      const B = 10, buckets = new Array(B).fill(0);
      for (const n of nums) { let i = Math.floor((n - min) / ((max - min) || 1) * B); if (i >= B) i = B - 1; if (i < 0) i = 0; buckets[i]++; }
      const labels = buckets.map((_, i) => fmt(Math.round((min + (max - min) * i / B) * 100) / 100));
      h += '<div class="chart-box" style="grid-column:1/-1"><div class="ct">' + ic("bar-chart", 13) + " 数值分布直方图（统计范围：" + esc(scopeLabelText) + "，有值 " + nums.length.toLocaleString() + " 条）</div>" + vbarsHtml(labels.map((lb, i) => [lb, buckets[i]])) + "</div>";
    }
  } else if (s.type === "date") {
    const years = {};
    for (const v of vals) { const y = String(v).slice(0, 4); years[y] = (years[y] || 0) + 1; }
    const items = Object.entries(years).sort((a, b) => a[0] < b[0] ? -1 : 1);
    h += '<div class="chart-box" style="grid-column:1/-1"><div class="ct">' + ic("calendar", 13) + " 按年度分布（" + esc(scopeLabelText) + "）</div>" + vbarsHtml(items) + "</div>";
  } else {
    const cnt = {};
    for (const v of vals) { const k2 = String(v).trim(); cnt[k2] = (cnt[k2] || 0) + 1; }
    const items = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    const tailItems = [...items].reverse().slice(0, 15);
    const synClusters = detectSynonymClusters(items);

    h += '<div class="stat-card"><div class="lb">唯一枚举值数（' + esc(scopeLabelText) + '）</div><div class="vl">' + items.length.toLocaleString() + "</div></div>"
      + '<div class="stat-card"><div class="lb">最高频枚举值</div><div class="vl" style="font-size:15px">' + esc(items.length ? items[0][0].slice(0, 20) : "—") + " <small>" + (items.length ? items[0][1].toLocaleString() + "条" : "") + "</small></div></div>";

    /* 同义异形词 / 符号不统一自动提示 */
    if (synClusters.length) {
      h += '<div class="syn-box" style="grid-column:1/-1">'
        + '<div class="syn-hd">' + ic("alert-triangle", 13) + ' 疑似同义异形词 / 符号不统一自动检测（共发现 ' + synClusters.length + ' 组写法差异，点击任意词条可在结果中筛选核查）</div>'
        + '<div class="syn-list">'
        + synClusters.map((c) => {
            return '<div class="syn-pair">'
              + c.variants.map(([vStr, vCnt], idx) =>
                  (idx > 0 ? '<span style="color:var(--orange);font-weight:750"> vs </span>' : "")
                  + '<button class="fchip sm" style="padding:1px 7px" data-act="ana-drill-val" data-field="' + esc(key) + '" data-val="' + esc(vStr) + '" title="点击筛选「' + esc(vStr) + '」">'
                  + esc(vStr) + ' <b>(' + vCnt.toLocaleString() + ')</b></button>'
                ).join("")
              + '</div>';
          }).join("")
        + '</div></div>';
    }

    const showItems = af.valMode === "tail" ? tailItems : items.slice(0, 15);
    h += '<div class="chart-box" style="grid-column:1/-1">'
      + '<div class="ct" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'
      + '<span>' + ic("bar-chart", 13) + ' 取值分布（统计范围：' + esc(scopeLabelText) + ' · 点击任意条目可下钻筛选）</span>'
      + '<span style="display:flex;gap:5px">'
      + '<button class="fchip sm' + (af.valMode !== "tail" ? " on" : "") + '" data-act="ana-val-mode" data-v="top">高频 TOP 15</button>'
      + '<button class="fchip sm' + (af.valMode === "tail" ? " on warn" : "") + '" data-act="ana-val-mode" data-v="tail">低频长尾 / 疑似孤立手误值 (' + items.filter((x) => x[1] <= 2).length + ' 个)</button>'
      + '</span></div>'
      + (showItems.length ? hbarsHtml(showItems, filled, key) : '<div style="color:var(--subtle);font-size:12px">当前范围内无有效非空取值</div>')
      + "</div>";
  }

  /* 5. 关联异常与一键筛选 */
  {
    const cnt = {};
    let hit = 0;
    for (const r of rsAll) {
      let f = false;
      for (const fl of r._flags) { const seg = fl.split(":").pop(); if ((fk[seg] || seg) === key) { const t = fl.split(":")[0]; cnt[t] = (cnt[t] || 0) + 1; f = true; } }
      if (f) hit++;
    }
    const types = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    h += '<div class="chart-box" style="grid-column:1/-1"><div class="ct">' + ic("alert-triangle", 13) + " 关联质量规则命中（命中「" + esc(s.label) + "」异常的 SKU：" + hit.toLocaleString() + " 个）</div>"
      + (types.length
        ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px">' + types.map(([t, n]) => {
            const m = FLAG_META[t] || { name: t, icon: "tag", sev: "low" };
            return '<span class="tag ' + (m.sev === "high" ? "red" : "orange") + '">' + ic(m.icon, 11) + esc(m.name) + " " + n.toLocaleString() + "</span>";
          }).join("") + "</div>"
          + '<button class="tool-btn' + (state.filters.onlyFieldIssue === key ? "" : " primary") + '" data-act="field-issue-filter" data-v="' + key + '">'
          + (state.filters.onlyFieldIssue === key ? "已在结果中筛选 · 点击取消" : "在查询结果中锁定这些异常 SKU") + "</button>"
        : '<span style="font-size:12.5px;color:var(--muted)">当前筛选范围内没有命中该字段的质量规则异常</span>')
      + "</div>";
  }
  out.innerHTML = h;
}

/* ---------- 口径与规则（固定分组顺序：一般性 → 工艺属性 → MPS 路线专项） ---------- */
function renderRules() {
  const rules = DATASET.rules || [];
  const scopedStats = derived.ruleStats;
  const groups = {};
  rules.forEach((r) => { const g = r.group || "MDM 质量口径"; (groups[g] = groups[g] || []).push(r); });
  const groupOrder = ["MDM 质量口径", "工艺属性自动检查（可配置规则）", "工艺属性自动检查（示例校验规范）", "MPS 工艺路线专项（独立板块·每次重算）"];
  const order = groupOrder.filter((g) => groups[g]).concat(Object.keys(groups).filter((g) => groupOrder.indexOf(g) < 0));
  let h = renderScopeLinkageBar("口径与规则");
  for (const g of order) {
    if (g.indexOf("工艺属性") === 0) {
      const ps = scopedStats.pdfScope;
      h += '<div style="font-size:11.5px;color:var(--subtle);margin:2px 0 7px">当前范围纳入检查 <b>' + (ps.inScope || 0).toLocaleString() + '</b> / ' + (ps.total || 0).toLocaleString() + ' 个物料；使用已保存的工艺属性规则，计数随筛选变化。</div>';

    }
    if (g.indexOf("MPS 工艺路线") === 0 || g.indexOf("路线专项") === 0) {
      h += '<div style="font-size:11.5px;color:var(--subtle);margin:2px 0 7px">每次导入新 MDM 源表时按 V2.3.2 规则实时重算工艺路线，覆盖 <b>'
        + derived.stats.routeCovered.toLocaleString() + '</b> 个当前筛选内的干巾四品类物料；请点击顶部 <a href="javascript:void(0)" data-act="tab" data-v="mps" style="color:var(--blue);font-weight:700">「MPS 工艺路线（专属）」</a> 板块查看</div>';
    }
    h += '<div style="font-size:12.5px;font-weight:750;color:var(--muted);margin:10px 0 7px">' + esc(g) + "</div>";
    h += groups[g].map((r) => {
      const st = r.no > 0 && r.enabled !== false ? scopedStats.pdfRules[String(r.no)] : null;
      const active = state.filters.onlyPdfRule === String(r.no);
      let statHtml = st ? '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">'
        + '<span class="tag ' + (st.block ? "red" : "orange") + '" data-rule-no="' + r.no + '" data-rule-hits="' + st.hits + '">' + ic(st.block ? "alert-octagon" : "alert-triangle", 11) + " 当前范围命中 " + st.hits.toLocaleString() + " 个 SKU" + (st.block ? " · 阻断 " + st.block.toLocaleString() : "") + "</span>"
        + (st.top || []).map(([k, n]) => '<span class="tag">' + esc(k) + " " + n.toLocaleString() + "</span>").join("")
        + '<button class="tool-btn' + (active ? "" : " primary") + '" data-act="pdf-rule-filter" data-target-tab="results" data-v="' + r.no + '">'
        + (active ? "已在结果中筛选 · 点击取消" : "在结果中筛选") + "</button></div>" : "";
      if (r.id === "vcode") {
        const vg = derived.stats ? derived.stats.vconfGroups : (STATS.vconfGroups || 0);
        const vs = derived.stats ? derived.stats.vconf : (STATS.vconf || 0);
        statHtml = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">'
          + '<span class="tag red">' + ic("link", 11) + " 当前范围冲突 " + vg.toLocaleString() + " 组 · 涉及 " + vs.toLocaleString() + " 个物料（全局 " + (STATS.vconfGroups || 0).toLocaleString() + " 组 / " + (STATS.vconf || 0).toLocaleString() + " 个）</span>"
          + '<button class="tool-btn primary" data-act="tab" data-v="vconf">' + ic("link", 12) + " 打开「同V码冲突」专属核查面板</button>"
          + '<button class="tool-btn' + (state.filters.onlyVconf ? "" : "") + '" data-act="vconf-filter-all">' + ic("filter", 12) + (state.filters.onlyVconf ? " 已在结果中筛选 · 点击取消" : " 在查询结果中筛选冲突 SKU") + "</button>"
          + "</div>";
      }
      return '<div class="rule-item"><div class="rt">' + ic("file-text", 13) + esc(r.title) + "</div><div class='rd'>" + esc(r.desc) + "</div>" + statHtml + "</div>";
    }).join("");
  }
  document.getElementById("rulesList").innerHTML = h;
  document.getElementById("govLegend").innerHTML = '<span style="font-size:12px;color:var(--subtle);width:100%">当前筛选范围内的治理归口（按问题条数统计，不含 MPS 工艺路线专项）：</span>'
    + DATASET.gov.map((g) => '<span class="tag ' + (GOV_COLOR[g.id] || "") + '" data-gov-id="' + g.id + '" data-gov-count="' + (scopedStats.govCounts[g.id] || 0) + '">' + ic(GOV_ICON[g.id] || "tag", 11) + esc(g.name) + " · " + (scopedStats.govCounts[g.id] || 0).toLocaleString() + "</span>").join("");
}

/* ---------- 产品组 MDM 常规治理：工艺属性检查 ---------- */
function processCheckRows() {
  return (derived.filtered || []).filter((r) => !state.processCheckFilter.onlyIssue || r.pdfCount > 0);
}
function processCheckIssues(r) {
  return (r._flags || []).filter((f) => f.startsWith("PF")).map((f) => {
    const [type, no, ...detail] = f.split(":");
    const rule = (DATASET.pdfRules || []).find((x) => String(x.no) === no);
    return { blocking: type === "PFN" || type === "PFC", text: "规则" + no + " · " + (rule ? rule.title : ((FLAG_META[type] || {}).name || type)) + (detail.length ? "：" + detail.join(":") : "") };
  });
}
function processCheckTableHtml() {
  const scoped = derived.filtered || [], list = processCheckRows();
  const mf = state.processCheckFilter;
  const pages = Math.max(1, Math.ceil(list.length / 50));
  const pg = Math.min(Math.max(1, mf.page || 1), pages);
  state.processCheckFilter.page = pg;
  const hits = scoped.filter((r) => r.pdfCount > 0).length;
  const blocks = scoped.filter((r) => r.pdfBlock > 0).length;
  let h = renderScopeLinkageBar("工艺属性检查")
    + '<div class="process-check-head"><div class="process-check-note">覆盖当前筛选内全部品类；点击物料核对原始字段和问题明细。</div>'
    + '<div class="fchips"><button class="fchip' + (!mf.onlyIssue ? ' on' : '') + '" data-act="process-check-scope" data-v="all">全部 ' + scoped.length.toLocaleString() + '</button>'
    + '<button class="fchip' + (mf.onlyIssue ? ' on' : '') + '" data-act="process-check-scope" data-v="issues">有问题 ' + hits.toLocaleString() + '</button>'
    + '<span class="tag red">含阻断 ' + blocks.toLocaleString() + ' 个物料</span></div></div>'
    + '<div class="process-check-pager"><span>共 <b data-process-check-total="' + list.length + '">' + list.length.toLocaleString() + '</b> 条记录 · 第 ' + pg + ' / ' + pages + ' 页</span><div class="fchips">'
    + '<button class="mini-btn" data-act="process-check-page" data-v="' + (pg - 1) + '"' + (pg <= 1 ? ' disabled' : '') + '>上一页</button>'
    + '<button class="mini-btn" data-act="process-check-page" data-v="' + (pg + 1) + '"' + (pg >= pages ? ' disabled' : '') + '>下一页</button></div></div>';
  if (!list.length) return h + '<div class="empty">当前筛选范围内没有匹配的工艺属性记录</div>';
  h += tableXnavHtml("processCheckTableWrap", 8) + '<div class="table-wrap" id="processCheckTableWrap"><table class="grid identity-pair-grid"><thead><tr><th class="sticky-col sc-0">物料编码 📌</th><th class="sticky-col sc-1">物料说明</th><th>物料状态</th><th>品类三级</th><th>工艺属性检查问题数</th><th>工艺属性阻断数</th><th>工艺属性检查明细</th><th class="sticky-right">操作 📌</th></tr></thead><tbody>';
  for (const r of list.slice((pg - 1) * 50, pg * 50)) {
    const issues = processCheckIssues(r);
    const excluded = !processInScope(r);
    h += '<tr class="row" data-material="' + esc(r.material) + '"><td class="mono sticky-col sc-0">' + esc(r.material) + (r.vcode ? '<div class="process-check-note">' + esc(r.vcode) + '</div>' : '') + '</td>'
      + '<td class="sticky-col sc-1"><div class="cell-desc" title="' + esc(r.desc) + '">' + esc(r.desc) + '</div></td><td>' + esc(r.status) + '</td><td>' + esc(r.cat) + '</td>'
      + '<td class="num" data-process-field="pdfCount">' + Number(r.pdfCount || 0).toLocaleString() + '</td><td class="num" data-process-field="pdfBlock">' + Number(r.pdfBlock || 0).toLocaleString() + '</td>'
      + '<td><div class="flagsum">' + (issues.length ? issues.map((x) => '<span class="tag ' + (x.blocking ? 'red' : 'orange') + '">' + esc(x.text) + '</span>').join('') : '<span class="tag' + (excluded ? '' : ' green') + '">' + (excluded ? '不纳入检查范围' : '无工艺属性问题') + '</span>') + '</div></td>'
      + '<td class="sticky-right"><div class="rowact"><button data-act="open-detail-page" data-material="' + esc(r.material) + '" title="查看物料详情">' + ic("eye", 13) + '</button></div></td></tr>';
  }
  return h + '</tbody></table></div>';
}
function renderProcessChecks() {
  const el = document.getElementById("processCheckBody");
  if (!el) return;
  el.innerHTML = processCheckTableHtml();
  syncTableXnav("processCheckTableWrap");
}

/* ---------- MPS 工艺路线专项（与常规 MDM 治理分开） ---------- */
function mpsRowMatches(r, filter, omit = "") {
  if (!r.route) return false;
  const iss = routeIssueMap.get(r.material) || [];
  return (omit === "status" || !filter.status || r.routeStatus === filter.status)
    && (omit === "cat" || !filter.cat || r.ruleCat === filter.cat)
    && (!filter.onlyIssue || r.routeStatus !== "完整" || iss.length > 0)
    && (omit === "issueType" || !filter.issueType || iss.some((x) => x[1] === filter.issueType));
}
function mpsFilteredRows(source = derived.filtered || [], filter = state.mpsFilter) {
  return source.filter((r) => mpsRowMatches(r, filter));
}
function mpsPanelData() {
  const mf = state.mpsFilter;
  const scoped = (derived.filtered || []).filter((r) => !!r.route);
  const list = mpsFilteredRows(scoped);
  // 同组标签表示替换当前选项后的命中量，继续叠加其他组和全局筛选。
  const statusScope = scoped.filter((r) => mpsRowMatches(r, mf, "status"));
  const catScope = scoped.filter((r) => mpsRowMatches(r, mf, "cat"));
  const issueScope = scoped.filter((r) => mpsRowMatches(r, mf, "issueType"));
  const statusCounts = Object.create(null), catCounts = Object.create(null), resultStatusCounts = Object.create(null);
  const issueTypeCounts = new Map(), baseIssueCounts = new Map();
  for (const r of statusScope) statusCounts[r.routeStatus] = (statusCounts[r.routeStatus] || 0) + 1;
  for (const r of catScope) catCounts[r.ruleCat] = (catCounts[r.ruleCat] || 0) + 1;
  for (const r of list) resultStatusCounts[r.routeStatus] = (resultStatusCounts[r.routeStatus] || 0) + 1;
  // 标签数按 SKU 去重，避免同一物料的多条同类问题放大计数。
  for (const r of scoped) for (const type of new Set((routeIssueMap.get(r.material) || []).map((x) => x[1]))) baseIssueCounts.set(type, (baseIssueCounts.get(type) || 0) + 1);
  for (const r of issueScope) for (const type of new Set((routeIssueMap.get(r.material) || []).map((x) => x[1]))) issueTypeCounts.set(type, (issueTypeCounts.get(type) || 0) + 1);
  if (mf.issueType && !baseIssueCounts.has(mf.issueType)) baseIssueCounts.set(mf.issueType, 0);
  const issueTypes = [...baseIssueCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).map(([type]) => [type, issueTypeCounts.get(type) || 0]);
  const withRouteIssue = mpsFilteredRows(scoped, { ...mf, onlyIssue: true }).length;
  return { scoped, list, statusScope, catScope, issueScope, statusCounts, catCounts, resultStatusCounts, issueTypes, withRouteIssue };
}
function renderMps() {
  const el = document.getElementById("mpsBody");
  if (!el) return;
  const mf = state.mpsFilter;
  const { scoped, list: mpsList, statusScope, catScope, issueScope, statusCounts, catCounts, resultStatusCounts: stCounts, issueTypes, withRouteIssue } = mpsPanelData();

  const mpsMeta = (DATASET.meta && DATASET.meta.mpsSummary) || {};
  let h = renderScopeLinkageBar("MPS 工艺路线") + '<div class="mps-banner">'
    + '<div><div style="font-weight:750;font-size:13.5px;color:var(--blue-deep)">' + ic("route", 14) + " " + esc(mpsMeta.engine || "MPS 工艺路线实时推导引擎 V2.3.2") + "</div>"
    + '<div style="font-size:12px;color:var(--muted);margin-top:3px">当前源表：<b>' + esc(DATASET.meta.source) + "</b>（" + esc(DATASET.meta.sourceMode || "本地源表") + " · 重算时间 " + esc(DATASET.meta.routeStamp || DATASET.meta.builtAt) + "） · 所有路线节点、包装数组 1~4 交叉校验与设备规则缺口均按本表实时计算，<b>不引用任何历史快照，也不计入全局 MDM 阻断</b></div></div>"
    + "</div>";

  /* KPI 卡片 */
  h += '<div class="mps-kpi-grid">'
    + '<div class="mps-kpi"><div class="k-lb">当前 MPS 筛选 SKU</div><div class="k-vl">' + mpsList.length.toLocaleString() + '</div><div class="k-sub">上方筛选范围内 ' + scoped.length.toLocaleString() + " 个路线 SKU</div></div>"
    + '<div class="mps-kpi"><div class="k-lb">工艺路线完整</div><div class="k-vl" style="color:var(--green)">' + (stCounts["完整"] || 0).toLocaleString() + '</div><div class="k-sub">占比 ' + (mpsList.length ? Math.round((stCounts["完整"] || 0) * 100 / mpsList.length) : 0) + "%</div></div>"
    + '<div class="mps-kpi"><div class="k-lb">待补 MDM 字段</div><div class="k-vl" style="color:var(--orange)">' + ((stCounts["待补MDM"] || 0) + (stCounts["待补MDM+设备规则"] || 0)).toLocaleString() + '</div><div class="k-sub">含同时待补设备规则 ' + (stCounts["待补MDM+设备规则"] || 0).toLocaleString() + "</div></div>"
    + '<div class="mps-kpi"><div class="k-lb">待补设备规则</div><div class="k-vl" style="color:var(--teal)">' + ((stCounts["待补设备规则"] || 0) + (stCounts["待补MDM+设备规则"] || 0)).toLocaleString() + '</div><div class="k-sub">机头/包装/加赠设备待映射</div></div>'
    + '<div class="mps-kpi"><div class="k-lb">路线逻辑异常</div><div class="k-vl" style="color:var(--red)">' + (stCounts["逻辑异常"] || 0).toLocaleString() + '</div><div class="k-sub">包装层级与路线或盒巾长宽冲突</div></div>'
    + "</div>";

  /* MPS 板块内专属筛选条 */
  const fbtn = (on, label, act, val, cls, count) => '<button class="fchip' + (on ? " on" : "") + (cls ? " " + cls : "") + '" data-act="' + act + '" data-v="' + esc(val) + '"' + (count === 0 && !on && val ? ' disabled title="与其他已选条件组合后无匹配 SKU"' : '') + '>' + label + "</button>";
  h += '<div class="fzone" style="margin-bottom:12px">'
    + '<div class="zone-head">' + ic("filter", 12) + " MPS 专属筛选 · 标签数量随其他已选条件联动（按 SKU 计数）"
    + ((mf.status || mf.cat || mf.issueType || mf.onlyIssue) ? '<span class="right"><button class="fchip" data-act="mps-clear-filter">' + ic("x", 11) + " 重置 MPS 筛选</button></span>" : "") + "</div>"
    + '<div class="frow"><span class="flabel">路线状态</span><div class="fchips">'
    + fbtn(mf.status === "", "全部 " + statusScope.length.toLocaleString(), "mps-status", "")
    + ["完整", "待补MDM", "待补设备规则", "待补MDM+设备规则", "逻辑异常"].map((st) =>
        fbtn(mf.status === st, st + " " + (statusCounts[st] || 0).toLocaleString(), "mps-status", st, st === "逻辑异常" ? "warn" : "", statusCounts[st] || 0)
      ).join("")
    + fbtn(mf.onlyIssue, "仅看未完整/有专项问题 " + withRouteIssue.toLocaleString(), "mps-only-issue", "1", "warn", withRouteIssue)
    + "</div></div>"
    + '<div class="frow"><span class="flabel">路线品类</span><div class="fchips">'
    + fbtn(mf.cat === "", "全部 " + catScope.length.toLocaleString(), "mps-cat", "")
    + ["面巾", "卫卷", "纸巾", "餐巾"].map((c) => fbtn(mf.cat === c, c + " " + (catCounts[c] || 0).toLocaleString(), "mps-cat", c, "", catCounts[c] || 0)).join("")
    + "</div></div>"
    + (issueTypes.length ? '<div class="frow"><span class="flabel">专项问题</span><div class="fchips">'
      + fbtn(mf.issueType === "", "全部问题类型 " + issueScope.length.toLocaleString(), "mps-issue-type", "")
      + issueTypes.map(([t, n]) => fbtn(mf.issueType === t, esc(t) + " " + n.toLocaleString(), "mps-issue-type", t, "sm", n)).join("")
      + "</div></div>" : "")
    + "</div>";

  /* MPS 明细列表（分页展示前 50 条） */
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(mpsList.length / pageSize));
  const pg = Math.min(Math.max(1, mf.page || 1), pages);
  state.mpsFilter.page = pg;
  const pageItems = mpsList.slice((pg - 1) * pageSize, pg * pageSize);

  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12.5px;color:var(--muted)">'
    + '<span>MPS 板块命中 <b data-mps-total="' + mpsList.length + '">' + mpsList.length.toLocaleString() + "</b> 个 SKU · 当前第 " + pg + " / " + pages + " 页</span>"
    + '<div style="display:flex;gap:6px">'
    + '<button class="mini-btn" data-act="mps-page" data-v="' + (pg - 1) + '"' + (pg <= 1 ? " disabled" : "") + ">上一页</button>"
    + '<button class="mini-btn" data-act="mps-page" data-v="' + (pg + 1) + '"' + (pg >= pages ? " disabled" : "") + ">下一页</button>"
    + "</div></div>";

  if (!pageItems.length) {
    h += '<div class="empty">' + ic("check-circle", 28) + "<div>当前 MPS 筛选条件下无匹配 SKU</div></div>";
  } else {
    h += tableXnavHtml("mpsTableWrap", 10)
      + '<div class="table-wrap" id="mpsTableWrap"><table class="grid identity-pair-grid"><thead><tr>'
      + "<th class=\"sticky-col sc-0\">物料编码 📌</th><th class=\"sticky-col sc-1\">物料说明</th><th>状态</th><th>路线品类</th><th>路线状态</th><th>实时推导工艺路线</th><th>节点完成</th><th>待补 MDM 字段</th><th>MPS 路线专项问题</th><th class=\"sticky-right\" title=\"右侧固定冻结操作列\">操作 📌</th>"
      + "</tr></thead><tbody>";
    for (const r of pageItems) {
      const iss = routeIssueMap.get(r.material) || [];
      const stCls = r.routeStatus === "完整" ? "green" : r.routeStatus === "逻辑异常" ? "red" : "orange";
      h += '<tr class="row" data-material="' + esc(r.material) + '">'
        + '<td class="mono sticky-col sc-0">' + esc(r.material) + (r.vcode && r.vcode !== r.material ? '<div style="font-size:11px;color:var(--subtle)">' + esc(r.vcode) + "</div>" : "") + "</td>"
        + '<td class="sticky-col sc-1"><div class="cell-desc" title="' + esc(r.desc) + '">' + esc(r.desc) + "</div></td>"
        + '<td><span class="tag ' + (r.status === "有效" ? "green" : "red") + '">' + esc(r.status || "—") + "</span></td>"
        + '<td><span class="tag blue">' + esc(r.ruleCat) + "</span></td>"
        + '<td><span class="tag ' + stCls + '">' + esc(r.routeStatus || "—") + "</span></td>"
        + '<td style="max-width:340px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px">' + esc(r.route || "—") + "</td>"
        + '<td class="num">' + esc(r.routeNodes || "—") + "</td>"
        + '<td>' + (r.routeMissing ? '<span style="color:var(--orange);font-size:12px">' + esc(r.routeMissing) + "</span>" : '<span style="color:var(--subtle)">—</span>') + "</td>"
        + '<td>' + (iss.length ? '<div class="flagsum">' + iss.map((x) => '<span class="tag ' + (x[0] === "高" ? "red" : "orange") + ' fsum" title="' + esc(x[3]) + '">' + esc(x[1]) + (x[2] ? "：" + esc(x[2]) : "") + "</span>").join("") + "</div>" : '<span class="tag green">无专项异常</span>') + "</td>"
        + '<td class="sticky-right"><div class="rowact"><button data-act="open-detail-page" data-material="' + esc(r.material) + '" title="全屏详情看板">' + ic("maximize", 13) + "</button>"
        + '<button data-act="view-detail" data-material="' + esc(r.material) + '" title="查看详情">' + ic("eye", 13) + "</button>"
        + '<button data-act="add-sku" data-material="' + esc(r.material) + '" title="加入对比">' + ic("plus", 13) + "</button></div></td>"
        + "</tr>";
    }
    h += "</tbody></table></div>";
  }
  el.innerHTML = h;
  if (typeof syncTableXnav === "function") syncTableXnav("mpsTableWrap");
}

/* ---------- 同V码冲突专属核查板块（按 V 码聚合展示多规格冲突组、一键加入对比篮对比、一键锁定查询） ---------- */
function buildScopedVconfGroups() {
  /* 保留全量冲突判定作为依据，展示明细和导出严格限制在当前筛选范围。 */
  const scoped = (derived.filtered || []).filter((r) => r.vconf && r.vcode);
  const scopedByV = new Map();
  for (const r of scoped) {
    if (!scopedByV.has(r.vcode)) scopedByV.set(r.vcode, []);
    scopedByV.get(r.vcode).push(r);
  }
  /* 同时建立全量非内部周转的同 V 码成员表，确保展开时能看到该 V 码下的所有冲突规格对手 */
  const allMembersByV = new Map();
  for (const r of rows) {
    if (!r.vcode || String(r.npt || "").trim() === "内部周转") continue;
    if (!scopedByV.has(r.vcode)) continue;
    if (!allMembersByV.has(r.vcode)) allMembersByV.set(r.vcode, []);
    allMembersByV.get(r.vcode).push(r);
  }
  const groups = [];
  for (const [vcode, scopedList] of scopedByV.entries()) {
    const allMembers = allMembersByV.get(vcode) || scopedList;
    const members = scopedList;
    const varMap = new Map();
    for (const m of members) {
      const k = String(m.load == null ? "" : m.load) + "||" + String(m.specC || "");
      if (!varMap.has(k)) {
        varMap.set(k, {
          key: k,
          load: m.load,
          spec: m.spec || "—",
          specC: m.specC || "—",
          specP: m.specP,
          unit: m.unit || "—",
          pack: m.pack || "—",
          cat: m.cat || "—",
          brand: m.brand || "—",
          skus: [],
        });
      }
      varMap.get(k).skus.push(m);
    }
    const variants = [...varMap.values()].sort((a, b) => b.skus.length - a.skus.length);
    const cats = [...new Set(members.map((x) => x.cat).filter(Boolean))];
    const brands = [...new Set(members.map((x) => x.brand).filter(Boolean))];
    groups.push({
      vcode,
      scopedCount: scopedList.length,
      materialCount: members.length,
      specCount: variants.length,
      fullMaterialCount: allMembers.length,
      fullSpecCount: new Set(allMembers.map((m) => String(m.load == null ? "" : m.load) + "||" + String(m.specC || ""))).size,
      cats,
      brands,
      variants,
      members,
    });
  }
  return groups;
}

function renderVconf() {
  const el = document.getElementById("vconfBody");
  if (!el) return;
  const vf = state.vconfFilter || { q: "", sort: "materials", expandAll: false, page: 1 };
  const allGroups = buildScopedVconfGroups();
  const q = (vf.q || "").trim().toLowerCase();

  let filteredGroups = allGroups.filter((g) => {
    if (!q) return true;
    if (g.vcode.toLowerCase().includes(q)) return true;
    return g.members.some((m) =>
      String(m.material || "").toLowerCase().includes(q)
      || String(m.spec || "").toLowerCase().includes(q)
      || String(m.specC || "").toLowerCase().includes(q)
      || String(m.desc || "").toLowerCase().includes(q)
      || String(m.cat || "").toLowerCase().includes(q)
      || String(m.brand || "").toLowerCase().includes(q)
    );
  });

  if (vf.sort === "specs") {
    filteredGroups.sort((a, b) => b.specCount - a.specCount || b.materialCount - a.materialCount || a.vcode.localeCompare(b.vcode));
  } else if (vf.sort === "vcode") {
    filteredGroups.sort((a, b) => a.vcode.localeCompare(b.vcode, "zh-Hans-CN"));
  } else {
    filteredGroups.sort((a, b) => b.materialCount - a.materialCount || b.specCount - a.specCount || a.vcode.localeCompare(b.vcode));
  }

  const totalSkus = filteredGroups.reduce((acc, g) => acc + g.scopedCount, 0);
  const multi3Plus = filteredGroups.filter((g) => g.fullSpecCount >= 3).length;

  let h = renderScopeLinkageBar("同V码冲突") + '<div class="mps-kpi-grid">'
    + '<div class="mps-kpi"><div class="k-lb">当前范围冲突 V 码组数</div><div class="k-vl" style="color:var(--red)">' + filteredGroups.length.toLocaleString() + ' <small style="font-size:12px;color:var(--muted);font-weight:500">组</small></div><div class="k-sub">全局共 ' + (STATS.vconfGroups || 0).toLocaleString() + ' 组冲突 V 码</div></div>'
    + '<div class="mps-kpi"><div class="k-lb">涉及冲突 SKU 数</div><div class="k-vl" style="color:var(--orange)">' + totalSkus.toLocaleString() + ' <small style="font-size:12px;color:var(--muted);font-weight:500">个</small></div><div class="k-sub">全局共 ' + (STATS.vconf || 0).toLocaleString() + ' 个物料命中同 V 码冲突</div></div>'
    + '<div class="mps-kpi"><div class="k-lb">全量≥3 种规格的命中组</div><div class="k-vl" style="color:var(--purple)">' + multi3Plus.toLocaleString() + ' <small style="font-size:12px;color:var(--muted);font-weight:500">组</small></div><div class="k-sub">当前范围命中的 V 码，全量存在 3 种及以上规格</div></div>'
    + '<div class="mps-kpi"><div class="k-lb">判定口径说明</div><div class="k-vl" style="font-size:13.5px;line-height:1.4;color:var(--blue-deep)">剔除「内部周转」<br>比对 原始装数 + 标准化规格</div><div class="k-sub">保留乘法因子顺序（1×10×6 = 10×6 ≠ 1×6×10）</div></div>'
    + '</div>';

  /* 工具栏：V码/规格搜索 + 排序 + 全部展开明细 */
  const sbtn = (on, lb, val) => '<button class="fchip' + (on ? " on" : "") + '" data-act="vconf-sort" data-v="' + val + '">' + lb + '</button>';
  h += '<div class="vconf-toolbar">'
    + '<input type="text" id="vconfSearchInput" class="vconf-search" placeholder="搜索冲突 V 码、物料编码、规格或说明…" value="' + esc(vf.q || "") + '">'
    + (vf.q ? '<button class="mini-btn" data-act="vconf-clear-q">' + ic("x", 12) + ' 清空搜索</button>' : '')
    + '<span style="font-size:12px;color:var(--subtle);margin-left:6px">排序：</span>'
    + sbtn(vf.sort === "materials", "按涉及物料数 ↓", "materials")
    + sbtn(vf.sort === "specs", "按不同规格数 ↓", "specs")
    + sbtn(vf.sort === "vcode", "按 V 码字母序 ↑", "vcode")
    + '<div style="margin-left:auto;display:flex;gap:6px;align-items:center">'
    + '<button class="mini-btn" data-act="vconf-toggle-expand">' + ic("list", 12) + (vf.expandAll ? " 收起全部 SKU 明细表 ▲" : " 展开全部 SKU 明细表 ▾") + '</button>'
    + '</div></div>';

  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const pg = Math.min(Math.max(1, vf.page || 1), pages);
  const pageGroups = filteredGroups.slice((pg - 1) * pageSize, pg * pageSize);

  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12.5px;color:var(--muted)">'
    + '<span>当前显示 <b>' + filteredGroups.length.toLocaleString() + '</b> 组同 V 码冲突 · 第 ' + pg + ' / ' + pages + ' 页（每页 ' + pageSize + ' 组）</span>'
    + '<div style="display:flex;gap:6px">'
    + '<button class="mini-btn" data-act="vconf-page" data-v="' + (pg - 1) + '"' + (pg <= 1 ? " disabled" : "") + '>上一页</button>'
    + '<button class="mini-btn" data-act="vconf-page" data-v="' + (pg + 1) + '"' + (pg >= pages ? " disabled" : "") + '>下一页</button>'
    + '</div></div>';

  if (!pageGroups.length) {
    h += '<div class="empty">' + ic("check-circle", 30) + '<div>当前筛选条件下没有同 V 码规格冲突组</div></div>';
    el.innerHTML = h;
    return;
  }

  h += '<div class="vconf-group-list">';
  for (const g of pageGroups) {
    h += '<div class="vconf-card">'
      + '<div class="vconf-card-hd">'
      + '<span class="vc-code">' + ic("link", 13) + ' ' + esc(g.vcode) + '</span>'
      + '<span class="tag red">当前范围 <b>' + g.specCount + '</b> 种规格 / <b>' + g.materialCount + '</b> 个物料</span>'
      + '<span class="tag orange">全量冲突依据：' + g.fullSpecCount + ' 种规格 / ' + g.fullMaterialCount + ' 个物料</span>'
      + (g.cats.length ? '<span class="tag blue">' + esc(g.cats.join(" / ")) + '</span>' : '')
      + (g.brands.length ? '<span class="tag">' + esc(g.brands.join(" / ")) + '</span>' : '')
      + '<div class="vc-acts">'
      + '<button class="mini-btn primary" data-act="vconf-compare" data-vcode="' + esc(g.vcode) + '"' + (g.materialCount < 2 ? ' disabled' : '') + ' title="对比当前筛选范围内该 V 码的物料">' + ic("swap", 12) + ' 对比当前范围 (' + Math.min(8, g.materialCount) + ')</button>'
      + '<button class="mini-btn" data-act="vconf-lock-results" data-vcode="' + esc(g.vcode) + '" title="切换到「查询结果」表格并精准锁定 V码 = ' + esc(g.vcode) + '">' + ic("table", 12) + ' 在结果表中查看</button>'
      + '</div></div>';

    /* 并排展示该 V 码下的每一种不同规格组合（原始装数 + MDM 物料规格 + 标准化乘积表达式 + 涉及的物料编码胶囊） */
    h += '<div class="vconf-variant-grid">';
    g.variants.forEach((v, idx) => {
      h += '<div class="vconf-var-box diff-hi">'
        + '<div class="vv-top">'
        + '<span>规格组合 #' + (idx + 1) + ' <span class="tag red" style="padding:0 6px;font-size:10.5px">' + v.skus.length + ' 个物料</span></span>'
        + '<span style="font-size:11.5px;color:var(--muted)">原始装数：<b style="color:var(--ink)">' + esc(fmt(v.load) || "—") + '</b> · 主单位：<b>' + esc(v.unit) + '</b></span>'
        + '</div>'
        + '<div class="vv-spec" title="MDM物料规格 → 标准化规格乘积表达式">'
        + 'MDM规格：' + esc(v.spec) + ' <span style="color:var(--muted);font-weight:500">→ 标准化：</span><code>' + esc(v.specC) + '</code>'
        + (v.specP != null && v.specP !== "" ? ' <span style="font-size:11.5px;color:var(--muted);font-weight:500">（乘积 ' + esc(fmt(v.specP)) + '）</span>' : '')
        + '</div>'
        + '<div style="font-size:11.5px;color:var(--muted)">包装层级：' + esc(v.pack) + ' · 示例说明：' + esc((v.skus[0] && v.skus[0].desc || "").slice(0, 36)) + '</div>'
        + '<div class="vv-skus">'
        + v.skus.slice(0, 6).map((m) =>
            '<button class="mini-btn" style="padding:2px 7px;min-height:22px;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace" data-act="open-detail-page" data-material="' + esc(m.material) + '" title="' + esc(m.desc + "（点击打开单品全屏详情看板）") + '">'
            + esc(m.material) + (m.status !== "有效" ? ' <span style="color:var(--red)">[' + esc(m.status) + ']</span>' : '')
            + '</button>'
          ).join("")
        + (v.skus.length > 6 ? '<span class="tag">等 ' + v.skus.length + ' 个</span>' : '')
        + '</div></div>';
    });
    h += '</div>';

    /* 可展开的完整物料明细对账表 */
    h += '<details style="padding:8px 14px;font-size:12px"' + (vf.expandAll || filteredGroups.length <= 3 ? " open" : "") + '>'
      + '<summary style="cursor:pointer;color:var(--blue);font-weight:650;user-select:none">展开核对该 V 码全部 ' + g.members.length + ' 个物料明细（原始装数 / 物料规格 / 标准化规格 / 规格乘积 / 包装规格）</summary>'
      + '<div style="overflow-x:auto;margin-top:8px"><table class="fields-table" style="border:1px solid var(--line)"><thead><tr style="background:#f4f8fc">'
      + '<th>物料编码</th><th>状态</th><th>品类三级</th><th>原始装数</th><th>MDM物料规格</th><th>标准化规格</th><th>规格乘积</th><th>主单位</th><th>包装层级规格</th><th>物料说明</th><th>操作</th>'
      + '</tr></thead><tbody>'
      + g.members.map((m) => '<tr>'
        + '<td class="mono"><a href="' + esc(buildDetailDeepLinkUrl(m.material)) + '" data-act="open-detail-page" data-material="' + esc(m.material) + '" style="color:var(--blue-deep);font-weight:700">' + esc(m.material) + '</a></td>'
        + '<td><span class="tag ' + (m.status === "有效" ? "green" : "red") + '">' + esc(m.status || "—") + '</span></td>'
        + '<td>' + esc(m.cat || "—") + '</td>'
        + '<td class="mono" style="font-weight:700;color:var(--red)">' + esc(fmt(m.load) || "—") + '</td>'
        + '<td class="mono" style="font-weight:700;color:var(--blue-deep)">' + esc(m.spec || "—") + '</td>'
        + '<td class="mono"><code>' + esc(m.specC || "—") + '</code></td>'
        + '<td class="mono">' + esc(fmt(m.specP) || "—") + '</td>'
        + '<td>' + esc(m.unit || "—") + '</td>'
        + '<td style="font-size:11.5px">' + esc(m.pack || "—") + '</td>'
        + '<td style="max-width:260px">' + esc(m.desc || "—") + '</td>'
        + '<td style="white-space:nowrap">'
        + '<button class="mini-btn" style="padding:2px 7px;min-height:24px" data-act="view-detail" data-material="' + esc(m.material) + '" title="抽屉速览">' + ic("eye", 11) + '</button> '
        + '<button class="mini-btn" style="padding:2px 7px;min-height:24px" data-act="add-sku" data-material="' + esc(m.material) + '" title="加入对比篮">' + ic("plus", 11) + '</button>'
        + '</td></tr>').join("")
      + '</tbody></table></div></details>';

    h += '</div>';
  }
  h += '</div>';
  el.innerHTML = h;
}

/* 保留当前视口高度，避免切换到短看板、重建筛选区时浏览器收缩文档并拉走滚动位置。 */
function preserveWorkspaceViewport(render) {
  const page = typeof document !== 'undefined' && document.querySelector('main.page');
  if (!page || typeof window === 'undefined' || state.detailPage) return render();
  const y = window.scrollY, x = window.scrollX || 0;
  if (y > 0) {
    const top = page.getBoundingClientRect().top + y;
    page.style.minHeight = Math.max(parseFloat(page.style.minHeight) || 0, y + window.innerHeight - top) + 'px';
  }
  try { return render(); }
  finally { if (y > 0) window.scrollTo({ top: y, left: x, behavior: 'instant' }); }
}
let workspaceRevision = 0;
const workspacePanelCache = new Map();
function workspacePanelKey(tab) {
  const local = {focus:state.focusFilter,vconf:state.vconfFilter,process:state.processCheckFilter,mps:state.mpsFilter,analyze:[state.analyzeField,state.analyzeFilter]};
  return workspaceRevision + ':' + JSON.stringify(local[tab] || null);
}
function renderWorkspacePanel(force = false) {
  const tab = state.tab;
  if (!force && workspacePanelCache.get(tab) === workspacePanelKey(tab)) return;
  if (tab === 'results') { renderResults(); renderPager(); renderViewSeg(); renderResultLine(); }
  else if (tab === 'focus') renderFocus();
  else if (tab === 'vconf') renderVconf();
  else if (tab === 'analyze') renderAnalyze();
  else if (tab === 'rules') renderRules();
  else if (tab === 'process') renderProcessChecks();
  else if (tab === 'mps') renderMps();
  workspacePanelCache.set(tab, workspacePanelKey(tab));
}
function switchWorkspaceTab(tab) {
  if (!['results','focus','vconf','analyze','rules','process','mps'].includes(tab) || tab === state.tab) return;
  preserveWorkspaceViewport(() => {
    state.tab = tab;
    renderTabs();
    renderWorkspacePanel();
    if (typeof syncTableXnav === 'function') {
      const tables = {results:'mainTableWrap',process:'processCheckTableWrap',mps:'mpsTableWrap',focus:'focusTableWrap',vconf:'vconfTableWrap'};
      if (tables[tab]) syncTableXnav(tables[tab]);
    }
    if (typeof searchDock !== 'undefined' && searchDock) searchDock.update();
  });
  saveStateDebounced();
}
/* 筛选变化才重算全局数据；隐藏看板在下次打开时再更新。 */
function refreshAll() {
  preserveWorkspaceViewport(() => {
    computeDerived();
    workspaceRevision++;
    renderTabs();
    renderSearchAssist();
    renderFilters();
    renderBasket();
    renderQueryWorkspace();
    renderWorkspacePanel(true);
    renderDetail();
    renderDetailPage();
    renderDpConfigModal();
    renderFieldDrawer();
    renderCompare();
    if (typeof syncBodyScrollLock === 'function') syncBodyScrollLock();
    if (typeof searchDock !== 'undefined' && searchDock) searchDock.update();
  });
}
