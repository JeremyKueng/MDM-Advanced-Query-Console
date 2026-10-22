"""个人配置独立于代码和数据快照保存，采用原子写入并保留上一份有效配置。"""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import tempfile
import threading

MAX_BYTES = 2 * 1024 * 1024
FORMAT = "mdm-workbench-config"


def validate_conditions(items, depth=0, budget=None):
    if budget is None:
        budget = [0]
    if not isinstance(items, list) or depth > 8:
        raise ValueError("条件组格式不正确或嵌套过深")
    for node in items:
        budget[0] += 1
        if budget[0] > 200 or not isinstance(node, dict):
            raise ValueError("条件配置格式不正确或数量过多")
        if node.get("type") == "group":
            if node.get("logic") not in ("AND", "OR"):
                raise ValueError("条件组必须选择 AND 或 OR")
            validate_conditions(node.get("conditions"), depth + 1, budget)
        elif node.get("type") not in (None, "condition") or not isinstance(node.get("field"), str) or not isinstance(node.get("op"), str):
            raise ValueError("条件配置格式不正确")


def config_directory():
    override = os.environ.get("MDM_WORKBENCH_CONFIG_DIR")
    if override:
        return Path(override).expanduser()
    base = Path(os.environ["APPDATA"]) if os.name == "nt" and os.environ.get("APPDATA") else Path.home() / ".config"
    return base / "mdm-advanced-query-console"


def validate_document(value):
    if not isinstance(value, dict) or value.get("type") != FORMAT:
        raise ValueError("不是有效的工作台个人配置文件")
    if value.get("schemaVersion") != 1:
        raise ValueError("配置文件版本不支持，请保留原文件并使用匹配版本的工作台")
    settings = value.get("settings")
    if not isinstance(settings, dict) or type(settings.get("v")) is not int or not 1 <= settings["v"] <= 7:
        raise ValueError("个人配置内容或版本不支持")

    def string_list(obj, key):
        if key in obj and (not isinstance(obj[key], list) or any(not isinstance(x, str) for x in obj[key])):
            raise ValueError("配置中的 %s 必须为文本列表" % key)

    for key in ("order", "visible", "basket", "expandedMore", "viewShortcuts"):
        string_list(settings, key)
    if isinstance(settings.get("filters"), dict) and "customConditions" in settings["filters"]:
        validate_conditions(settings["filters"]["customConditions"])
    if "filters" in settings:
        if not isinstance(settings["filters"], dict):
            raise ValueError("配置中的筛选条件必须为对象")
        for key in ("mfg", "formula", "cats", "stocks", "brands"):
            string_list(settings["filters"], key)
    for key in ("savedViews", "dpTemplates"):
        if key in settings and (not isinstance(settings[key], list) or any(not isinstance(x, dict) for x in settings[key])):
            raise ValueError("配置中的 %s 必须为对象列表" % key)
    identifiers = set()
    for view in settings.get("savedViews", []):
        if not isinstance(view.get("id"), str) or not view["id"] or not isinstance(view.get("name"), str) or not view["name"].strip():
            raise ValueError("自定义视图缺少名称或标识")
        if view["id"] in identifiers:
            raise ValueError("自定义视图标识重复")
        identifiers.add(view["id"])
        if "visible" not in view:
            raise ValueError("自定义视图缺少字段配置")
        string_list(view, "visible")
        string_list(view, "order")
    if "queryViews" in settings and not isinstance(settings["queryViews"], list):
        raise ValueError("我的查询必须为列表")
    query_ids = set()
    for view in settings.get("queryViews", []):
        if not isinstance(view, dict) or not isinstance(view.get("id"), str) or not view["id"] or view["id"] in query_ids or not isinstance(view.get("name"), str) or not view["name"].strip():
            raise ValueError("我的查询名称或标识无效")
        query_ids.add(view["id"])
        context = view.get("context")
        if not isinstance(context, dict) or not isinstance(context.get("q"), str) or context.get("qMode") not in ("smart", "exact", "batch") or not isinstance(context.get("qField"), str):
            raise ValueError("我的查询搜索配置无效")
        for key in ("visible", "order"):
            if key not in context:
                raise ValueError("我的查询缺少字段配置")
            string_list(context, key)
        sort = context.get("sort")
        if not isinstance(sort, dict) or not isinstance(sort.get("key"), str) or type(sort.get("dir")) is not int or sort["dir"] not in (-1, 1) or context.get("view") not in ("table", "card"):
            raise ValueError("我的查询展示配置无效")
        filters = context.get("filters")
        if not isinstance(filters, dict):
            raise ValueError("我的查询筛选配置无效")
        for key in ("mfg", "formula", "cats", "stocks", "brands"):
            if key not in filters:
                raise ValueError("我的查询缺少分类筛选")
            string_list(filters, key)
        for key in ("status", "pre", "scope", "onlyFieldIssue", "onlyPdfRule"):
            if not isinstance(filters.get(key), str):
                raise ValueError("我的查询状态筛选无效")
        for key in ("onlyBlock", "onlyIssue", "onlyVconf", "onlyBasket", "onlyPdf"):
            if type(filters.get(key)) is not bool:
                raise ValueError("我的查询质量筛选无效")
        conditions = filters.get("customConditions")
        if filters.get("customLogic") not in ("AND", "OR"):
            raise ValueError("我的查询自定义条件无效")
        validate_conditions(conditions)
    for template in settings.get("dpTemplates", []):
        if not isinstance(template.get("id"), str) or not isinstance(template.get("name"), str) or not isinstance(template.get("blocks"), list):
            raise ValueError("详情模板格式不正确")
        for block in template["blocks"]:
            if not isinstance(block, dict):
                raise ValueError("详情模板区块必须为对象")
            string_list(block, "fields")
    if "quickDetailView" in settings:
        view = settings["quickDetailView"]
        if not isinstance(view, dict) or type(view.get("version")) is not int or view["version"] != 1 or type(view.get("columns")) is not int or view["columns"] not in (2, 3) or not isinstance(view.get("sections"), list) or not 1 <= len(view["sections"]) <= 20:
            raise ValueError("速览配置格式不正确")
        for key in ("hideEmpty", "showDescription", "showAnalysis", "showAllFields"):
            if type(view.get(key)) is not bool:
                raise ValueError("速览显示选项格式不正确")
        section_ids = set()
        for section in view["sections"]:
            if not isinstance(section, dict) or not isinstance(section.get("id"), str) or not section["id"] or section["id"] in section_ids or not isinstance(section.get("title"), str) or not section["title"].strip() or len(section["title"]) > 60 or type(section.get("enabled")) is not bool or not isinstance(section.get("fields"), list):
                raise ValueError("速览分区格式不正确")
            section_ids.add(section["id"])
            string_list(section, "fields")
    if settings.get("processRules") is not None:
        from process_rules import validate
        validate(settings["processRules"])
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
    if len(raw) > MAX_BYTES:
        raise ValueError("配置文件超过 2 MB；配置文件只保存设置，不包含物料明细")
    return value


