"""本机数据源设置位于项目之外；环境与旧代码设置只作为首次迁移来源。"""
import json
import os
from pathlib import Path
import tempfile
import threading
from urllib.parse import unquote, urlparse
from workbench_config import config_directory

_LOCK = threading.RLock()
ENV_KEYS = {"MDM_SHARE_UNC": "shareUnc", "MDM_SHARE_SMB": "shareSmb", "MDM_SOURCE_XLSX": "sourcePath"}


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, name = tempfile.mkstemp(prefix=".settings-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, str(path))
    finally:
        if os.path.exists(name):
            os.unlink(name)


def dotenv_values(root):
    """只读取白名单键的字面值，不执行 shell，不扩展变量或反斜线。"""
    path = Path(root) / ".env"
    result = {}
    if not path.is_file():
        return result
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, sep, value = line.partition("=")
        key = key.strip()
        if not sep or key not in set(ENV_KEYS) | {"MDM_SHARE_DIRS"}:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        result[key] = value
    return result


def validate(settings):
    if not isinstance(settings, dict) or settings.get("version") != 1:
        raise ValueError("数据源配置版本或格式不正确，原配置已保留")
    for key in ("sharePath", "shareUnc", "shareSmb", "sourcePath"):
        value = settings.get(key, "")
        if not isinstance(value, str) or len(value) > 4096 or "\x00" in value or "\n" in value or "\r" in value:
            raise ValueError("数据源路径必须为有效文本")
    for key in ("sharePath", "shareSmb", "sourcePath"):
        value = settings.get(key, "")
        if value.lower().startswith("smb://"):
            parsed = urlparse(value)
            if not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("SMB 地址不能包含账号或密码，请通过系统登录共享盘")
    dirs = settings.get("shareDirs", [])
    if not isinstance(dirs, list) or len(dirs) > 32 or any(not isinstance(v, str) or len(v) > 4096 or "\x00" in v for v in dirs):
        raise ValueError("共享目录配置格式不正确")
    return settings


class SourceSettingsStore:
    def __init__(self, root, directory=None):
        self.root = Path(root)
        self.directory = Path(directory) if directory is not None else config_directory()
        self.path = self.directory / "source-settings.json"
        self.previous = self.directory / "source-settings.previous.json"

    def resolve(self, defaults=None, persist=False):
        result = {"version": 1, "sharePath": "", "shareUnc": "", "shareSmb": "", "shareDirs": [], "sourcePath": ""}
        result.update(defaults or {})
        env = dotenv_values(self.root)
        env.update({k: os.environ[k] for k in set(ENV_KEYS) | {"MDM_SHARE_DIRS"} if k in os.environ})
        for key, target in ENV_KEYS.items():
            if key in env and (target != "sourcePath" or env[key]):
                result[target] = env[key]
        if "MDM_SHARE_DIRS" in env:
            result["shareDirs"] = [v for v in env["MDM_SHARE_DIRS"].split(os.pathsep) if v]
        with _LOCK:
            if self.path.exists():
                try:
                    stored = validate(json.loads(self.path.read_text(encoding="utf-8")))
                except (ValueError, OSError):
                    if not self.previous.exists():
                        raise ValueError("数据源配置无法读取，原文件已保留，请从 source-settings.json 备份恢复")
                    stored = validate(json.loads(self.previous.read_text(encoding="utf-8")))
                result.update(stored)
            validate(result)
            # 不把默认空值写入磁盘；配置一旦存在，代码、.env 或重新克隆项目都不能重置它。
            if persist and not self.path.exists() and any(result.get(k) for k in ("sharePath", "shareUnc", "shareSmb", "shareDirs", "sourcePath")):
                atomic_json(self.path, result)
        return result

    def save_shared_path(self, value, defaults=None):
        if not isinstance(value, str):
            raise ValueError("请填写共享目录路径")
        value = value.strip()
        with _LOCK:
            result = self.resolve(defaults)
            result.update(sharePath=value, shareUnc="", shareSmb="", shareDirs=[])
            if value.lower().startswith("smb://"):
                parsed = urlparse(value)
                if not parsed.hostname or parsed.username or parsed.password:
                    raise ValueError("SMB 地址不能包含账号或密码，请通过系统登录共享盘")
                result["shareSmb"] = value
                result["shareUnc"] = "\\\\" + parsed.netloc + unquote(parsed.path).replace("/", "\\")
            elif value.startswith(("\\\\", "//")):
                parts = value.lstrip("\\/").replace("\\", "/")
                result["shareUnc"] = "\\\\" + parts.replace("/", "\\")
                result["shareSmb"] = "smb://" + parts
            elif value:
                result["shareDirs"] = [value]
            validate(result)
            if self.path.exists():
                # 仅备份有效旧配置；损坏文件保留在原处，避免静默覆盖。
                old = validate(json.loads(self.path.read_text(encoding="utf-8")))
                atomic_json(self.previous, old)
            atomic_json(self.path, result)
        return result


def builder_settings(root, source, unc, smb, mounts):
    return SourceSettingsStore(root).resolve({"sourcePath": str(source), "shareUnc": unc,
                                            "shareSmb": smb, "shareDirs": [str(p) for p in mounts]})
