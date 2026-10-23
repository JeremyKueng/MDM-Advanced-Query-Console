"""后台启动器退出后仍可访问、重复启动复用、端口冲突不干预其他进程。"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import importlib.util
import json
import os
from pathlib import Path
import signal
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("launch_workbench", ROOT / "scripts/launch_workbench.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def test_release_link_preserves_existing_profile_and_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'development'
            target = Path(directory) / 'release'
            root.mkdir()
            (target / 'scripts').mkdir(parents=True)
            (target / 'scripts/launch_workbench.py').write_text('# release launcher')
            (root / 'workbench-runtime.local.json').write_text(json.dumps({'version':1,'directory':str(target)}))
            def git(_root, *args):
                return {('rev-parse','--show-toplevel'):str(target),('remote','get-url','origin'):'https://github.com/JeremyKueng/MDM-Advanced-Query-Console.git',('branch','--show-current'):'main'}[args]
            profile = Path(directory) / 'original-profile'
            with patch.object(launcher,'runtime_git',side_effect=git):
                self.assertEqual(launcher.linked_runtime(root),target.resolve())
            with patch.object(launcher,'config_directory',return_value=profile), patch.object(launcher.subprocess,'run') as run:
                run.return_value.returncode = 0
                self.assertEqual(launcher.launch_linked_runtime(target,['--port','4199','--no-browser']),0)
                args,kwargs=run.call_args
                self.assertEqual(args[0],[sys.executable,str(target/'scripts/launch_workbench.py'),'--port','4199','--no-browser'])
                self.assertEqual(kwargs['env']['MDM_WORKBENCH_CONFIG_DIR'],str(profile.resolve()))

    def test_release_link_rejects_untrusted_missing_or_recursive_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            self.assertIsNone(launcher.linked_runtime(root))
            marker=root/'workbench-runtime.local.json'
            marker.write_text(json.dumps({'version':1,'directory':str(root)}))
            with self.assertRaisesRegex(RuntimeError,'循环'):launcher.linked_runtime(root)
            marker.write_text(json.dumps({'version':1,'directory':'relative-path'}))
            with self.assertRaisesRegex(RuntimeError,'格式'):launcher.linked_runtime(root)
            target=root/'release';(target/'scripts').mkdir(parents=True)
            (target/'scripts/launch_workbench.py').write_text('# release launcher')
            marker.write_text(json.dumps({'version':1,'directory':str(target)}))
            with patch.object(launcher,'runtime_git',side_effect=[str(target),'https://github.com/other/untrusted.git']):
                with self.assertRaisesRegex(RuntimeError,'GitHub'):launcher.linked_runtime(root)
            (target/marker.name).write_text('{}')
            with self.assertRaisesRegex(RuntimeError,'循环'):launcher.linked_runtime(root)

    def test_detached_service_survives_launcher_and_is_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            project=Path(directory)/'project';(project/'scripts').mkdir(parents=True)
            for name in ('launch_workbench.py','serve.py','source_settings.py','workbench_config.py'):
                shutil.copy2(ROOT/'scripts'/name,project/'scripts'/name)
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", 0))
                port = probe.getsockname()[1]
            environment = {**os.environ, "MDM_WORKBENCH_CONFIG_DIR": directory}
            command = [sys.executable, str(project / "scripts/launch_workbench.py"), "--port", str(port), "--no-browser"]
            result = subprocess.run(command, env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            info = launcher.health(port)
            self.assertIsNotNone(info, "启动器已退出，服务仍应可访问")
            pid = info["pid"]
            try:
                for endpoint in ('/api/app-update', '/api/app-update/restart'):
                    request=Request('http://127.0.0.1:%d%s' % (port,endpoint),data=b'{}',headers={'Content-Type':'application/json'})
                    with self.assertRaises(HTTPError) as removed:urlopen(request,timeout=2)
                    self.assertEqual(removed.exception.code,404,'old pages cannot invoke removed update endpoints')
                repeated = subprocess.run(command, env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
                self.assertEqual(repeated.returncode, 0, repeated.stderr)
                self.assertIn("已连接现有后台服务", repeated.stdout)
                self.assertEqual(launcher.health(port)["pid"], pid)
                self.assertTrue((Path(directory) / "workbench-server.log").is_file())
                self.assertFalse((Path(directory) / "user-config.json").exists(), "启动服务不应创建或重置个人配置")
            finally:
                os.kill(pid, signal.SIGTERM)
                deadline = time.monotonic() + 3
                while launcher.health(port) and time.monotonic() < deadline:
                    time.sleep(0.05)

    def test_original_entry_starts_official_copy_with_original_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'development';target=Path(directory)/'release';profile=Path(directory)/'profile'
            for folder in (root,target):
                (folder/'scripts').mkdir(parents=True)
                for name in ('launch_workbench.py','serve.py','source_settings.py','workbench_config.py'):
                    shutil.copy2(ROOT/'scripts'/name,folder/'scripts'/name)
            for args in (['init','-b','main'],['remote','add','origin','https://github.com/JeremyKueng/MDM-Advanced-Query-Console.git']):
                subprocess.run(['git','-C',str(target),*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            (root/'workbench-runtime.local.json').write_text(json.dumps({'version':1,'directory':str(target)}))
            profile.mkdir();personal=b'{"keep":"my settings"}';(profile/'user-config.json').write_bytes(personal)
            with socket.socket() as probe:
                probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
            result=subprocess.run([sys.executable,str(root/'scripts/launch_workbench.py'),'--port',str(port),'--no-browser'],
                                  env={**os.environ,'MDM_WORKBENCH_CONFIG_DIR':str(profile)},text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
            self.assertEqual(result.returncode,0,result.stderr)
            info=launcher.health(port);self.assertIsNotNone(info)
            try:
                self.assertEqual((profile/'user-config.json').read_bytes(),personal)
                self.assertTrue((profile/'workbench-server.log').exists())
                # 正式程序在目标目录运行，开发副本不会被服务使用。
                log=(profile/'workbench-server.log').read_text()
                self.assertIn(str(target),log)
            finally:
                os.kill(info['pid'],signal.SIGTERM)

    def test_foreign_port_is_reported_without_stopping_it(self):
        class ForeignHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(404)
                self.end_headers()
            def log_message(self, *_args):
                pass
        server = HTTPServer(("127.0.0.1", 0), ForeignHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            port = server.server_address[1]
            with self.assertRaisesRegex(RuntimeError, "已被其他程序占用"):
                launcher.ensure_server(port)
            self.assertTrue(launcher.port_occupied(port))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
