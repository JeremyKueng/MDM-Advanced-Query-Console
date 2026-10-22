/* 日期筛选：手输年月日与独立日历草稿，切换年月不提交条件。 */
let customDatePicker = null;
function closeCustomDatePicker(restoreFocus) {
  if (!customDatePicker) return;
  const { index, part } = customDatePicker;
  document.getElementById("customDatePicker")?.remove();
  customDatePicker = null;
  const button = document.querySelector('[data-date-action="open"][data-idx="' + index + '"][data-part="' + part + '"]');
  if (button) button.setAttribute("aria-expanded", "false");
  if (restoreFocus) document.querySelector('[data-act="custom-filter-value"][data-idx="' + index + '"][data-part="' + part + '"]')?.focus({ preventScroll: true });
}
function renderCustomDatePicker(focusPart) {
  const picker = customDatePicker;
  if (!picker) return;
  const box = document.getElementById("customDatePicker");
  const c = customFilterNode(picker.index);
  if (!box || !c) { closeCustomDatePicker(); return; }
  const chosen = isoDate(c[picker.part]);
  const first = new Date(picker.year, picker.month - 1, 1).getDay();
  const days = new Date(picker.year, picker.month, 0).getDate();
  let h = '<div class="date-picker-head"><button type="button" data-date-action="prev" aria-label="上个月">' + ic("chevron-left", 13) + '</button>'
    + '<select data-date-select="year" aria-label="日历年份">';
  for (let y = Math.min(1900, picker.year); y <= Math.max(2100, picker.year); y++) h += '<option value="' + y + '"' + (y === picker.year ? ' selected' : '') + '>' + y + ' 年</option>';
  h += '</select><select data-date-select="month" aria-label="日历月份">';
  for (let m = 1; m <= 12; m++) h += '<option value="' + m + '"' + (m === picker.month ? ' selected' : '') + '>' + m + ' 月</option>';
  h += '</select><button type="button" data-date-action="next" aria-label="下个月">' + ic("chevron-right", 13) + '</button></div>'
    + '<div class="date-picker-week">' + ['日','一','二','三','四','五','六'].map((d) => '<span>' + d + '</span>').join('') + '</div><div class="date-picker-days">';
  for (let i = 0; i < first; i++) h += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const val = String(picker.year).padStart(4, '0') + '-' + String(picker.month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    h += '<button type="button" data-date-action="choose" data-date-value="' + val + '" aria-label="' + val + '" aria-pressed="' + (chosen === val) + '">' + d + '</button>';
  }
  h += '</div><div class="date-picker-foot"><span>点选日期后回填 · 支持手输 20260101</span><button type="button" data-date-action="close">关闭</button></div>';
  box.innerHTML = h;
  if (focusPart) box.querySelector('[data-date-select="' + focusPart + '"]')?.focus({ preventScroll: true });
}
function openCustomDatePicker(button) {
  clearTimeout(customFilterTimer);
  const index = button.dataset.idx, part = button.dataset.part === "valTo" ? "valTo" : "val";
  if (customDatePicker?.index === index && customDatePicker.part === part) { closeCustomDatePicker(true); return; }
  closeCustomDatePicker();
  const c = customFilterNode(index);
  if (!c) return;
  for (const key of ["val", "valTo"]) if (isoDate(c[key])) c[key] = isoDate(c[key]);
  refreshCustomFilters();
  button = document.querySelector('[data-date-action="open"][data-idx="' + index + '"][data-part="' + part + '"]');
  if (!button) return;
  const date = isoDate(c[part]) || isoDate(c.val) || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-01';
  customDatePicker = { index, part, year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
  const box = document.createElement('div'); box.id = 'customDatePicker'; box.className = 'date-picker-popover';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '选择条件 ' + customConditionPathLabel(index) + ' ' + (part === 'valTo' ? '结束日期' : c.op === 'between' ? '开始日期' : '日期'));
  document.body.appendChild(box);
  button.setAttribute('aria-expanded', 'true');
  renderCustomDatePicker();
  const rect = button.closest('.custom-date').getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 16);
  box.style.width = width + 'px';
  box.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
  const height = box.getBoundingClientRect().height;
  box.style.top = Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - height - 8)) + 'px';
  box.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  if (!box.contains(document.activeElement)) box.querySelector('[data-date-select="month"]').focus({ preventScroll: true });
}
function bindCustomDatePickers() {
  document.addEventListener('click', (e) => {
    const control = e.target.closest('[data-date-action]');
    if (!control) { if (customDatePicker && !e.target.closest('#customDatePicker')) closeCustomDatePicker(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    const action = control.dataset.dateAction;
    if (action === 'open') { openCustomDatePicker(control); return; }
    if (!customDatePicker) return;
    if (action === 'close') { closeCustomDatePicker(true); return; }
    if (action === 'choose') {
      const { index, part } = customDatePicker;
      customFilterNode(index)[part] = control.dataset.dateValue;
      closeCustomDatePicker(); refreshCustomFilters();
      document.querySelector('[data-act="custom-filter-value"][data-idx="' + index + '"][data-part="' + part + '"]')?.focus({ preventScroll: true });
      return;
    }
    const date = new Date(customDatePicker.year, customDatePicker.month - 1 + (action === 'next' ? 1 : -1), 1);
    customDatePicker.year = date.getFullYear(); customDatePicker.month = date.getMonth() + 1;
    renderCustomDatePicker();
    document.querySelector('#customDatePicker [data-date-action="' + action + '"]')?.focus({ preventScroll: true });
  }, true);
  document.addEventListener('change', (e) => {
    if (!e.target.dataset.dateSelect || !customDatePicker) return;
    e.stopImmediatePropagation();
    const part = e.target.dataset.dateSelect;
    customDatePicker[part] = Number(e.target.value);
    renderCustomDatePicker(part);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && customDatePicker) { e.preventDefault(); e.stopImmediatePropagation(); closeCustomDatePicker(true); }
  }, true);
  window.addEventListener('resize', () => closeCustomDatePicker());
  document.addEventListener('scroll', (e) => { if (customDatePicker && !e.target.closest?.('#customDatePicker')) closeCustomDatePicker(); }, true);
}
