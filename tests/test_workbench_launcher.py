"""后台启动器退出后仍可访问、重复启动复用、端口冲突不干预其他进程。"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("launch_workbench", ROOT / "scripts/launch_workbench.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def test_detached_service_survives_launcher_and_is_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", 0))
                port = probe.getsockname()[1]
            environment = {**os.environ, "MDM_WORKBENCH_CONFIG_DIR": directory}
            command = [sys.executable, str(ROOT / "scripts/launch_workbench.py"), "--port", str(port), "--no-browser"]
            result = subprocess.run(command, env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            info = launcher.health(port)
            self.assertIsNotNone(info, "启动器已退出，服务仍应可访问")
            pid = info["pid"]
            try:
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
