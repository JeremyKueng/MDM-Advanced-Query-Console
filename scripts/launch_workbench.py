#!/usr/bin/env python3
"""启动独立的本地工作台进程；启动器退出或关闭终端后服务继续运行。"""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener
import webbrowser

from workbench_config import config_directory

ROOT = Path(__file__).resolve().parents[1]
SERVICE = "mdm-advanced-query-console"


def health(port):
    # 回环探测不经过系统代理，避免内网代理设置影响本地服务识别。
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(Request("http://127.0.0.1:%d/api/health" % port), timeout=0.6) as response:
            data = json.load(response)
            if data.get("ok") and data.get("service") == SERVICE:
                return data
    except (OSError, ValueError, HTTPError, URLError):
        pass
    return None


def port_occupied(port):
    with socket.socket() as probe:
        probe.settimeout(0.3)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def ensure_server(port):
    existing = health(port)
    if existing:
        return existing, False
    if port_occupied(port):
        raise RuntimeError("端口 %d 已被其他程序占用，未停止或替换该程序。" % port)
    log_dir = config_directory()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "workbench-server.log"
    options = {"cwd": str(ROOT), "stdin": subprocess.DEVNULL, "stderr": subprocess.STDOUT,
               "env": {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}}
    if os.name == "nt":
        options["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        options["start_new_session"] = True
    with log_path.open("ab") as log:
        process = subprocess.Popen([sys.executable, "-u", str(ROOT / "scripts/serve.py"), str(port)], stdout=log, **options)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        info = health(port)
        if info:
            return info, True
        if process.poll() is not None:
            raise RuntimeError("服务启动失败，请查看日志：%s" % log_path)
        time.sleep(0.15)
    raise RuntimeError("服务启动后尚未就绪，请查看日志：%s" % log_path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("端口应在 1 到 65535 之间")
    try:
        info, started = ensure_server(args.port)
    except (OSError, RuntimeError) as error:
        print("工作台启动失败：%s" % error, file=sys.stderr)
        return 1
    url = "http://127.0.0.1:%d/mdm" % args.port
    print(("后台服务已启动" if started else "已连接现有后台服务") + "：%s（PID %s）" % (url, info["pid"]))
    print("关闭此启动窗口后，工作台仍可使用。日志：%s" % (config_directory() / "workbench-server.log"))
    if not args.no_browser:
        webbrowser.open(url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
