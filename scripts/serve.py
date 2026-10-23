#!/usr/bin/env python3
"""MDM 工作台本地服务：
- 静态资源服务（禁用浏览器缓存 + 大文件 gzip 压缩）
- 快捷路由（/ 与 /mdm[/物料编码] 302 到工作台）
- 深链直达（/outputs/MDM高级查询工作台.html/<物料编码>）
- 双路线源数据热刷新 API：
  * GET  /api/source-info      查询当前数据源信息与共享盘最新报表候选
  * POST /api/refresh-source   触发路线1（指定本地文件路径）或路线2（自动识别 \\files.example.invalid\示例组织\共享资料\MDM示例表 最新报表）重建数据集与工作台
  * POST /api/upload-excel     接收浏览器上传的本地 .xlsx 文件，保存到 outputs/advq/uploaded/ 并实时重建数据集与工作台

用法：python3 scripts/serve.py [端口]（默认 4173）
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import gzip
import io
import json
import os
import re
import sys
import threading
import traceback
from datetime import datetime
from urllib.parse import urlparse
from workbench_config import ConfigStore, MAX_BYTES
from source_settings import SourceSettingsStore

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173

WORKBENCH_URL = "/outputs/MDM高级查询工作台.html"
GZIP_SUFFIXES = {".html", ".htm", ".js", ".mjs", ".css", ".json", ".svg", ".csv", ".txt", ".md", ".xml"}
GZIP_MIN_BYTES = 1024

_gzip_cache = {}  # key=(path, mtime_ns, size) -> bytes
_personal_config = ConfigStore()
_source_config = SourceSettingsStore(ROOT)
_data_lock = threading.Lock()


def source_preferences(persist=False):
    bad = _get_bad_module()
    defaults = dict(bad._SOURCE_PREFS)
    if not _source_config.path.exists():
        # 老版本已导入的业务快照也可迁移共享路径，避免升级后再手动填写。
        dataset_path = ROOT / "outputs/advq/dataset.json"
        if dataset_path.is_file():
            meta = json.loads(dataset_path.read_text(encoding="utf-8")).get("meta", {})
            if not (defaults.get("sharePath") or defaults.get("shareUnc") or defaults.get("shareDirs")) and meta.get("shareUnc"):
                defaults.update(sharePath=meta["shareUnc"], shareUnc=meta["shareUnc"])
            if meta.get("sourceMode") != "完全虚构演示数据" and meta.get("sourcePath"):
                defaults["sourcePath"] = meta["sourcePath"]
    return _source_config.resolve(defaults, persist=persist)



def _gzip_body(path: str, raw: bytes) -> bytes:
    stat = os.stat(path)
    key = (path, stat.st_mtime_ns, stat.st_size)
    cached = _gzip_cache.get(key)
    if cached is not None:
        return cached
    body = gzip.compress(raw, 6)
    _gzip_cache.clear()
    _gzip_cache[key] = body
    return body


def _get_bad_module():
    """获取最新版本的 build_adv_query_dataset 模块（若脚本文件更新则自动 reload）。"""
    import importlib
    import build_adv_query_dataset as bad
    return importlib.reload(bad)


def _rebuild_all(source_path: str = "", auto_share: bool = False, share_dir: str = "") -> dict:
    """调用 build_adv_query_dataset + build_adv_query_workbench 重建最新数据与单文件 HTML。"""
    with _data_lock:
        import importlib
        bad = _get_bad_module()
        share_dir = share_dir or source_preferences().get("sharePath", "")
        import build_adv_query_workbench as baw
        baw = importlib.reload(baw)

        argv = []
        if auto_share:
            argv.append("--auto-share")
            if share_dir:
                argv.extend(["--share-dir", share_dir])
        elif source_path:
            argv.extend(["--source", source_path])

        dataset = bad.main(argv)
        baw.main()
        _gzip_cache.clear()
        return dataset.get("meta", {})


class NoCacheHandler(SimpleHTTPRequestHandler):
    def _local_request(self, allow_file=False):
        host = urlparse("http://" + self.headers.get("Host", "")).hostname
        origin = self.headers.get("Origin")
        allowed = {"localhost", "127.0.0.1", "::1"}
        valid = host in allowed
        if origin and not (origin == "null" and allow_file):
            parsed = urlparse(origin)
            valid = valid and parsed.scheme == "http" and parsed.hostname in allowed and (parsed.port or 80) == self.server.server_port
        if not valid:
            self._send_json(403, {"ok": False, "error": "仅允许本机服务页面操作数据源设置"})
        return valid

    def _send_json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _handle_api_get(self) -> bool:
        p = self.path.split("?", 1)[0]
        if p == "/api/source-settings":
            if not self._local_request(allow_file=True):
                return True
            try:
                data = {"ok": True, "settings": source_preferences(persist=True)}
                self._send_json(200, data)
            except (ValueError, OSError, RuntimeError) as error:
                self._send_json(400, {"ok": False, "error": str(error)})
            return True
        if p == "/api/health":
            self._send_json(200, {"ok": True, "service": "mdm-advanced-query-console", "pid": os.getpid()})
            return True
        if p == "/api/user-config":
            origin = self.headers.get("Origin")
            if origin and origin != "null" and urlparse(origin).hostname not in {"localhost", "127.0.0.1", "::1"}:
                self._send_json(403, {"ok": False, "error": "仅允许本机工作台读取个人配置"})
                return True
            try:
                self._send_json(200, _personal_config.read())
            except (ValueError, OSError) as e:
                self._send_json(500, {"ok": False, "error": str(e), "configPath": str(_personal_config.path)})
            return True
        if p == "/api/share-status":
            try:
                bad = _get_bad_module()
                status = bad.probe_intranet_share_status(auto_mount=False)
                self._send_json(200, {"ok": True, "shareStatus": status})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return True
        if p != "/api/source-info":
            return False
        try:
            bad = _get_bad_module()
            share_status = bad.probe_intranet_share_status(raw_path=source_preferences().get("sharePath") or bad.SHARE_UNC, auto_mount=False)
            latest_file = None
            latest_mode = ""
            latest_mtime = ""
            try:
                cand, mode = bad.resolve_latest_share_excel(source_preferences().get("sharePath") or None)
                latest_file = str(cand)
                latest_mode = mode
                latest_mtime = datetime.fromtimestamp(cand.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
            except Exception as e:
                latest_mode = f"未检测到可用报表 ({e})"

            share_candidates = []
            try:
                share_candidates = bad.list_share_finished_excels(source_preferences().get("sharePath") or None)
            except Exception:
                pass

            ds_meta = {}
            ds_path = ROOT / "outputs/advq/dataset.json"
            if ds_path.exists():
                try:
                    data = json.loads(ds_path.read_text(encoding="utf-8"))
                    ds_meta = data.get("meta", {})
                except Exception:
                    pass

            self._send_json(200, {
                "ok": True,
                "shareUnc": bad.SHARE_UNC,
                "shareSmb": bad.SHARE_SMB,
                "shareStatus": share_status,
                "latestCandidate": {
                    "path": latest_file,
                    "name": Path(latest_file).name if latest_file else "",
                    "mtime": latest_mtime,
                    "mode": latest_mode,
                },
                "shareCandidates": share_candidates,
                "currentMeta": ds_meta,
            })
        except Exception as e:
            self._send_json(500, {"ok": False, "error": str(e)})
        return True

    def do_GET(self):
        if self._handle_api_get():
            return
        super().do_GET()

    def do_POST(self):
        p = self.path.split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or 0)
        if p == "/api/source-settings":
            if not self._local_request(allow_file=True):
                return
            if not 0 < length <= 16384 or self.headers.get_content_type() != "application/json":
                self._send_json(400, {"ok": False, "error": "请求格式不正确"})
                return
            try:
                req = json.loads(self.rfile.read(length).decode("utf-8"))
                if not isinstance(req, dict):
                    raise ValueError("请求格式不正确")
                settings = _source_config.save_shared_path(req.get("sharePath", ""), source_preferences())
                self._send_json(200, {"ok": True, "settings": settings})
            except (ValueError, OSError, RuntimeError) as error:
                self._send_json(400, {"ok": False, "error": str(error)})
            return
        if p == "/api/user-config":
            origin = self.headers.get("Origin")
            if origin and origin != "null" and urlparse(origin).hostname not in {"localhost", "127.0.0.1", "::1"}:
                self._send_json(403, {"ok": False, "error": "仅允许本机工作台保存个人配置"})
                return
            if length <= 0 or length > MAX_BYTES:
                self._send_json(413, {"ok": False, "error": "个人配置大小不正确或超过 2 MB"})
                return
            if self.headers.get_content_type() != "application/json":
                self._send_json(415, {"ok": False, "error": "个人配置必须为 JSON"})
                return
            try:
                document = json.loads(self.rfile.read(length).decode("utf-8"))
                self._send_json(200, _personal_config.save(document))
            except (ValueError, OSError) as e:
                self._send_json(400, {"ok": False, "error": str(e)})
            return
        body = self.rfile.read(length) if length > 0 else b""

        if p == "/api/mount-share":
            try:
                bad = _get_bad_module()
                req = json.loads(body.decode("utf-8") or "{}")
                share_dir = (req.get("shareDir") or "").strip() or source_preferences().get("sharePath") or bad.SHARE_UNC
                status = bad.probe_intranet_share_status(raw_path=share_dir, auto_mount=True)
                self._send_json(200, {"ok": True, "shareStatus": status})
            except Exception as e:
                traceback.print_exc()
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if p == "/api/refresh-source":
            try:
                req = json.loads(body.decode("utf-8") or "{}")
                mode = req.get("mode") or "auto_share"
                source_path = (req.get("sourcePath") or "").strip()
                share_dir = (req.get("shareDir") or "").strip()
                if mode == "local_path":
                    if not source_path:
                        self._send_json(400, {"ok": False, "error": "请提供本地 Excel 文件路径"})
                        return
                    meta = _rebuild_all(source_path=source_path, auto_share=False)
                else:
                    meta = _rebuild_all(auto_share=True, share_dir=share_dir)
                self._send_json(200, {"ok": True, "meta": meta})
            except Exception as e:
                traceback.print_exc()
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if p == "/api/upload-excel":
            try:
                raw_name = self.headers.get("X-File-Name") or "uploaded_mdm.xlsx"
                from urllib.parse import unquote
                fname = unquote(raw_name)
                fname = re.sub(r'[\\/:*?"<>|]+', "_", fname)
                if not fname.lower().endswith(".xlsx"):
                    fname += ".xlsx"
                up_dir = ROOT / "outputs/advq/uploaded"
                up_dir.mkdir(parents=True, exist_ok=True)
                target = up_dir / fname
                target.write_bytes(body)
                meta = _rebuild_all(source_path=str(target), auto_share=False)
                self._send_json(200, {"ok": True, "meta": meta, "savedAs": str(target)})
            except Exception as e:
                traceback.print_exc()
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        self._send_json(404, {"ok": False, "error": f"Unknown API endpoint: {p}"})

    def _route_html_deep_link(self) -> None:
        p = self.path.split("?", 1)[0].split("#", 1)[0]
        if p.endswith("/"):
            return
        head, _, tail = p.rpartition("/")
        if not tail or not head.lower().endswith(".html"):
            return
        if os.path.isfile(self.translate_path(head)):
            self.path = head

    def _route_workbench_alias(self) -> bool:
        from urllib.parse import quote
        p = self.path.split("?", 1)[0].split("#", 1)[0]
        loc = None
        if p == "/" or p == "/mdm" or p == "/mdm/":
            loc = WORKBENCH_URL
        elif p.startswith("/mdm/"):
            tail = p[len("/mdm/"):].strip("/")
            loc = WORKBENCH_URL + ("/" + tail if tail else "")
        if loc is None:
            return False
        self.send_response(302)
        self.send_header("Location", quote(loc, safe="/"))
        self.send_header("Content-Length", "0")
        self.end_headers()
        return True

    def send_head(self):
        if self._route_workbench_alias():
            return None
        self._route_html_deep_link()
        path = self.translate_path(self.path)
        suffix = os.path.splitext(path)[1].lower()
        if not os.path.isfile(path) or suffix not in GZIP_SUFFIXES:
            return super().send_head()
        try:
            with open(path, "rb") as handle:
                raw = handle.read()
        except OSError:
            return super().send_head()
        accept = (self.headers.get("Accept-Encoding") or "").lower()
        if "gzip" not in accept or len(raw) < GZIP_MIN_BYTES:
            return super().send_head()
        body = _gzip_body(path, raw)
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Last-Modified", self.date_time_string(int(os.stat(path).st_mtime)))
        self.send_header("Content-Encoding", "gzip")
        self.end_headers()
        return io.BytesIO(body)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-File-Name")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, fmt: str, *args) -> None:
        print(f"[req] {self.command} {self.path} -> {fmt % args}", flush=True)


if __name__ == "__main__":
    handler = partial(NoCacheHandler, directory=str(ROOT))
    print(f"MDM 工作台： http://localhost:{PORT}/ （目录 {ROOT}）")
    print(f"快捷入口：   http://localhost:{PORT}/mdm          （= 工作台）")
    print(f"深链直达：   http://localhost:{PORT}/mdm/物料编码  （直接打开该 SKU 详情）")
    print("数据源API：  /api/source-info | /api/refresh-source | /api/upload-excel")
    print("个人配置：  %s" % _personal_config.path)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    try:
        server.serve_forever()
    finally:
        server.server_close()
