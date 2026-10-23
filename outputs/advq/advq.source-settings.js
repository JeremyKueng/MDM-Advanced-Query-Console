/* 共享路径独立保存在本机，程序更新或重启后继续沿用。 */
"use strict";
async function sourceSettingsApi(base, body) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(base + '/api/source-settings', { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (response.status === 404) throw new Error('当前服务尚不支持保存共享路径，请重启新版工作台');
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || '共享路径保存未完成，请重试');
    return result;
  } finally { clearTimeout(timer); }
}
function bindSourceSettingsEditor(isCurrent, onSaved) {
  const input = document.getElementById('srcSharePathInput'), button = document.getElementById('btnSaveSharePath'), note = document.getElementById('sourceSettingsStatus');
  if (!input || !button) return;
  let revision = 0, base = '', ready = false;
  input.oninput = () => { revision++; };
  resolveApiBase().then(async result => {
    if (!isCurrent() || !result.info) return;
    base = result.base; ready = true; button.disabled = false;
    try {
      const data = await sourceSettingsApi(base);
      if (!isCurrent()) return;
      if (revision === 0) input.value = data.settings.sharePath || data.settings.shareUnc || data.settings.shareDirs[0] || '';
      note.textContent = '保存到本机，更新程序后继续沿用。';
    } catch (error) { if (isCurrent()) note.textContent = error.message; }
  }).catch(() => {});
  button.onclick = async () => {
    if (!ready) return;
    revision++; button.disabled = true; note.textContent = '正在保存…';
    try {
      await sourceSettingsApi(base, { sharePath: input.value.trim() });
      LAST_SOURCE_INFO = null;
      if (!isCurrent()) return;
      note.textContent = '已保存到本机，下次启动和更新程序后继续沿用。';
      toast('共享路径已保存，正在重新检查连接');
      if (typeof onSaved === 'function') onSaved(true);
    } catch (error) { note.textContent = error.message; toast(error.message, true); }
    finally { if (isCurrent()) button.disabled = false; }
  };
}