class ConfigStore:
    def __init__(self, directory=None):
        self.directory = Path(directory) if directory is not None else config_directory()
        self.path = self.directory / "user-config.json"
        self.previous = self.directory / "user-config.previous.json"
        self.lock = threading.RLock()

    def _read(self, path):
        if path.stat().st_size > MAX_BYTES:
            raise ValueError("配置文件过大")
        return validate_document(json.loads(path.read_text(encoding="utf-8")))

    def read(self):
        with self.lock:
            result = {"ok": True, "exists": False, "configPath": str(self.path)}
            if not self.path.exists():
                return result
            try:
                result.update(exists=True, config=self._read(self.path), recovered=False)
            except (ValueError, OSError):
                if not self.previous.exists():
                    raise ValueError("个人配置文件无法读取，原文件已保留，请从导出的配置文件恢复")
                result.update(exists=True, config=self._read(self.previous), recovered=True)
            return result

    def _atomic_write(self, path, raw):
        fd, name = tempfile.mkstemp(prefix=".config-", suffix=".tmp", dir=str(self.directory))
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(name, str(path))
        finally:
            if os.path.exists(name):
                os.unlink(name)

    def save(self, document):
        validate_document(document)
        with self.lock:
            self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            previous = None
            if self.path.exists():
                try:
                    previous = self._read(self.path)
                except (ValueError, OSError):
                    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
                    self._atomic_write(self.directory / ("user-config.damaged-" + stamp + ".json"), self.path.read_bytes())
            # 旧标签页缺少新配置字段时，保存其他偏好不能抹掉已存规则与速览布局。
            for key in ("processRules", "quickDetailView"):
                if previous and key not in document["settings"] and key in previous["settings"]:
                    document = {**document, "settings": {**document["settings"], key: previous["settings"][key]}}
            validate_document(document)
            raw = json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
            if len(raw) > MAX_BYTES:
                raise ValueError("配置文件超过 2 MB")
            if previous:
                self._atomic_write(self.previous, self.path.read_bytes())
            self._atomic_write(self.path, raw)
            return {"ok": True, "configPath": str(self.path), "savedAt": document.get("savedAt", "")}
