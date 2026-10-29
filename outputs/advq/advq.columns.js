/* 表头筛选：草稿只在确定时生效；菜单挂在 body，避免被冻结列和滚动容器裁切。 */
"use strict";
let columnMenu = null;
function columnOptionLabel(key, value) {
  if (key === 'blocking') return value === 'true' || value === '1' ? '需重点核查' : '正常';
  if (key === 'vconf') return value === 'true' || value === '1' ? '有冲突' : '无冲突';
  if (key === 'flags' && !value) return '无异常';
  return value || '(空白)';
}
function columnMenuMatches(menu = columnMenu) {
  const tokens = menu.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return menu.options.filter(o => tokens.every(t => columnOptionLabel(menu.key, o.value).toLocaleLowerCase().includes(t)));
}
/* 先向右、再向左避让当前列；左右都放不下时在表格外展开。 */
function columnMenuPlacement(rect, menuWidth, viewportWidth) {
  const margin = 12, gap = 10, minWidth = 240;
  const width = Math.min(menuWidth, Math.max(0, viewportWidth - margin * 2));
  const rightSpace = Math.max(0, viewportWidth - margin - rect.right - gap);
  const leftSpace = Math.max(0, rect.left - gap - margin);
  if (rightSpace >= width) return { side: 'right', left: rect.right + gap, width };
  if (leftSpace >= width) return { side: 'left', left: rect.left - gap - width, width };
  const side = rightSpace >= leftSpace ? 'right' : 'left', available = Math.max(rightSpace, leftSpace);
  if (available >= minWidth) return { side, left: side === 'right' ? rect.right + gap : rect.left - gap - available, width: available };
  return { side: 'inline', width };
}
function positionColumnFilterMenu() {
  const menu = columnMenu; if (!menu) return;
  const { element, trigger } = menu, rect = trigger.closest('th').getBoundingClientRect();
  const placement = columnMenuPlacement(rect, element.offsetWidth, window.innerWidth);
  element.dataset.placement = placement.side;
  if (placement.side === 'inline') {
    const host = document.createElement('div'); host.className = 'column-filter-inline-host';
    trigger.closest('.table-wrap').before(host); host.appendChild(element);
    element.classList.add('is-inline'); menu.host = host;
  } else {
    element.style.width = placement.width + 'px';
    const height = element.getBoundingClientRect().height;
    element.style.left = placement.left + 'px';
    element.style.top = Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - height - 12)) + 'px';
  }
}
function closeColumnFilterMenu(restoreFocus = false) {
  if (!columnMenu) return;
  const { element, trigger, key, host } = columnMenu;
  element.remove(); host?.remove(); columnMenu = null;
  if (trigger.isConnected) trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) {
    const target = trigger.isConnected ? trigger : [...document.querySelectorAll('[data-column-action="open"]')].find(b => b.dataset.field === key);
    target?.focus({ preventScroll: true });
  }
}
function updateColumnMenuSelection() {
  const menu = columnMenu; if (!menu) return;
  const matches = columnMenuMatches(menu), selected = matches.filter(o => menu.selected.has(o.value)).length;
  const all = menu.element.querySelector('[data-column-select-all]');
  all.checked = matches.length > 0 && selected === matches.length;
  all.indeterminate = selected > 0 && selected < matches.length;
  all.disabled = !matches.length;
  menu.element.querySelector('[data-column-summary]').textContent = '当前列表已选 ' + selected.toLocaleString() + ' / ' + matches.length.toLocaleString() + ' 个值';
  menu.element.querySelector('[data-column-action="apply"]').disabled = !selected;
}
function renderColumnMenuValues() {
  const menu = columnMenu; if (!menu) return;
  const matches = columnMenuMatches(menu);
  menu.element.querySelector('[data-column-values]').innerHTML = matches.slice(0, menu.limit).map(o => {
    const i = menu.options.indexOf(o);
    return '<label class="column-option"><input type="checkbox" data-column-index="' + i + '"' + (menu.selected.has(o.value) ? ' checked' : '') + '><span title="' + esc(columnOptionLabel(menu.key, o.value)) + '">' + esc(columnOptionLabel(menu.key, o.value)) + '</span><small>' + o.count.toLocaleString() + '</small></label>';
  }).join('') || '<div class="column-no-values">没有匹配的值</div>';
  const more = menu.element.querySelector('[data-column-action="more"]');
  more.hidden = matches.length <= menu.limit;
  more.textContent = '加载更多（还有 ' + Math.max(0, matches.length - menu.limit).toLocaleString() + ' 个值）';
  updateColumnMenuSelection();
}
function openColumnFilterMenu(trigger) {
  if (!trigger.matches("button.column-dropdown")) return;
  const key = trigger.dataset.field;
  if (!schemaByKey.has(key) || MDM_HIDDEN_KEYS.has(key)) return;
  if (columnMenu?.key === key) { closeColumnFilterMenu(true); return; }
  closeColumnFilterMenu();
  const schema = schemaByKey.get(key), options = columnFilterOptions(key);
  const active = Object.prototype.hasOwnProperty.call(state.filters.columnFilters || {}, key);
  const element = document.createElement('div');
  element.className = 'column-filter-menu'; element.setAttribute('role', 'dialog');
  element.setAttribute('aria-label', schema.label + '：筛选和排序');
  const number = schema.type === 'number', date = schema.type === 'date';
  const asc = number ? '从小到大' : date ? '从早到晚' : '升序 A → Z';
  const desc = number ? '从大到小' : date ? '从晚到早' : '降序 Z → A';
  element.innerHTML = '<header><strong>' + esc(schema.label) + '</strong><button type="button" data-column-action="cancel" aria-label="关闭表头筛选">' + ic('x', 15) + '</button></header>'
    + '<div class="column-sort-actions"><button type="button" data-column-action="asc" aria-pressed="' + (state.sort.key === key && state.sort.dir === 1) + '">↑ ' + asc + '</button><button type="button" data-column-action="desc" aria-pressed="' + (state.sort.key === key && state.sort.dir === -1) + '">↓ ' + desc + '</button></div>'
    + '<div class="column-secondary-actions"><button type="button" class="column-clear" data-column-action="clear"' + (!active ? ' disabled' : '') + '>' + ic('filter', 13) + ' 清除此列筛选</button>'
    + '<button type="button" class="column-clear" data-column-action="reset-sort"' + (!state.sort.explicit ? ' disabled' : '') + '>↺ 恢复默认排序</button></div>'
    + '<div class="column-filter-content"><input type="search" data-column-search placeholder="搜索此列的值…" aria-label="搜索' + esc(schema.label) + '的值" autocomplete="off">'
    + '<div class="column-selection"><label><input type="checkbox" data-column-select-all> 全选匹配值</label><button type="button" data-column-action="invert">反选</button></div>'
    + '<div class="column-values" data-column-values></div><button type="button" class="column-more" data-column-action="more" hidden></button>'
    + '<p data-column-summary aria-live="polite"></p><small class="column-filter-note">按单元格显示值筛选，与上方条件同时满足。搜索后仅应用匹配列表。</small></div>'
    + '<footer><button type="button" data-column-action="cancel">取消</button><button type="button" class="primary" data-column-action="apply">确定</button></footer>';
  columnMenu = { key, trigger, element, options, selected: new Set(active ? state.filters.columnFilters[key] : options.map(o => o.value)), query: '', limit: 100 };
  document.body.appendChild(element); trigger.setAttribute('aria-expanded', 'true');
  renderColumnMenuValues();
  positionColumnFilterMenu();
  element.querySelector('[data-column-search]').focus({ preventScroll: true });
}
function commitColumnMenu(action) {
  const menu = columnMenu; if (!menu) return;
  const key = menu.key;
  if (action === 'asc' || action === 'desc') state.sort = { key, dir: action === 'asc' ? 1 : -1, explicit: true };
  else if (action === 'reset-sort') state.sort = { key: 'material', dir: 1 };
  else if (action === 'clear') delete state.filters.columnFilters[key];
  else {
    const selected = columnMenuMatches(menu).filter(o => menu.selected.has(o.value)).map(o => o.value);
    if (!selected.length) return;
    if (selected.length === menu.options.length) delete state.filters.columnFilters[key];
    else state.filters.columnFilters[key] = selected;
  }
  closeColumnFilterMenu(); refreshFilteredViews();
  const target = [...document.querySelectorAll('[data-column-action="open"]')].find(b => b.dataset.field === key);
  target?.focus({ preventScroll: true });
}
function bindColumnFilters() {
  document.addEventListener('pointerdown', e => {
    if (columnMenu && !columnMenu.element.contains(e.target) && !e.target.closest('[data-column-action="open"]')) closeColumnFilterMenu();
  });
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-column-action]'); if (!button) return;
    e.preventDefault(); e.stopPropagation();
    const action = button.dataset.columnAction;
    if (action === 'open') { openColumnFilterMenu(button); return; }
    if (!columnMenu) return;
    if (action === 'cancel') closeColumnFilterMenu(true);
    else if (action === 'more') { columnMenu.limit += 100; renderColumnMenuValues(); }
    else if (action === 'invert') { for (const o of columnMenuMatches()) columnMenu.selected.has(o.value) ? columnMenu.selected.delete(o.value) : columnMenu.selected.add(o.value); renderColumnMenuValues(); }
    else commitColumnMenu(action);
  });
  document.addEventListener('input', e => {
    if (!columnMenu || !e.target.matches('[data-column-search]') || e.isComposing) return;
    columnMenu.query = e.target.value; columnMenu.limit = 100; renderColumnMenuValues();
  });
  document.addEventListener('compositionend', e => {
    if (columnMenu && e.target.matches('[data-column-search]')) { columnMenu.query = e.target.value; columnMenu.limit = 100; renderColumnMenuValues(); }
  });
  document.addEventListener('change', e => {
    if (!columnMenu) return;
    if (e.target.matches('[data-column-select-all]')) {
      for (const o of columnMenuMatches()) e.target.checked ? columnMenu.selected.add(o.value) : columnMenu.selected.delete(o.value);
      renderColumnMenuValues();
    } else if (e.target.matches('[data-column-index]')) {
      const o = columnMenu.options[Number(e.target.dataset.columnIndex)]; if (!o) return;
      e.target.checked ? columnMenu.selected.add(o.value) : columnMenu.selected.delete(o.value); updateColumnMenuSelection();
    }
  });
  document.addEventListener('keydown', e => {
    if (!columnMenu) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeColumnFilterMenu(true); }
    else if (e.key === 'Enter' && e.target.matches('[data-column-search]') && !e.isComposing) { e.preventDefault(); commitColumnMenu('apply'); }
  }, true);
  window.addEventListener('resize', () => closeColumnFilterMenu(), { passive: true });
  document.addEventListener('scroll', e => { if (columnMenu && !columnMenu.element.contains(e.target)) closeColumnFilterMenu(); }, { capture: true, passive: true });
}
