/* 草稿与结果表各自排序；冻结列不会成为拖拽源或落点。 */
function reorderComposedField(kind, from, target, after) {
  if (kind !== "draft" && (kind !== "result" || !activeNamedFieldView())) return false;
  if (from === target || PINNED_KEYS.includes(from) || PINNED_KEYS.includes(target)) return false;
  const keys = kind === "draft" ? composedFieldKeys() : orderedVisibleKeys();
  if (!keys.includes(from) || !keys.includes(target)) return false;
  const next = keys.filter((k) => k !== from);
  next.splice(next.indexOf(target) + (after ? 1 : 0), 0, from);
  if (next.every((k, i) => k === keys[i])) return false;
  if (kind === "draft") {
    state.fieldComposeKeys = next;
    renderFieldComposeList();
  } else applyVisibleListOrder(next, true);
  return true;
}
function bindComposedFieldSorting() {
  let drag = null, marker = null;
  const gripSelector = "[data-field-order]";
  function clearMarker() { if (marker) delete marker.dataset.fieldOrderDrop; marker = null; }
  function finish() {
    clearMarker();
    const old = drag; drag = null;
    if (!old) return;
    old.grip.classList.remove("field-order-dragging");
    if (old.grip.hasPointerCapture(old.id)) old.grip.releasePointerCapture(old.id);
  }
  function hit(e) {
    const hovered = document.elementFromPoint(e.clientX, e.clientY);
    const node = hovered?.closest(drag.kind === "draft" ? "[data-compose-key]" : "#mainTableWrap th[data-field]");
    const grip = node?.querySelector(gripSelector);
    if (!grip || grip === drag.grip || grip.dataset.fieldOrder !== drag.kind) return null;
    const rect = node.getBoundingClientRect();
    const after = drag.kind === "draft" ? e.clientY > rect.top + rect.height / 2 : e.clientX > rect.left + rect.width / 2;
    return { node, key: grip.dataset.v, after };
  }
  document.addEventListener("pointerdown", (e) => {
    const grip = e.target.closest(gripSelector);
    if (grip && !drag && e.button === 0) drag = { grip, kind: grip.dataset.fieldOrder, key: grip.dataset.v, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.grip.isConnected) { finish(); return; }
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      drag.moved = true;
      drag.grip.setPointerCapture(e.pointerId);
      drag.grip.classList.add("field-order-dragging");
    }
    e.preventDefault();
    clearMarker();
    const target = hit(e);
    if (target) { marker = target.node; marker.dataset.fieldOrderDrop = target.after ? "after" : "before"; }
  }, { passive: false });
  document.addEventListener("pointerup", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const target = drag.moved ? hit(e) : null, {kind, key} = drag;
    finish();
    if (target) reorderComposedField(kind, key, target.key, target.after);
  });
  document.addEventListener("pointercancel", (e) => { if (drag && e.pointerId === drag.id) finish(); });
  document.addEventListener("lostpointercapture", (e) => { if (drag && e.pointerId === drag.id) finish(); });
  window.addEventListener("blur", finish);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drag) { e.preventDefault(); finish(); return; }
    if (e.isComposing || e.defaultPrevented) return;
    if (e.key === "Enter" && e.target.id === "fieldComposeName") { e.preventDefault(); applyFieldComposer(); return; }
    if (e.key === "Escape" && state.fieldDrawer && state.fieldDrawerMode === "compose" && !document.querySelector("#modal-mask.open")) { e.preventDefault(); closeAllDrawers(); return; }
    if (e.key === "Escape" && state.tab === "results" && pickingResultFields()
        && !e.target.matches("input, textarea, select, [contenteditable]")
        && !document.querySelector(".drawer.open, #modal-mask.open, .page-overlay.open")) {
      e.preventDefault(); setFieldComposeSelecting(false); return;
    }
    const grip = e.target.closest(gripSelector);
    if (!grip || !e.altKey) return;
    const kind = grip.dataset.fieldOrder, key = grip.dataset.v;
    const vertical = kind === "draft";
    if (!(vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"]).includes(e.key)) return;
    e.preventDefault();
    const keys = vertical ? composedFieldKeys() : orderedVisibleKeys();
    const after = e.key === "ArrowDown" || e.key === "ArrowRight";
    if (reorderComposedField(kind, key, keys[keys.indexOf(key) + (after ? 1 : -1)], after)) {
      [...document.querySelectorAll(gripSelector)].find((g) => g.dataset.fieldOrder === kind && g.dataset.v === key)?.focus({ preventScroll: true });
    }
  });
}

