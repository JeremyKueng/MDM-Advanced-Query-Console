"""用户主动检查后，从固定 GitHub main 快进更新；数据与个人配置始终留在本机。"""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlparse
from urllib.request import ProxyHandler, Request, build_opener
import uuid
import zipfile

from source_settings import atomic_json
from workbench_config import config_directory

PUBLISH_REPO = "https://github.com/JeremyKueng/MDM-Advanced-Query-Console.git"
DATA_FILES = ("outputs/advq/dataset.json", "outputs/advq/dataset.b64", "outputs/MDM高级查询工作台.html")
SOURCE_SCRIPT = "scripts/build_adv_query_dataset.py"
SOURCE_KEYS = {"SOURCE_XLSX", "SHARE_UNC", "SHARE_SMB", "SHARE_MOUNT_DIRS", "SHARE_CANDIDATES"}
BUSY = {"checking", "preparing", "updating", "restarting"}
_START_LOCK = threading.Lock()


def detached_options():
    if os.name == "nt":
        return {"creationflags": subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def canonical_remote(value):
    if value.startswith("git@github.com:"):
        value = "https://github.com/" + value.split(":", 1)[1]
    parsed = urlparse(value)
    if parsed.scheme in ("https", "ssh") and parsed.hostname == "github.com" and (not parsed.username or parsed.username == "git") and not parsed.password:
        path = parsed.path.rstrip("/").lower()
        return path[:-4] if path.endswith(".git") else path
    return value.rstrip("/")


def git(root, *args, timeout=30, binary=False):
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    env.setdefault("GIT_SSH_COMMAND", "ssh -o BatchMode=yes -o ConnectTimeout=15")
    options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
    try:
        result = subprocess.run(["git", "-C", str(root), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout, env=env, **options)
    except FileNotFoundError:
        raise RuntimeError("未找到 Git，请先安装 Git for Windows 或系统 Git，再检查更新")
    except subprocess.TimeoutExpired:
        raise RuntimeError("连接 GitHub 超时，请检查网络后重试；当前程序和配置未被替换")
    if result.returncode:
        detail = result.stderr.decode("utf-8", "replace").strip().splitlines()
        raise RuntimeError("Git 操作未完成：" + ("；".join(detail[-2:])[:400] if detail else "请检查本地仓库"))
    return result.stdout if binary else result.stdout.decode("utf-8", "replace").strip()


def loaded_version(root):
    try:
        return git(root, "rev-parse", "HEAD", timeout=3)
    except RuntimeError:
        return ""


def settings_only_change(root):
    def stripped(text):
        tree = ast.parse(text)
        tree.body = [node for node in tree.body if not (isinstance(node, ast.Assign) and all(isinstance(t, ast.Name) and t.id in SOURCE_KEYS for t in node.targets))]
        return ast.dump(tree, include_attributes=False)
    try:
        return stripped((Path(root) / SOURCE_SCRIPT).read_text(encoding="utf-8")) == stripped(git(root, "show", "HEAD:" + SOURCE_SCRIPT))
    except (ValueError, SyntaxError, OSError, RuntimeError):
        return False


def local_json(url, body=None, timeout=2):
    opener = build_opener(ProxyHandler({}))
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(url, data=data, headers={"Content-Type": "application/json"})
    with opener.open(request, timeout=timeout) as response:
        return json.load(response)


class AppUpdater:
    def __init__(self, root, directory=None, expected_remote=PUBLISH_REPO):
        self.root = Path(root).resolve()
        self.expected_remote = expected_remote
        self.directory = Path(directory) if directory else config_directory() / "updates" / hashlib.sha256(str(self.root).encode()).hexdigest()[:12]
        self.state_path = self.directory / "status.json"
        self.job_path = self.directory / "job.json"
        self.lock_path = self.directory / "running.lock"

    def status(self):
        if self.state_path.exists():
            try:
                state = json.loads(self.state_path.read_text(encoding="utf-8"))
                if state.get("phase") in BUSY and time.time() - state.get("at", 0) > 600:
                    state.update(phase="error", message="上次更新被中断，备份已保留，可以重新检查", finished=True)
                return {"ok": True, **state}
            except (ValueError, OSError):
                pass
        return {"ok": True, "phase": "idle", "message": "", "finished": True}

    def write_status(self, phase, message, **extra):
        state = self.status()
        state.update(phase=phase, message=message, at=time.time(), finished=phase not in BUSY, **extra)
        atomic_json(self.state_path, state)
        return state

    def start(self, port, pid, service):
        with _START_LOCK:
            current = self.status()
            if current["phase"] in BUSY:
                return current
            self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            try:
                fd = os.open(str(self.lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                os.close(fd)
            except FileExistsError:
                if time.time() - self.lock_path.stat().st_mtime < 600:
                    raise RuntimeError("另一个更新正在进行，请稍后重试")
                self.lock_path.unlink()
                fd = os.open(str(self.lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                os.close(fd)
            job = {"root": str(self.root), "expectedRemote": self.expected_remote, "directory": str(self.directory),
                   "port": port, "pid": pid, "service": service, "id": uuid.uuid4().hex}
            atomic_json(self.job_path, job)
            self.write_status("checking", "正在检查 GitHub 新版本…", jobId=job["id"], updated=False)
            try:
                with (self.directory / "update.log").open("ab") as log:
                    subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--worker", str(self.job_path)],
                                     cwd=str(self.root), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                     env={**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}, **detached_options())
            except Exception:
                self.lock_path.unlink()
                self.write_status("error", "更新进程启动失败，请重试")
                raise
            return self.status()

    def restore_file(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temp = tempfile.mkstemp(prefix=".update-", dir=str(target.parent))
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
            os.replace(temp, str(target))
        finally:
            if os.path.exists(temp):
                os.unlink(temp)

    def check_repository(self):
        if Path(git(self.root, "rev-parse", "--show-toplevel")).resolve() != self.root:
            raise RuntimeError("请从 GitHub 克隆的完整项目目录启动工作台")
        try:
            remote = git(self.root, "remote", "get-url", "origin")
        except RuntimeError:
            raise RuntimeError("当前目录未配置 GitHub 更新源，请使用项目的 GitHub 克隆版本")
        if canonical_remote(remote) != canonical_remote(self.expected_remote):
            raise RuntimeError("当前仓库不是此项目的 GitHub 更新源，未替换任何文件")
        if git(self.root, "branch", "--show-current") != "main":
            raise RuntimeError("当前不在 main 发布分支，请先切回 main 后再更新")
        if git(self.root, "diff", "--cached", "--name-only"):
            raise RuntimeError("本地有已暂存的修改，请先提交或取消暂存后再更新")
        dirty = set(filter(None, git(self.root, "diff", "--name-only", "-z").split("\x00")))
        allowed = set(DATA_FILES)
        if SOURCE_SCRIPT in dirty and settings_only_change(self.root):
            allowed.add(SOURCE_SCRIPT)
        if dirty - allowed:
            raise RuntimeError("本地程序有未提交修改，已保留；请先处理这些文件再更新：" + "、".join(sorted(dirty - allowed)[:4]))
        return dirty

    def prepare(self, target, saved, folder):
        archive = git(self.root, "archive", "--format=zip", target, binary=True)
        with zipfile.ZipFile(io.BytesIO(archive)) as book:
            for info in book.infolist():
                name = PurePosixPath(info.filename)
                if name.is_absolute() or ".." in name.parts or "\\" in info.filename or stat.S_ISLNK(info.external_attr >> 16):
                    raise RuntimeError("新版文件路径不符合更新要求，未替换当前版本")
                dest = folder.joinpath(*name.parts)
                if info.is_dir():
                    dest.mkdir(parents=True, exist_ok=True)
                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(book.read(info))
        for name in DATA_FILES[:2]:
            if name in saved:
                (folder / name).write_bytes(saved[name])
        options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
        for command in ([sys.executable, "-m", "compileall", "-q", str(folder / "scripts")],
                        [sys.executable, str(folder / "scripts/build_adv_query_workbench.py")]):
            result = subprocess.run(command, cwd=str(folder), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90, **options)
            if result.returncode:
                raise RuntimeError("新版预检未通过，已保留当前版本、物料数据和配置")
        return (folder / DATA_FILES[2]).read_bytes()

    def rollback(self, before, originals):
        try:
            # 只清理本次已备份的数据产物，让 Git 能快进回滚；其他人的代码修改仍受 --merge 保护。
            current = git(self.root, "rev-parse", "HEAD")
            for name in DATA_FILES:
                if name in originals:
                    self.restore_file(name, git(self.root, "show", current + ":" + name, binary=True))
            git(self.root, "update-index", "--refresh")
            git(self.root, "reset", "--merge", before)
        finally:
            for name, data in originals.items():
                self.restore_file(name, data)

    def rollback_restart(self):
        state = self.status()
        backup = Path(state["backup"])
        meta = json.loads((backup / "version.json").read_text(encoding="utf-8"))
        originals = {name: (backup / name).read_bytes() for name in meta["paths"]}
        self.rollback(meta["from"], originals)

    def update_code(self):
        dirty = self.check_repository()
        before = git(self.root, "rev-parse", "HEAD")
        git(self.root, "fetch", "--no-tags", "origin", "main", timeout=90)
        target = git(self.root, "rev-parse", "FETCH_HEAD")
        if target == before:
            self.write_status("latest", "已是最新版本（" + before[:8] + "）", version=before, updated=False)
            return False
        try:
            git(self.root, "merge-base", "--is-ancestor", before, target)
        except RuntimeError:
            raise RuntimeError("本地版本与发布分支存在分叉或本地提交，未覆盖本地内容")
        self.write_status("preparing", "发现新版，正在备份配置与物料数据并预检…", version=before, targetVersion=target)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + before[:8] + "-" + uuid.uuid4().hex[:6]
        backup = self.directory / "backups" / stamp
        backup.mkdir(parents=True, exist_ok=False)
        saved = {name: (self.root / name).read_bytes() for name in DATA_FILES if (self.root / name).is_file()}
        original = {name: (self.root / name).read_bytes() for name in dirty}
        for name, data in {**saved, **original}.items():
            path = backup / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        for name in ("user-config.json", "user-config.previous.json", "source-settings.json", "source-settings.previous.json"):
            path = config_directory() / name
            if path.is_file():
                shutil.copy2(path, backup / name)
        atomic_json(backup / "version.json", {"from": before, "to": target, "at": time.time(), "paths": list({**saved, **original})})
        with tempfile.TemporaryDirectory(prefix="mdm-update-") as temp:
            folder = Path(temp)
            html = self.prepare(target, saved, folder)
            for name, data in saved.items():
                if (self.root / name).read_bytes() != data:
                    raise RuntimeError("物料数据正在变化，已取消本次更新，请稍后重试")
            self.write_status("updating", "正在更新程序，保留共享路径、个人配置和已导入数据…", backup=str(backup))
            applied = False
            try:
                for name in dirty:
                    self.restore_file(name, git(self.root, "show", "HEAD:" + name, binary=True))
                # --ff-only 不合并、不改写提交；禁用更新阶段的 Git hooks。
                git(self.root, "-c", "core.hooksPath=" + str(folder / "no-hooks"), "merge", "--ff-only", "--no-overwrite-ignore", target)
                applied = True
                for name in DATA_FILES[:2]:
                    if name in saved:
                        self.restore_file(name, saved[name])
                self.restore_file(DATA_FILES[2], html)
            except Exception:
                if applied:
                    self.rollback(before, {**saved, **original})
                else:
                    for name, data in {**saved, **original}.items():
                        self.restore_file(name, data)
                raise
        self.write_status("restarting", "代码更新完成，正在重新连接服务…", updated=True, version=target, previousVersion=before)
        return True

    def restart_service(self, job):
        base = "http://127.0.0.1:%d" % job["port"]
        response = local_json(base + "/api/app-update/restart", {"jobId": job["id"]})
        if not response.get("ok"):
            raise RuntimeError("服务未接受重启请求，请重新启动工作台")
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                info = local_json(base + "/api/health", timeout=.4)
                if info.get("pid") != job["pid"]:
                    break
            except (OSError, ValueError):
                break
            time.sleep(.15)
        else:
            raise RuntimeError("旧服务尚未退出，未停止其他进程，请重新启动工作台")
        # 复用现有跨平台启动器，继续使用当前 Python、端口与配置目录。
        from launch_workbench import ensure_server
        info, _ = ensure_server(job["port"])
        if info.get("service") != job["service"] or info.get("version") != self.status().get("targetVersion"):
            raise RuntimeError("新版服务尚未就绪，请通过启动工作台重新连接；数据和备份均已保留")
        self.write_status("updated", "已更新到 " + info["version"][:8] + "，正在刷新页面…", version=info["version"], updated=True)


def run_worker(path):
    job = json.loads(Path(path).read_text(encoding="utf-8"))
    updater = AppUpdater(job["root"], job["directory"], job["expectedRemote"])
    try:
        if updater.update_code():
            updater.restart_service(job)
    except Exception as error:
        message = str(error)
        if updater.status().get("phase") == "restarting" and updater.status().get("updated"):
            try:
                updater.rollback_restart()
                from launch_workbench import ensure_server
                ensure_server(job["port"])
                message = "更新未完成，已恢复旧版；配置与物料数据已保留：" + message
            except Exception as recovery_error:
                message += "；备份已保留，请重新启动工作台：" + str(recovery_error)
        updater.write_status("error", message)
    finally:
        try:
            updater.lock_path.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", type=Path, required=True)
    run_worker(parser.parse_args().worker)
