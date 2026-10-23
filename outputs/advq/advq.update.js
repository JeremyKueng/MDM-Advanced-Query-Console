/* 主动检查程序版本；数据源路径独立保存在本机，不随 Git 更新。 */
"use strict";
let workbenchUpdateTask = null;
let workbenchUpdateState = { phase: 'idle', message: '' };
function renderWorkbenchUpdate() {
  const button = document.getElementById('btnAppUpdate'), status = document.getElementById('appUpdateStatus');
  const busy = ['checking', 'preparing', 'updating', 'restarting'].includes(workbenchUpdateState.phase);
  if (button) { button.disabled = busy; button.innerHTML = ic('refresh', 12) + (busy ? ' 更新中…' : ' 检查版本更新'); }
  if (status) { status.textContent = workbenchUpdateState.message || ''; status.hidden = !status.textContent; status.classList.toggle('error', workbenchUpdateState.phase === 'error'); }
}
async function updateApi(base, path, body) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (response.status === 404) throw new Error('当前服务尚不支持在线更新，请先手动更新一次并重新启动工作台');
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || '操作未完成，请重试');
    return result;
  } finally { clearTimeout(timer); }
}
const updateDelay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function flushConfigBeforeUpdate() {
  saveState();
  const deadline = Date.now() + 8000;
  while ((configWriting || configQueued) && Date.now() < deadline) await updateDelay(100);
  if (configWriting || configQueued) throw new Error('个人配置尚未保存到本机，请稍后重试');
  await configRequest(personalConfig.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(configDoc(captureUserSettings())) });
  personalConfig.available = true;
}
function checkWorkbenchUpdate() {
  if (workbenchUpdateTask) return workbenchUpdateTask;
  workbenchUpdateTask = (async () => {
    try {
      workbenchUpdateState = { phase: 'checking', message: '正在连接本地更新服务…' }; renderWorkbenchUpdate();
      if (!location.protocol.startsWith('http')) throw new Error('请通过“启动工作台”打开本地服务版，再检查程序更新');
      const { base, info } = await resolveApiBase();
      if (!info || base) throw new Error('请从本地服务提供的工作台页面检查更新，先双击“启动工作台”');
      await flushConfigBeforeUpdate();
      let result = await updateApi(base, '/api/app-update', {});
      const jobId = result.jobId, deadline = Date.now() + 360000;
      while (true) {
        workbenchUpdateState = result; renderWorkbenchUpdate();
        if (result.phase === 'error') throw new Error(result.message);
        if (result.phase === 'latest') { toast(result.message); return; }
        if (result.phase === 'updated') {
          await flushConfigBeforeUpdate();
          toast('程序已更新，共享路径、个人配置和物料数据已保留，正在刷新…');
          try { sessionStorage.setItem('mdm-program-update', JSON.stringify({ version: result.version, at: Date.now() })); } catch (error) {}
          location.reload(); return;
        }
        if (Date.now() > deadline) throw new Error('更新仍在后台进行，请稍后重新检查；不要关闭电脑');
        await updateDelay(900);
        try {
          const next = await updateApi(base, '/api/app-update');
          if (next.jobId !== jobId) throw new Error('更新状态已变化，请重新检查');
          result = next;
        } catch (error) {
          if (!['restarting', 'updating'].includes(result.phase)) throw error;
          // 后台服务切换期间连接会短暂断开，继续等待同一个更新任务。
        }
      }
    } catch (error) {
      workbenchUpdateState = { phase: 'error', message: error.message || '更新未完成，请重试' }; renderWorkbenchUpdate();
      toast(workbenchUpdateState.message, true);
    }
  })().finally(() => { workbenchUpdateTask = null; renderWorkbenchUpdate(); });
  return workbenchUpdateTask;
}
function notifyWorkbenchUpdated() {
  try {
    const item = JSON.parse(sessionStorage.getItem('mdm-program-update') || 'null');
    sessionStorage.removeItem('mdm-program-update');
    if (item && Date.now() - item.at < 300000) toast('已更新到 ' + String(item.version || '').slice(0, 8) + '，共享路径、个人配置和物料数据已保留');
  } catch (error) {}
}
function bindWorkbenchUpdateButton() {
  const button = document.getElementById('btnAppUpdate'); if (!button) return;
  button.onclick = checkWorkbenchUpdate; renderWorkbenchUpdate();
  resolveApiBase().then(({ info }) => { if (button.isConnected && info?.version) button.title = '当前版本 ' + info.version.slice(0, 8); }).catch(() => {});
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
      const data = await updateApi(base, '/api/source-settings');
      if (!isCurrent()) return;
      if (revision === 0) input.value = data.settings.sharePath || data.settings.shareUnc || data.settings.shareDirs[0] || '';
      note.textContent = '保存到本机，更新程序后继续沿用。';
    } catch (error) { if (isCurrent()) note.textContent = error.message; }
  }).catch(() => {});
  button.onclick = async () => {
    if (!ready) return;
    revision++; button.disabled = true; note.textContent = '正在保存…';
    try {
      await updateApi(base, '/api/source-settings', { sharePath: input.value.trim() });
      LAST_SOURCE_INFO = null;
      if (!isCurrent()) return;
      note.textContent = '已保存到本机，下次启动和更新程序后继续沿用。';
      toast('共享路径已保存，正在重新检查连接');
      if (typeof onSaved === 'function') onSaved(true);
    } catch (error) { note.textContent = error.message; toast(error.message, true); }
    finally { if (isCurrent()) button.disabled = false; }
  };
}
