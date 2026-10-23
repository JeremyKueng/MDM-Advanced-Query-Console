"""使用本机临时 Git 远端验证真实快进、物料保护、配置迁移及失败回滚，不访问业务源表。"""
import json
import os
from pathlib import Path
import subprocess
import signal
import socket
import time
from urllib.error import HTTPError
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from workbench_update import AppUpdater, DATA_FILES, canonical_remote, git, settings_only_change, local_json


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.origin = self.folder / 'origin.git'
        self.seed = self.folder / 'publisher'
        self.root = self.folder / 'installed'
        self.profile = self.folder / 'profile'
        self.profile.mkdir()
        self.environment = patch.dict(os.environ, {'MDM_WORKBENCH_CONFIG_DIR': str(self.profile)})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.command('init', '--bare', str(self.origin))
        self.command('init', '-b', 'main', str(self.seed))
        self.command('-C', str(self.seed), 'config', 'user.email', 'tests@example.invalid')
        self.command('-C', str(self.seed), 'config', 'user.name', 'Tests')
        files = {'README.md':'old code', DATA_FILES[0]:'{"demo":true}', DATA_FILES[1]:'DEMO', DATA_FILES[2]:'OLD DEMO HTML',
                 'scripts/build_adv_query_dataset.py':'SHARE_UNC = ""\n_SOURCE_PREFS={"version":1,"sharePath":"","shareUnc":"","shareSmb":"","shareDirs":[],"sourcePath":""}\nprint("source")\n',
                 'scripts/build_adv_query_workbench.py': 'from pathlib import Path\nr=Path(__file__).resolve().parents[1]\n(r/"' + DATA_FILES[2] + '").write_text("NEW CODE:"+(r/"' + DATA_FILES[1] + '").read_text())\n'}
        for name, text in files.items():
            p = self.seed / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding='utf-8')
        for name in ('serve.py','workbench_update.py','source_settings.py','workbench_config.py','launch_workbench.py'):
            (self.seed/'scripts'/name).write_bytes((Path(__file__).resolve().parents[1]/'scripts'/name).read_bytes())
        self.command('-C', str(self.seed), 'add', '.')
        self.command('-C', str(self.seed), 'commit', '-m', 'initial')
        self.command('-C', str(self.seed), 'remote', 'add', 'origin', str(self.origin))
        self.command('-C', str(self.seed), 'push', 'origin', 'main')
        self.command('--git-dir', str(self.origin), 'symbolic-ref', 'HEAD', 'refs/heads/main')
        self.command('clone', str(self.origin), str(self.root))
        self.before = git(self.root, 'rev-parse', 'HEAD')
        self.saved = {DATA_FILES[0]:b'{"private_records":123}', DATA_FILES[1]:b'USER-DATA', DATA_FILES[2]:b'USER-HTML'}
        for name, data in self.saved.items():
            (self.root / name).write_bytes(data)
        self.preferences = b'{"settings":{"v":8,"savedViews":["keep"],"processRules":{"keep":true}}}'
        (self.profile / 'user-config.json').write_bytes(self.preferences)
        (self.profile / 'source-settings.json').write_text('{"version":1,"sharePath":"Z:/reports"}')
        self.updater = AppUpdater(self.root, self.profile / 'updates', str(self.origin))

    def command(self, *args):
        return subprocess.run(['git', *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def publish(self, broken=False, broken_server=False):
        (self.seed/'README.md').write_text('new code')
        (self.seed/DATA_FILES[0]).write_text('{"new_demo":true}')
        (self.seed/DATA_FILES[1]).write_text('NEW DEMO')
        (self.seed/DATA_FILES[2]).write_text('NEW DEMO HTML')
        if broken:
            (self.seed/'scripts/build_adv_query_workbench.py').write_text('raise RuntimeError("broken release")')
        if broken_server:
            (self.seed/'scripts/serve.py').write_text('raise RuntimeError("broken server")')
        self.command('-C',str(self.seed),'add','.')
        self.command('-C',str(self.seed),'commit','-m','new version')
        self.command('-C',str(self.seed),'push','origin','main')
        return git(self.seed,'rev-parse','HEAD')

    def assert_preferences_unchanged(self):
        self.assertEqual((self.profile/'user-config.json').read_bytes(),self.preferences)
        self.assertEqual(json.loads((self.profile/'source-settings.json').read_text())['sharePath'],'Z:/reports')

    def test_update_keeps_private_data_and_rebuilds_html_with_new_code(self):
        target=self.publish()
        self.assertTrue(self.updater.update_code())
        self.assertEqual(git(self.root,'rev-parse','HEAD'),target)
        for name in DATA_FILES[:2]:self.assertEqual((self.root/name).read_bytes(),self.saved[name])
        self.assertEqual((self.root/DATA_FILES[2]).read_text(),'NEW CODE:USER-DATA')
        self.assert_preferences_unchanged()
        backup=Path(self.updater.status()['backup'])
        self.assertEqual((backup/'user-config.json').read_bytes(),self.preferences)
        self.assertEqual((backup/DATA_FILES[2]).read_bytes(),self.saved[DATA_FILES[2]])

    def test_latest_does_not_touch_any_local_data(self):
        self.assertFalse(self.updater.update_code())
        self.assertEqual(self.updater.status()['phase'],'latest')
        for name,data in self.saved.items():self.assertEqual((self.root/name).read_bytes(),data)
        self.assert_preferences_unchanged()

    def test_invalid_release_never_replaces_current_code(self):
        self.publish(broken=True)
        with self.assertRaisesRegex(RuntimeError,'预检'):
            self.updater.update_code()
        self.assertEqual(git(self.root,'rev-parse','HEAD'),self.before)
        for name,data in self.saved.items():self.assertEqual((self.root/name).read_bytes(),data)
        self.assert_preferences_unchanged()

    def test_write_failure_after_fast_forward_restores_old_version_and_data(self):
        self.publish()
        original=self.updater.restore_file
        failed=[False]
        def write(name, data):
            if name==DATA_FILES[2] and data.startswith(b'NEW CODE:') and not failed[0]:
                failed[0]=True
                raise OSError('simulated write failure')
            return original(name,data)
        with patch.object(self.updater,'restore_file',side_effect=write):
            with self.assertRaises(OSError):self.updater.update_code()
        self.assertEqual(git(self.root,'rev-parse','HEAD'),self.before)
        for name,data in self.saved.items():self.assertEqual((self.root/name).read_bytes(),data)
        self.assert_preferences_unchanged()

    def test_user_code_edits_and_untrusted_remotes_are_preserved(self):
        self.publish()
        (self.root/'README.md').write_text('my edits')
        with self.assertRaisesRegex(RuntimeError,'未提交修改'):self.updater.update_code()
        self.assertEqual((self.root/'README.md').read_text(),'my edits')
        self.assertEqual(git(self.root,'rev-parse','HEAD'),self.before)
        self.assertEqual(canonical_remote('git@github.com:JeremyKueng/MDM-Advanced-Query-Console.git'),canonical_remote('https://github.com/JeremyKueng/MDM-Advanced-Query-Console.git'))
        untrusted=AppUpdater(self.root,self.profile/'other')
        with self.assertRaisesRegex(RuntimeError,'更新源'):untrusted.check_repository()

    def test_background_worker_restarts_service_and_keeps_profile(self):
        self.exercise_background_update(self.publish())

    def test_failed_new_server_restores_old_version_and_service(self):
        self.exercise_background_update(self.publish(broken_server=True), fail=True)

    def exercise_background_update(self, target, fail=False):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1',0))
            port=probe.getsockname()[1]
        bootstrap = "import sys;sys.path.insert(0,"+repr(str(self.root/'scripts'))+");sys.argv=['serve.py',"+repr(str(port))+"];import serve;from functools import partial;from http.server import ThreadingHTTPServer;from workbench_update import AppUpdater;serve._app_updater=AppUpdater(serve.ROOT,expected_remote="+repr(str(self.origin))+");server=ThreadingHTTPServer(('127.0.0.1',"+str(port)+"),partial(serve.NoCacheHandler,directory=str(serve.ROOT)));server.serve_forever();server.server_close()"
        log=(self.folder/'server.log').open('wb')
        process=subprocess.Popen([sys.executable,'-c',bootstrap],cwd=str(self.root),stdout=log,stderr=subprocess.STDOUT)
        base='http://127.0.0.1:'+str(port)
        pids={process.pid}
        try:
            deadline=time.monotonic()+10
            while True:
                try:
                    health=local_json(base+'/api/health',timeout=.3)
                    break
                except OSError:
                    if time.monotonic()>deadline:raise AssertionError('test server did not start')
                    time.sleep(.05)
            from urllib.request import Request, urlopen
            request=Request(base+'/api/app-update',data=b'{}',headers={'Content-Type':'application/json','Origin':'https://attacker.invalid'})
            with self.assertRaises(HTTPError) as denied:urlopen(request)
            self.assertEqual(denied.exception.code,403)
            started=local_json(base+'/api/app-update',{})
            self.assertEqual(started['phase'],'checking')
            self.assertEqual(local_json(base+'/api/app-update',{})['jobId'],started['jobId'],'repeat requests reuse the same job')
            deadline=time.monotonic()+45
            while True:
                try:
                    state=local_json(base+'/api/app-update',timeout=.4)
                    if state['phase'] in ('error','updated'):break
                except OSError:pass
                if time.monotonic()>deadline:raise AssertionError('update worker timed out')
                time.sleep(.1)
            self.assertEqual(state['phase'],'error' if fail else 'updated',state)
            if fail:self.assertIn('已恢复旧版',state['message'])
            new_health=local_json(base+'/api/health')
            pids.add(new_health['pid'])
            self.assertNotEqual(new_health['pid'],health['pid'])
            self.assertEqual(new_health['version'],self.before if fail else target)
            self.assert_preferences_unchanged()
            for name in DATA_FILES[:2]:self.assertEqual((self.root/name).read_bytes(),self.saved[name])
            self.assertEqual((self.root/DATA_FILES[2]).read_text(),'USER-HTML' if fail else 'NEW CODE:USER-DATA')
        finally:
            try:pids.add(local_json(base+'/api/health',timeout=.3)['pid'])
            except OSError:pass
            for pid in pids:
                try:os.kill(pid,signal.SIGTERM)
                except ProcessLookupError:pass
            process.wait(timeout=5)
            log.close()

    def test_only_legacy_path_constants_may_be_migrated(self):
        path=self.root/'scripts/build_adv_query_dataset.py'
        original=path.read_text()
        path.write_text(original.replace('SHARE_UNC = ""','SHARE_UNC = "local path"'))
        self.assertTrue(settings_only_change(self.root))
        self.assertIn(str(path.relative_to(self.root)),self.updater.check_repository())
        path.write_text(path.read_text().replace('print("source")','print("changed code")'))
        self.assertFalse(settings_only_change(self.root))
        with self.assertRaisesRegex(RuntimeError,'未提交修改'):self.updater.check_repository()


if __name__=='__main__':unittest.main()
