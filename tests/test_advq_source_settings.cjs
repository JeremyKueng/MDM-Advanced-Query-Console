const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../outputs/advq/advq.source-settings.js'), 'utf8');
async function main() {
  const nodes = new Map(['srcSharePathInput', 'btnSaveSharePath', 'sourceSettingsStatus'].map(id => [id, { value: '', disabled: true, textContent: '' }]));
  let resolveSettings, savedPath, refreshed = false, current = true;
  const requests = [], messages = [];
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, document: { getElementById: id => nodes.get(id) },
    toast: (...args) => messages.push(args), LAST_SOURCE_INFO: { old: true }, resolveApiBase: async () => ({ base: '', info: { ok: true } }),
    fetch: async (url, options) => {
      requests.push(url);
      if (options.method === 'POST') { savedPath = JSON.parse(options.body).sharePath; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
      return new Promise(resolve => { resolveSettings = resolve; });
    } });
  vm.runInContext(source, context);
  context.bindSourceSettingsEditor(() => current, force => { refreshed = force; });
  await new Promise(setImmediate);
  const input = nodes.get('srcSharePathInput'); input.value = 'Z:/my-reports'; input.oninput();
  resolveSettings({ ok: true, status: 200, json: async () => ({ ok: true, settings: { sharePath: 'Z:/old-reports', shareDirs: [] } }) });
  await new Promise(setImmediate);
  assert.equal(input.value, 'Z:/my-reports', 'a delayed response preserves the path being edited');
  await nodes.get('btnSaveSharePath').onclick();
  assert.equal(savedPath, 'Z:/my-reports'); assert.equal(refreshed, true);
  assert.equal(context.LAST_SOURCE_INFO, null, 'saving refreshes the shared-drive result');
  assert.equal(nodes.get('btnSaveSharePath').disabled, false);
  assert.ok(requests.every(url => url === '/api/source-settings'), 'the editor only requests source settings');
  current = false; refreshed = false;
  await nodes.get('btnSaveSharePath').onclick();
  assert.equal(refreshed, false, 'a closed dialog ignores late refresh callbacks');
  current = true;
  context.fetch = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, error: '路径格式不正确' }) });
  await nodes.get('btnSaveSharePath').onclick();
  assert.equal(nodes.get('sourceSettingsStatus').textContent, '路径格式不正确');
  assert.equal(nodes.get('btnSaveSharePath').disabled, false, 'a failed save can be retried');
  console.log('PASS: source-path editing, persistence, cache refresh, closed-dialog handling and retry.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