/* 视图预设与查询结果快捷入口共用顺序；拖动不应用视图、不改字段或查询。 */
function movePresetView(name, before) {
  const current = mdmPresetNames();
  if (!current.includes(name) || before === name || before !== null && !current.includes(before)) return false;
  const next = current.filter((p) => p !== name);
  next.splice(before === null ? next.length : next.indexOf(before), 0, name);
  if (JSON.stringify(next) === JSON.stringify(current)) return false;
  state.presetViewOrder = next;
  state.viewShortcuts = orderPresetShortcuts(state.viewShortcuts);
  if (shortcutDraft) shortcutDraft = orderPresetShortcuts(shortcutDraft);
  syncPresetViewControls();
  saveState(); renderViewShortcuts(); renderShortcutEditor();
  const status = document.getElementById("fdPresetSortStatus");
  if (status) status.textContent = "预设与查询结果快捷视图顺序已同步保存";
  return true;
}
function bindPresetViewSorting() {
  const body = document.getElementById("fieldBody");
  let active = null, suppressClickUntil = 0;
  const clear = () => body.querySelectorAll("[data-preset-before],[data-preset-after]").forEach((node) => { delete node.dataset.presetBefore; delete node.dataset.presetAfter; });
  function finish() {
    const previous = active; active = null;
    if (previous) {
      previous.item.classList.remove("preset-dragging");
      if (body.hasPointerCapture(previous.pointerId)) body.releasePointerCapture(previous.pointerId);
    }
    clear();
  }
  function targetAt(e) {
    if (!active || !active.pool.isConnected || !document.elementFromPoint(e.clientX, e.clientY)?.closest("#fdPresetList")) return null;
    const nodes = [...active.pool.children].filter((node) => node !== active.item);
    const before = nodes.find((node) => {
      const rect = node.getBoundingClientRect();
      return e.clientY < rect.top || e.clientY <= rect.bottom && e.clientX < rect.left + rect.width / 2;
    }) || null;
    return { before, last: nodes[nodes.length - 1] };
  }
  body.addEventListener("pointerdown", (e) => {
    const item = e.target.closest("#fdPresetList [data-act=preset]");
    if (!item || active || e.button !== 0) return;
    active = { item, pool: item.parentElement, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  document.addEventListener("pointermove", (e) => {
    if (!active || active.pointerId !== e.pointerId) return;
    if (!active.item.isConnected) { finish(); return; }
    if (!active.moved) {
      if (Math.hypot(e.clientX - active.x, e.clientY - active.y) < 5) return;
      active.moved = true; body.setPointerCapture(e.pointerId); active.item.classList.add("preset-dragging");
    }
    e.preventDefault(); clear();
    const target = targetAt(e);
    if (target?.before) target.before.dataset.presetBefore = "";
    else if (target?.last) target.last.dataset.presetAfter = "";
  }, { passive: false });
  document.addEventListener("pointerup", (e) => {
    if (!active || active.pointerId !== e.pointerId) return;
    const target = active.moved ? targetAt(e) : null, name = active.item.dataset.v;
    if (active.moved) { e.preventDefault(); suppressClickUntil = Date.now() + 250; }
    finish();
    if (target) movePresetView(name, target.before ? target.before.dataset.v : null);
  });
  document.addEventListener("pointercancel", finish);
  body.addEventListener("lostpointercapture", finish);
  window.addEventListener("blur", finish);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && active?.moved) { e.preventDefault(); suppressClickUntil = Date.now() + 250; finish(); return; }
    const item = e.target.closest("#fdPresetList [data-act=preset]");
    if (!item || !e.altKey || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const names = mdmPresetNames(), from = names.indexOf(item.dataset.v), to = from + (e.key === "ArrowLeft" ? -1 : 1);
    if (to >= 0 && to < names.length) movePresetView(item.dataset.v, to < from ? names[to] : names[to + 1] || null);
  });
  body.addEventListener("dragstart", (e) => { if (e.target.closest("#fdPresetList")) e.preventDefault(); });
  document.addEventListener("click", (e) => {
    if (Date.now() < suppressClickUntil && e.target.closest("#fdPresetList")) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
}

/* 模板编辑器的字段/区块排序：仅重排当前列表，保留编辑器 DOM、滚动位置和焦点。 */
function dpFieldListFor(data) {
  const tpl = state.dpTemplates.find((t) => t.id === data.tpl);
  const block = tpl && tpl.blocks && tpl.blocks[Number(data.bidx)];
  if (!block) return null;
  if (data.kind === "block") return Array.isArray(block.fields) ? block.fields : null;
  const child = data.kind === "compare" ? (block.compareRows || [])[Number(data.ridx)]
    : data.kind === "subbox" ? (block.subBoxes || [])[Number(data.sidx)] : null;
  return child && Array.isArray(child.fields) ? child.fields : null;
}
function syncDpSortIndices(pool, blocks) {
  const items = [...pool.children].filter((el) => el.matches(blocks ? ".cfg-block-editor" : ".cfg-field-chip"));
  items.forEach((item, i) => {
    if (blocks) {
      item.dataset.bidx = String(i);
      item.querySelectorAll("[data-bidx]").forEach((el) => { el.dataset.bidx = String(i); });
      item.querySelector("[data-block-number]").textContent = "区块 #" + (i + 1);
      item.querySelectorAll('[data-act="dp-blk-move"]').forEach((el) => { el.disabled = i + Number(el.dataset.dir) < 0 || i + Number(el.dataset.dir) >= items.length; });
    } else {
      item.dataset.fidx = String(i);
      item.querySelectorAll("[data-fidx]").forEach((el) => { el.dataset.fidx = String(i); });
      item.querySelectorAll('[data-act="dp-template-field-move"]').forEach((el) => { el.disabled = i + Number(el.dataset.dir) < 0 || i + Number(el.dataset.dir) >= items.length; });
    }
  });
}
function moveDpSortItem(pool, from, to, blocks) {
  const tpl = state.dpTemplates.find((t) => t.id === pool.dataset.tpl);
  const list = blocks ? tpl && tpl.blocks : dpFieldListFor(pool.dataset);
  const nodes = [...pool.children].filter((el) => el.matches(blocks ? ".cfg-block-editor" : ".cfg-field-chip"));
  if (!Array.isArray(list) || list.length !== nodes.length || !Number.isInteger(from) || !Number.isInteger(to)
      || from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return false;
  const focused = document.activeElement;
  list.splice(to, 0, list.splice(from, 1)[0]);
  nodes.splice(to, 0, nodes.splice(from, 1)[0]);
  nodes.forEach((node) => pool.appendChild(node));
  syncDpSortIndices(pool, blocks);
  if (focused && pool.contains(focused)) focused.focus({ preventScroll: true });
  saveStateDebounced();
  renderDetailPage();
  const status = document.getElementById("dpSortStatus");
  if (status) status.textContent = blocks ? "区块顺序已更新" : "字段顺序已更新";
  return true;
}
function bindDpConfigSorting() {
  const body = document.getElementById("dpConfigBody"), overlay = document.getElementById("dpConfigModal");
  let active = null, frame = 0, point = null, ghost = null, suppressClickUntil = 0;
  const clearMarks = () => body.querySelectorAll("[data-drop-before],[data-drop-after]").forEach((el) => { delete el.dataset.dropBefore; delete el.dataset.dropAfter; });
  function finish() {
    if (active) {
      active.item.classList.remove("cfg-dragging");
      if (body.hasPointerCapture(active.pointerId)) body.releasePointerCapture(active.pointerId);
    }
    active = null; point = null; cancelAnimationFrame(frame); frame = 0;
    if (ghost) ghost.remove(); ghost = null;
    clearMarks(); overlay.classList.remove("cfg-sorting");
  }
  function targetAt(x, y) {
    if (!active || !active.item.isConnected) return null;
    const target = document.elementFromPoint(x, y);
    if (!target) return null;
    const pool = target.closest(active.blocks ? ".cfg-block-list" : ".cfg-sortable-fields");
    if (!pool || pool !== active.pool) return null;
    const nodes = [...pool.children].filter((el) => el !== active.item && el.matches(active.blocks ? ".cfg-block-editor" : ".cfg-field-chip"));
    const before = nodes.find((el) => {
      const r = el.getBoundingClientRect();
      return active.blocks ? y < r.top + r.height / 2 : y < r.top || (y <= r.bottom && x < r.left + r.width / 2);
    }) || null;
    return { before, last: nodes[nodes.length - 1] || null };
  }
  function markTarget(target) {
    clearMarks();
    if (!target) return;
    if (target.before) target.before.dataset.dropBefore = "";
    else if (target.last) target.last.dataset.dropAfter = "";
  }
  function scrollFrame() {
    if (!active || !active.moved) return;
    if (!active.item.isConnected || !overlay.classList.contains("open")) { finish(); return; }
    if (point) {
      const r = overlay.getBoundingClientRect(), head = overlay.querySelector(".dp-head").getBoundingClientRect();
      const topEdge = head.bottom + 55, bottomEdge = r.bottom - 65;
      const speed = point.y < topEdge ? -Math.min(18, (topEdge - point.y) / 4)
        : point.y > bottomEdge ? Math.min(18, (point.y - bottomEdge) / 4) : 0;
      if (speed && point.x >= r.left && point.x <= r.right) { overlay.scrollTop += speed; markTarget(targetAt(point.x, point.y)); }
    }
    frame = requestAnimationFrame(scrollFrame);
  }
  body.addEventListener("pointerdown", (e) => {
    if (active || e.button !== 0 || e.target.closest("button,input,select,textarea")) return;
    if (e.pointerType === "touch" && !e.target.closest(".cfg-field-grip,.cfg-block-grip")) return;
    const handle = e.target.closest(".cfg-block-grip");
    const item = handle ? handle.closest(".cfg-block-editor") : e.target.closest(".cfg-field-chip");
    if (!item) return;
    const blocks = !!handle, pool = item.parentElement;
    if (!pool.matches(blocks ? ".cfg-block-list" : ".cfg-sortable-fields")) return;
    active = { item, pool, blocks, pointerId: e.pointerId, from: Number(blocks ? item.dataset.bidx : item.dataset.fidx), x: e.clientX, y: e.clientY, moved: false };
  });
  document.addEventListener("pointermove", (e) => {
    if (!active || active.pointerId !== e.pointerId) return;
    if (!active.moved) {
      if (Math.hypot(e.clientX - active.x, e.clientY - active.y) < 5) return;
      active.moved = true; body.setPointerCapture(e.pointerId);
      ghost = document.createElement("div"); ghost.className = "cfg-drag-preview";
      ghost.textContent = active.blocks ? active.item.querySelector('[data-act="dp-blk-title"]').value : active.item.querySelector(".cfg-field-name").textContent;
      document.body.appendChild(ghost);
      active.item.classList.add("cfg-dragging"); overlay.classList.add("cfg-sorting");
      frame = requestAnimationFrame(scrollFrame);
    }
    e.preventDefault(); point = { x: e.clientX, y: e.clientY };
    ghost.style.left = Math.min(e.clientX + 14, window.innerWidth - ghost.offsetWidth - 8) + "px";
    ghost.style.top = Math.min(e.clientY + 14, window.innerHeight - ghost.offsetHeight - 8) + "px";
    markTarget(targetAt(e.clientX, e.clientY));
  }, { passive: false });
  document.addEventListener("pointerup", (e) => {
    if (!active || active.pointerId !== e.pointerId) return;
    const drag = active, target = drag.moved ? targetAt(e.clientX, e.clientY) : null;
    if (drag.moved) { e.preventDefault(); suppressClickUntil = Date.now() + 200; }
    let to = drag.from;
    if (target) {
      const beforeIndex = target.before ? Number(drag.blocks ? target.before.dataset.bidx : target.before.dataset.fidx) : drag.pool.children.length;
      to = beforeIndex - (drag.from < beforeIndex ? 1 : 0);
    }
    finish();
    if (target) moveDpSortItem(drag.pool, drag.from, to, drag.blocks);
  });
  document.addEventListener("pointercancel", finish);
  document.addEventListener("click", (e) => { if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && active) { suppressClickUntil = Date.now() + 200; finish(); } });
  body.addEventListener("dragstart", (e) => { if (e.target.closest(".cfg-field-chip,.cfg-block-grip")) e.preventDefault(); });
}
