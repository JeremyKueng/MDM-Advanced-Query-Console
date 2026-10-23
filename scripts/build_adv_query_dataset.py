"""构建当前工作台数据集；支持本地 Excel 与自行配置的共享目录。默认使用虚构演示数据。"""
from __future__ import annotations

import argparse
import gzip
import base64
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import openpyxl

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import build_mdm_snapshot as bms  # noqa: E402  复用既有口径实现
import process_rules as pr
DEFAULT_PROCESS_RUN = pr.compile_config(pr.validate(pr.defaults()))
import mps_route_engine as mre    # noqa: E402  MPS 工艺路线实时重算引擎

ROOT = SCRIPTS.parent
SOURCE_XLSX = Path(os.environ.get("MDM_SOURCE_XLSX") or str(ROOT / "examples/materials-demo.xlsx"))
SHARE_UNC = os.environ.get("MDM_SHARE_UNC", "")
SHARE_SMB = os.environ.get("MDM_SHARE_SMB", "")
SHARE_MOUNT_DIRS = [Path(p).expanduser() for p in os.environ.get("MDM_SHARE_DIRS", "").split(os.pathsep) if p]
SHARE_CANDIDATES = [*SHARE_MOUNT_DIRS, ROOT / "data/private"]
# 本机设置优先于代码默认值，支持自动读取 .env 与旧设置迁移。
from source_settings import builder_settings, SourceSettingsStore
_SOURCE_PREFS = builder_settings(ROOT, SOURCE_XLSX, SHARE_UNC, SHARE_SMB, SHARE_MOUNT_DIRS)
SOURCE_XLSX = Path(_SOURCE_PREFS["sourcePath"] or str(SOURCE_XLSX))
SHARE_UNC, SHARE_SMB = _SOURCE_PREFS["shareUnc"], _SOURCE_PREFS["shareSmb"]
SHARE_MOUNT_DIRS = [Path(p).expanduser() for p in _SOURCE_PREFS["shareDirs"]]
SHARE_CANDIDATES = list(SHARE_MOUNT_DIRS) if SourceSettingsStore(ROOT).path.exists() else [*SHARE_MOUNT_DIRS, *[p for p in SHARE_CANDIDATES if p not in SHARE_MOUNT_DIRS]]
OUT_DIR = ROOT / "outputs/advq"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 品类三级 → 规则品类（与路线测试的四品类模板对齐；仅收录路线数据已确认的归属，
# 未确认的品类三级归「其他」，不做关键字段完整率分析，避免误判缺失）
RULE_CAT_MAP = {
    "面巾": "面巾", "软抽": "面巾", "乳霜软抽": "面巾", "悬挂式软抽": "面巾",
    "抽取多用纸抹布": "面巾", "悬挂式多用纸抹布": "面巾",
    "公用擦手纸": "面巾", "悬挂式公用擦手纸": "面巾",
    "有芯卫生卷纸": "卫卷", "无芯卫生卷纸": "卫卷", "公用卫生纸": "卫卷",
    "卷装多用纸抹布": "卫卷", "卷装擦手纸": "卫卷",
    "纸巾": "纸巾", "纸巾便携式": "纸巾",
    "餐巾": "餐巾",
}

# 明显错值检查的数值字段（与主工具口径一致：仅这 4 个；值为空或"无"时跳过；仅 ≤0 报警）
NUMERIC_CHECK_FIELDS = ["净重", "成品定量", "层数", "原始装数"]

# 『物料属性查询报表-成品（含工艺）.xlsx』全部 123 个原生表头字段（排除已在 SCHEMA 核心列定义过短名的 34 列，其余 89 列全量纳入并按业务分组）
# 这样报表表头的 123 列 100% 完整进入工作台（34 个核心短名映射列 + 89 个原名列 = 123 个报表表头列 + 15 个计算/质量/MPS衍生列）
REPORT_123_HEADERS: list[tuple[str, str]] = [
    # 1. 标识与审批（8项 + 核心列中已有 物料编码/V码/物料说明/物料状态/预失效/创建时间/最后更新时间 7项 = 15项）
    ("物料说明（繁体）", "标识"),
    ("物料说明（英文）", "标识"),
    ("产品描述", "标识"),
    ("版本描述", "标识"),
    ("产品来源", "标识"),
    ("保质期", "标识"),
    ("申请人", "标识"),
    ("部门", "标识"),
    # 2. 分类与营销属性（17项 + 核心列中已有 配方大类/品类三级/库存小类/物料库存类别/主单位/品牌/产品系列/新品类型/加赠位置/成品类型/是否电商/是否组合装 12项 = 29项）
    ("制造类别", "分类"),
    ("品类一级", "分类"),
    ("品类二级", "分类"),
    ("品类四级", "分类"),
    ("物料销售类别", "分类"),
    ("物料中类", "分类"),
    ("中类说明", "分类"),
    ("产品系列号", "分类"),
    ("是否OEM", "分类"),
    ("销售小类（市场部）", "分类"),
    ("IP", "分类"),
    ("产品质量标准", "分类"),
    ("是否超标准", "分类"),
    ("是否短期", "分类"),
    ("是否赠品", "分类"),
    ("赠品类型", "分类"),
    ("单/多片装", "分类"),
    # 3. 五级架构（5项）
    ("品类（五级架构）", "五级架构"),
    ("品牌（五级架构）", "五级架构"),
    ("销售大类（五级架构）", "五级架构"),
    ("销售小类（五级架构）", "五级架构"),
    ("产品系列（五级架构）", "五级架构"),
    # 4. 工艺属性（29项 + 核心列中已有 含液量/成品定量 2项 = 31项）
    ("配方", "工艺"),
    ("关键工艺", "工艺"),
    ("层数", "工艺"),
    ("加香/香型", "工艺"),
    ("香水添加量（g/包）", "工艺"),
    ("压线/压花", "工艺"),
    ("粗压花", "工艺"),
    ("纸页颜色", "工艺"),
    ("是否上胶", "工艺"),
    ("是否悬挂式", "工艺"),
    ("小卷形状", "工艺"),
    ("码数", "工艺"),
    ("节距", "工艺"),
    ("卷高", "工艺"),
    ("节数", "工艺"),
    ("米数", "工艺"),
    ("净含量", "工艺"),
    ("毛重/卷", "工艺"),
    ("卷径", "工艺"),
    ("筒芯", "工艺"),
    ("纸长", "工艺"),
    ("纸宽", "工艺"),
    ("抽(张)/包(盒)", "工艺"),
    ("张/片数", "工艺"),
    ("标准/迷你", "工艺"),
    ("折数", "工艺"),
    ("折叠规格", "工艺"),
    ("小包长度", "工艺"),
    ("小包宽度", "工艺"),
    ("单包高度", "工艺"),
    # 5. 规格、重量与报关（6项 + 核心列中已有 物料规格/原始装数/净重/不含赠品净重/毛重/不含液成品净重（kg）/小卷/包净重(g)/小卷/包毛重(g)/pian数量 9项 = 15项）
    ("重量单位", "规格"),
    ("体积", "规格"),
    ("体积单位", "规格"),
    ("折算系数", "规格"),
    ("报关毛重", "规格"),
    ("报关净重", "规格"),
    ("报关规格", "规格"),
    # 6. 包装与外箱尺寸（20项）
    ("纸盒尺寸", "包装"),
    ("中包包装方式", "包装"),
    ("单提长", "包装"),
    ("单提宽", "包装"),
    ("单提高", "包装"),
    ("中包毛重(g)", "包装"),
    ("装箱方式", "包装"),
    ("长(外包装)", "包装"),
    ("宽(外包装)", "包装"),
    ("高(外包装)", "包装"),
    ("包装一单位", "包装"),
    ("包装一数量", "包装"),
    ("包装二单位", "包装"),
    ("包装二数量", "包装"),
    ("包装规格单位1", "包装"),
    ("包装规格数量1", "包装"),
    ("包装规格单位2", "包装"),
    ("包装规格数量2", "包装"),
    ("包装规格单位3", "包装"),
    ("包装规格数量3", "包装"),
    ("包装规格单位4", "包装"),
    ("包装规格数量4", "包装"),
    # 7. 条码信息（4项）
    ("小包/袋/盒产品条码", "条码"),
    ("手抽/中袋条形码", "条码"),
    ("外包装条形码（选择组织）", "条码"),
    ("基准条码", "条码"),
]
MDM_FIELDS = [f for f, _ in REPORT_123_HEADERS]
MDM_FIELD_GROUPS = {f: g for f, g in REPORT_123_HEADERS}

# 行模式：(key, label, group, type, excel_col)
# type: text/number/date/enum/bool/flags；excel_col 为 None 表示计算得出
SCHEMA: list[tuple[str, str, str, str, str | None]] = [
    ("material", "物料编码", "标识", "text", "物料编码"),
    ("vcode", "V码", "标识", "text", "V码"),
    ("desc", "物料说明", "标识", "text", "物料说明"),
    ("status", "物料状态", "标识", "enum", "物料状态"),
    ("pre", "预失效", "标识", "enum", "预失效"),
    ("formula", "配方大类", "分类", "enum", "配方大类"),
    ("cat", "品类三级", "分类", "enum", "品类三级"),
    ("ruleCat", "规则品类", "分类", "enum", None),
    ("stock", "库存小类", "分类", "text", "库存小类"),
    ("stockCat", "物料库存类别", "分类", "text", "物料库存类别"),
    ("unit", "主单位", "分类", "enum", "主单位"),
    ("brand", "品牌", "分类", "text", "品牌"),
    ("series", "产品系列", "分类", "text", "产品系列"),
    ("npt", "新品类型", "分类", "enum", "新品类型"),
    ("gift", "加赠位置", "分类", "text", "加赠位置"),
    ("prodType", "成品类型", "分类", "text", "成品类型"),
    ("ecom", "是否电商", "分类", "enum", "是否电商"),
    ("isCombo", "是否组合装", "分类", "enum", "是否组合装"),
    ("liquid", "含液量", "工艺", "text", "含液量"),
    ("spec", "物料规格", "规格", "text", "物料规格"),
    ("specC", "规格标准化", "规格", "text", None),
    ("specP", "规格乘积", "规格", "number", None),
    ("load", "原始装数", "规格", "number", "原始装数"),
    ("net", "净重(kg)", "规格", "number", "净重"),
    ("netNG", "不含赠品净重(kg)", "规格", "number", "不含赠品净重"),
    ("gross", "毛重(kg)", "规格", "number", "毛重"),
    ("wetNet", "不含液成品净重(kg)", "规格", "number", "不含液成品净重（kg）"),
    ("rollNet", "小卷/包净重(g)", "规格", "number", "小卷/包净重(g)"),
    ("rollGross", "小卷/包毛重(g)", "规格", "number", "小卷/包毛重(g)"),
    ("quant", "成品定量", "规格", "number", "成品定量"),
    ("pian", "pian数量", "规格", "number", "pian数量"),
    ("created", "创建时间", "标识", "date", "创建时间"),
    ("updated", "最后更新", "标识", "date", "最后更新时间"),
    ("pack", "包装层级", "包装", "text", None),
    ("route", "工艺路线", "工艺", "text", None),
    ("routeStatus", "路线状态", "工艺", "enum", None),
    ("routeMissing", "路线缺失字段", "工艺", "text", None),
    ("routeNodes", "路线节点(完整/总数)", "工艺", "text", None),
    ("vconf", "同V码冲突", "质量", "bool", None),
    ("score", "字段完整度", "质量", "number", None),
    ("issueCount", "异常数", "质量", "number", None),
    ("blocking", "是否阻断", "质量", "bool", None),
    ("pdfCount", "工艺属性检查问题数", "质量", "number", None),
    ("pdfBlock", "工艺属性阻断数", "质量", "number", None),
    ("flags", "问题明细", "质量", "flags", None),
]
CORE_LEN = len(SCHEMA)
DEFAULT_VISIBLE = [
    "material", "vcode", "spec", "desc", "status", "cat", "load",
    "score", "issueCount", "blocking", "flags", "pack", "pre",
]
VIEW_PRESETS = {
    # 基础识别 → 分类定位 → 关键工艺 → 重量核对 → 箱规；保留原始制造类别。
    "核心视图": [
        "material", "vcode", "spec", "desc", "status", "brand", "unit",
        "formula", "制造类别", "cat", "stock",
        "压线/压花", "层数", "折数", "纸长", "纸宽", "纸盒尺寸",
        "中包包装方式", "小卷形状", "标准/迷你", "张/片数", "码数", "series", "单/多片装", "是否悬挂式",
        "单包高度", "quant", "rollNet",
        "load", "pack", "装箱方式", "长(外包装)", "宽(外包装)", "高(外包装)", "created",
    ],
    "质量视图": ["material", "vcode", "spec", "desc", "cat", "score", "issueCount", "blocking", "flags", "vconf", "pdfCount", "pdfBlock"],
    "包装视图": ["material", "vcode", "spec", "desc", "cat", "pack", "unit", "纸盒尺寸", "中包包装方式", "单提长", "单提宽", "单提高", "长(外包装)", "宽(外包装)", "高(外包装)", "装箱方式"],
    "工艺视图": ["material", "vcode", "spec", "desc", "cat", "制造类别", "配方", "关键工艺", "层数", "压线/压花", "粗压花", "加香/香型", "纸长", "纸宽", "抽(张)/包(盒)", "张/片数"],
    "工艺属性检查": ["material", "vcode", "spec", "desc", "cat", "stockCat", "prodType", "net", "netNG", "gross", "wetNet", "pdfCount", "pdfBlock", "flags"],
    "123列全表头": [
        "material", "vcode", "spec", "desc", "物料说明（繁体）", "物料说明（英文）", "status",
        "stockCat", "stock", "制造类别", "物料销售类别", "物料中类", "中类说明",
        "品类一级", "品类二级", "cat", "品类四级", "brand", "series", "产品系列号",
        "unit", "包装一单位", "包装一数量", "包装二单位", "包装二数量",
        "net", "gross", "重量单位", "体积", "体积单位", "长(外包装)", "宽(外包装)", "高(外包装)",
        "load", "折算系数", "小包/袋/盒产品条码", "手抽/中袋条形码", "外包装条形码（选择组织）", "基准条码",
        "netNG", "quant", "层数", "加香/香型", "压线/压花", "节距", "卷高", "节数", "米数", "净含量", "毛重/卷",
        "纸长", "纸宽", "抽(张)/包(盒)", "张/片数", "卷径", "单包高度", "筒芯", "纸盒尺寸", "标准/迷你", "折数", "折叠规格",
        "单提长", "单提宽", "单提高", "配方",
        "包装规格单位1", "包装规格数量1", "包装规格单位2", "包装规格数量2", "包装规格单位3", "包装规格数量3", "包装规格单位4", "包装规格数量4",
        "是否OEM", "ecom", "isCombo", "产品来源", "报关毛重", "报关净重", "报关规格",
        "created", "updated", "prodType", "申请人", "部门",
        "品类（五级架构）", "品牌（五级架构）", "销售大类（五级架构）", "销售小类（五级架构）", "产品系列（五级架构）",
        "单/多片装", "中包毛重(g)", "小包宽度", "小包长度", "香水添加量（g/包）", "wetNet", "rollNet", "rollGross", "pian", "pre",
        "中包包装方式", "纸页颜色", "是否上胶", "是否悬挂式", "formula", "关键工艺", "粗压花", "保质期", "IP", "装箱方式",
        "小卷形状", "产品质量标准", "码数", "liquid", "销售小类（市场部）", "产品描述", "npt", "版本描述",
        "是否超标准", "是否短期", "是否赠品", "gift", "赠品类型",
    ],
}

# ==================== 工艺属性自动检查（示例校验规范） ====================

# PDF 标记 → 报表列名 → schema key（供前端"关联异常"按字段反查）
FLAG_FIELD_TO_KEY = {
    "净重": "net", "毛重": "gross", "不含赠品净重": "netNG", "成品定量": "quant",
    "不含液成品净重": "wetNet", "小卷/包净重": "rollNet", "小卷/包毛重": "rollGross",
}


# 规则声明集中在 process-rules.defaults.json；原函数仅作兼容入口。
def check_pdf_rules(raw: dict, cat3: str, stock_cat: str, spec_p, rule_cat: str, load_v):
    return DEFAULT_PROCESS_RUN({**raw, "$ruleCat": rule_cat, "$specP": spec_p})


PDF_RULES = [{"no": 0, "id": "pdf-scope", "title": "适用范围", "gov": "supplement", "desc": pr.describe(pr.defaults()["scope"])}] + [
    {"no": r["no"], "id": r["id"], "title": r["title"], "desc": r["description"], "gov": "numeric"}
    for r in pr.defaults()["rules"]
]

PDF_FLAG_META = {
    "PFM": {"name": "工艺属性必填缺失", "sev": "low", "gov": "supplement"},
    "PFN": {"name": "工艺属性数值异常", "sev": "high", "gov": "numeric"},
    "PFC": {"name": "工艺属性逻辑矛盾", "sev": "high", "gov": "numeric"},
    "PFI": {"name": "工艺属性规范提示", "sev": "low", "gov": "supplement"},
    "PFP": {"name": "工艺属性一致性待核", "sev": "mid", "gov": "packaging"},
}


def join_packaging(raw: dict) -> str:
    """包装规格单位/数量 1-4 → '包/中包=6 → 中包/箱=50'（与主工具口径一致）。"""
    parts = []
    for level in range(1, 5):
        unit = bms.clean(raw.get(f"包装规格单位{level}"))
        qty = bms.clean(raw.get(f"包装规格数量{level}"))
        if unit is not None or qty is not None:
            parts.append(f"{unit or '?'}={qty if qty is not None else '?'}")
    return " → ".join(parts)


# MDM 列名同义词兼容（兼容「物料属性查询报表-成品（含工艺）.xlsx」与「物料属性查询报表-成品.xlsx」两套导出模板）
COL_ALIASES: dict[str, tuple[str, ...]] = {
    "主单位": ("计量单位",),
    "原始装数": ("装数",),
    "物料规格": ("规格",),
    "成品定量": ("定量", "克重"),
    "抽(张)/包(盒)": ("抽数",),
    "张/片数": ("纸巾张数",),
    "节数": ("节数/卷",),
    "卷径": ("直径",),
    "纸宽": ("宽度（纸巾）",),
    "纸长": ("长度（纸巾）",),
    "最后更新时间": ("最后修改时间",),
    "不含液成品净重（kg）": ("不含液成品净重(kg)",),
    "长(外包装)": ("长（外包装）",),
    "宽(外包装)": ("宽（外包装）",),
    "高(外包装)": ("高（外包装）",),
    "中包毛重(g)": ("中包重量(g)",),
    "手抽/中袋条形码": ("中包/袋产品条码",),
    "基准条码": ("物料条形码（主组织）",),
}


def normalize_raw_record(raw: dict) -> dict:
    """将不同导出模板的同义列名补齐为标准列名，并补充默认物料状态。"""
    for canonical, aliases in COL_ALIASES.items():
        if raw.get(canonical) is None:
            for al in aliases:
                if raw.get(al) is not None:
                    raw[canonical] = raw[al]
                    break
    # 共享盘下的『物料属性查询报表-成品*.xlsx』本身仅导出有效物料，若未单独导出状态列或为空则默认标记为“有效”
    if raw.get("物料状态") is None:
        raw["物料状态"] = "有效"
    return raw


def is_share_path_str(p_str: str) -> bool:
    """判断路径字符串是否属于内网共享盘路径（兼容 Windows UNC / 映射盘符 与 macOS /Volumes 挂载卷）。"""
    s = str(p_str or "").strip()
    if s.startswith("\\\\") or s.startswith("//") or s.startswith("/Volumes/") or s.lower().startswith("smb://"):
        return True
    if "files.example.invalid" in s.lower() or "MDM示例表" in s or "共享资料" in s:
        return True
    return False


def unc_or_smb_to_mac_mounts(raw_path: str) -> tuple[str, list[Path]]:
    """将 Windows UNC 路径（\\\\files.example.invalid\\...）或 smb:// 地址转换为标准 SMB URL、Windows UNC 候选路径与 macOS /Volumes 候选本地路径（Win+Mac 双端兼容）。"""
    s = (raw_path or "").strip()
    if not s:
        return SHARE_SMB, list(SHARE_MOUNT_DIRS)
    if s.startswith("\\\\") or s.startswith("//"):
        clean_p = s.lstrip("\\/").replace("\\", "/")
        smb_url = f"smb://{clean_p}"
    elif s.lower().startswith("smb://"):
        smb_url = s.replace("\\", "/")
        clean_p = unquote(smb_url[6:])
    else:
        return SHARE_SMB, [Path(s).expanduser()]

    parts = [p for p in clean_p.split("/") if p]
    # parts[0] = server (files.example.invalid), parts[1:] = share path segments
    server = parts[0] if parts else "files.example.invalid"
    sub_parts = parts[1:] if len(parts) > 1 else []
    unc_full = "\\\\" + "\\".join([server, *sub_parts]) if sub_parts else f"\\\\{server}"
    mounts: list[Path] = []

    if os.name == "nt":
        # Windows 优先直接访问原生 UNC 路径（\\files.example.invalid\示例组织\共享资料\MDM示例表）
        mounts.append(Path(unc_full))
        if SHARE_UNC and Path(SHARE_UNC) not in mounts:
            mounts.append(Path(SHARE_UNC))
        # 同时扫描 Windows 已映射的网络驱动器盘符（如 Z:\共享资料\MDM示例表 或 Z:\MDM示例表）
        try:
            res = subprocess.run(["net", "use"], capture_output=True, text=True, timeout=3)
            for line in (res.stdout or "").splitlines():
                m_drv = re.search(r"([A-Z]:)\s+\\\\([^\s]+)", line, re.I)
                if m_drv:
                    drv = m_drv.group(1)
                    for idx in range(len(sub_parts)):
                        cand = Path(drv + "\\").joinpath(*sub_parts[idx:])
                        if cand not in mounts:
                            mounts.append(cand)
                    if Path(drv + "\\") not in mounts:
                        mounts.append(Path(drv + "\\"))
        except Exception:
            pass

    # macOS Finder 挂载深层 SMB 路径时，通常以最后一级目录名（如 /Volumes/MDM示例表）或任意上级共享名作为挂载点
    for i in range(len(sub_parts)):
        mount_root = Path("/Volumes") / sub_parts[i]
        tail = sub_parts[i + 1:]
        cand = mount_root.joinpath(*tail) if tail else mount_root
        if cand not in mounts:
            mounts.append(cand)
    for d in SHARE_MOUNT_DIRS:
        if d not in mounts:
            mounts.append(d)
    return smb_url, mounts


def ensure_smb_mounted(raw_path: str = SHARE_UNC or SHARE_SMB, wait_seconds: float = 4.0) -> Path | None:
    """检测目标 SMB/UNC 共享目录是否可达（Win+Mac 双端适配）：
    - Windows (os.name == 'nt')：直接探测 UNC 路径 \\\\files.example.invalid\\... 或已映射网络盘符，若未建立会话则执行 `net use` 激活域/凭据管理器会话。
    - macOS (sys.platform == 'darwin')：探测 /Volumes 挂载点，若未挂载则自动调用 `open -g smb://...` 触发 Finder 用钥匙串静默挂载。
    """
    if not raw_path:
        return None
    smb_url, mounts = unc_or_smb_to_mac_mounts(raw_path)
    for m in mounts:
        try:
            if m.exists() and m.is_dir():
                return m
        except OSError:
            continue

    if os.name == "nt":
        try:
            parsed = urlparse(smb_url)
            host = parsed.hostname or "files.example.invalid"
            segs = [unquote(seg) for seg in parsed.path.split("/") if seg]
            unc_root = f"\\\\{host}\\{segs[0]}" if segs else f"\\\\{host}"
            unc_target = "\\\\" + "\\".join([host, *segs]) if segs else unc_root
            # 触发 Windows SMB 客户端使用当前域账号或 Windows 凭据管理器连接共享根
            subprocess.run(["cmd", "/c", "net", "use", unc_root], capture_output=True, text=True, timeout=4)
            p_target = Path(unc_target)
            if p_target.exists() and p_target.is_dir():
                return p_target
            for m in mounts:
                try:
                    if m.exists() and m.is_dir():
                        return m
                except OSError:
                    continue
        except Exception:
            pass
    elif sys.platform == "darwin":
        try:
            parsed = urlparse(smb_url)
            encoded_path = "/".join(quote(unquote(seg)) for seg in parsed.path.split("/"))
            encoded_url = f"smb://{parsed.netloc}{encoded_path}"
            subprocess.run(["open", "-g", encoded_url], check=False, timeout=5)
            deadline = time.time() + wait_seconds
            while time.time() < deadline:
                for m in mounts:
                    try:
                        if m.exists() and m.is_dir():
                            return m
                    except OSError:
                        continue
                time.sleep(0.4)
        except Exception:
            pass
    return None


def probe_intranet_share_status(raw_path: str = SHARE_UNC or SHARE_SMB, auto_mount: bool = False) -> dict:
    """全面诊断内网共享路径（\\\\files.example.invalid\\... / smb://...）的 4 层连接状态（Windows + macOS 双端适配）：
    1. 网络层（DNS 解析 + TCP 445 端口连通性与耗时）
    2. 身份验证层（Windows 域/凭据管理器 cmdkey & net use / macOS 钥匙串凭据识别）
    3. 挂载/访问层（Windows 原生 UNC 直连或映射盘符 / macOS /Volumes 挂载点与权限）
    4. 目录内容层（共享目录下的全部文件与锁定『物料属性查询报表-成品（含工艺）』列表）
    """
    raw_path = raw_path or SHARE_UNC or SHARE_SMB
    if not raw_path:
        return {"overall":"not_configured","statusLabel":"未配置共享目录","diagnosis":"可直接导入本地 Excel；如需共享盘，请配置 MDM_SHARE_UNC / MDM_SHARE_SMB。","shareUnc":"","shareSmb":"","network":{},"auth":{},"mount":{},"files":[],"finishedFiles":[],"checkedAt":datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    smb_url, mounts = unc_or_smb_to_mac_mounts(raw_path)
    parsed = urlparse(smb_url)
    host = parsed.hostname or "files.example.invalid"
    port = parsed.port or 445
    platform_type = "win" if os.name == "nt" else ("mac" if sys.platform == "darwin" else "linux")

    # 1. 网络层检测
    ip_addr = ""
    tcp_ok = False
    latency_ms = None
    net_detail = ""
    t0 = time.perf_counter()
    try:
        ip_addr = socket.gethostbyname(host)
        with socket.create_connection((ip_addr, port), timeout=2.5):
            tcp_ok = True
            latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        net_detail = f"内网可达（{host} -> {ip_addr}:{port}，响应 {latency_ms} ms）"
    except Exception as e:
        net_detail = f"网络不可达（无法连接 {host}:{port}，请检查内网/VPN：{e}）"

    # 2. 凭据检测（macOS 钥匙串 / Windows 凭据管理器 & 域登录账号）
    keychain_acct = ""
    if sys.platform == "darwin":
        try:
            res = subprocess.run(
                ["security", "find-internet-password", "-s", host],
                capture_output=True, text=True, timeout=3
            )
            m = re.search(r'"acct"<blob>="([^"]+)"', res.stdout or "")
            if m:
                keychain_acct = m.group(1)
        except Exception:
            pass
    elif os.name == "nt":
        try:
            res = subprocess.run(["cmdkey", "/list"], capture_output=True, text=True, timeout=3)
            out = res.stdout or ""
            if host.lower() in out.lower():
                m_u = re.search(r"(?:User|用户|用户名)\s*[:：]\s*([^\r\n]+)", out, re.I)
                if m_u:
                    keychain_acct = m_u.group(1).strip()
        except Exception:
            pass
        if not keychain_acct:
            dom = os.environ.get("USERDOMAIN") or ""
            usr = os.environ.get("USERNAME") or ""
            if usr:
                keychain_acct = f"{dom}\\{usr}" if dom else usr

    # 3. 挂载/UNC 直连状态与可选自动挂载
    mounted_dir: Path | None = None
    for m in mounts:
        try:
            if m.exists() and m.is_dir():
                mounted_dir = m
                break
        except OSError:
            continue
    if mounted_dir is None and auto_mount and tcp_ok:
        mounted_dir = ensure_smb_mounted(raw_path, wait_seconds=4.5)

    # 检查实际挂载源/SMB 会话信息
    mount_source = ""
    mount_user = keychain_acct
    if sys.platform == "darwin":
        try:
            mres = subprocess.run(["mount"], capture_output=True, text=True, timeout=3)
            for line in (mres.stdout or "").splitlines():
                if host in line or "MDM示例表" in line or "4%20" in line:
                    mount_source = line.split(" on ")[0].strip()
                    um = re.search(r"//([^@]+)@", mount_source)
                    if um:
                        mount_user = um.group(1)
                    break
        except Exception:
            pass
    elif os.name == "nt":
        mount_source = SHARE_UNC
        try:
            nres = subprocess.run(["net", "use"], capture_output=True, text=True, timeout=3)
            for line in (nres.stdout or "").splitlines():
                if host.lower() in line.lower() or "示例组织" in line:
                    mount_source = line.strip()
                    break
        except Exception:
            pass

    # 4. 目录读取与身份验证综合判定
    all_files = []
    finished_files = []
    read_error = ""
    if mounted_dir is not None:
        try:
            for f in sorted(mounted_dir.iterdir(), key=lambda x: x.stat().st_mtime if x.exists() else 0, reverse=True):
                if not f.is_file():
                    continue
                st = f.stat()
                is_lock = f.name.startswith(("~$", ".", ".~"))
                is_xlsx = f.suffix.lower() == ".xlsx" and not is_lock
                has_craft = ("含工艺" in f.name) or ("(含工艺)" in f.name) or ("（含工艺）" in f.name)
                is_finished = is_xlsx and ("物料属性" in f.name) and ("成品" in f.name) and has_craft and ("辅料" not in f.name) and ("原盘纸" not in f.name)
                item = {
                    "name": f.name,
                    "path": str(f),
                    "mtime": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
                    "sizeKB": round(st.st_size / 1024, 1),
                    "sizeMB": round(st.st_size / (1024 * 1024), 2),
                    "isLock": is_lock,
                    "isFinished": is_finished,
                    "hasCraft": has_craft,
                }
                all_files.append(item)
                if is_finished:
                    finished_files.append(item)
        except Exception as e:
            read_error = str(e)

    if not tcp_ok:
        overall = "network_error"
        status_label = "网络未连通（需内网/VPN）"
        auth_ok = False
        auth_detail = "因网络未连通，尚未进入 SMB 身份验证阶段"
        diagnosis = "【网络问题】当前无法连接 files.example.invalid:445，请检查企业内网或 VPN 连接。"
    elif mounted_dir is not None and not read_error:
        overall = "connected"
        status_label = "内网已连接 · 已认证直连" if platform_type == "win" else "内网已连接 · 已认证挂载"
        auth_ok = True
        if platform_type == "win":
            auth_detail = f"Windows 域/工号身份验证通过（当前会话账号 {mount_user or '已授权'}，UNC 路径直连可读）"
            diagnosis = f"【Windows 内网与身份验证均正常】网络层 {ip_addr}:{port} 连通（{latency_ms}ms），UNC 路径 {mounted_dir} 已直连通过，共读取到 {len(all_files)} 个文件（含 {len(finished_files)} 份 123 列含工艺成品报表）。"
        else:
            auth_detail = f"域/工号身份验证通过（账号 {mount_user or '已授权'}；服务端禁止 Guest 匿名访问，Finder 凭钥匙串已正常鉴权）"
            diagnosis = f"【macOS 内网与身份验证均正常】网络层 {ip_addr}:{port} 连通（{latency_ms}ms），身份验证已通过钥匙串账号 {mount_user or '已授权'} 挂载至 {mounted_dir}，共读取到 {len(all_files)} 个文件（含 {len(finished_files)} 份 123 列含工艺成品报表）。"
    else:
        overall = "auth_or_unmounted"
        status_label = "网络已通 · 待认证/连接" if platform_type == "win" else "网络已通 · 待挂载/待认证"
        auth_ok = bool(keychain_acct)
        if platform_type == "win":
            auth_detail = (
                f"内网 445 端口已通，但尚未建立到 {SHARE_UNC} 的认证会话。"
                f"请在 Windows 资源管理器地址栏输入 {SHARE_UNC} 或点击「打开共享目录」完成域账号/工号登录。"
            )
            diagnosis = f"【Windows 身份验证/会话待激活】网络 445 端口正常连通（{latency_ms}ms），请在文件资源管理器打开 {SHARE_UNC} 登录工号后再点击检测。"
        else:
            auth_detail = (
                f"内网 445 端口已通，但 files.example.invalid 拒绝匿名/空凭据连接（返回 Authentication error）。"
                + (f"检测到钥匙串已保存工号 {keychain_acct}，可点击「重新检测 / 一键挂载」通过 Finder 激活挂载。" if keychain_acct else "请在 Finder 按 ⌘+K 输入 smb://files.example.invalid/示例组织/共享资料/MDM示例表 完成工号登录。")
            )
            diagnosis = f"【macOS 身份验证/挂载层待激活】网络 445 端口正常连通（{latency_ms}ms），但共享卷尚未挂载或需通过 Finder 钥匙串完成工号身份验证。"

    return {
        "overall": overall,
        "platform": platform_type,
        "statusLabel": status_label,
        "diagnosis": diagnosis,
        "shareUnc": SHARE_UNC,
        "shareSmb": smb_url,
        "network": {
            "ok": tcp_ok,
            "host": host,
            "ip": ip_addr,
            "port": port,
            "latencyMs": latency_ms,
            "detail": net_detail,
        },
        "auth": {
            "ok": auth_ok,
            "account": mount_user or keychain_acct or "",
            "guestRejected": True,
            "detail": auth_detail,
        },
        "mount": {
            "ok": mounted_dir is not None and not read_error,
            "mountPoint": str(mounted_dir) if mounted_dir else "",
            "mountSource": mount_source,
            "readError": read_error,
        },
        "files": all_files,
        "finishedFiles": finished_files,
        "checkedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def load_excel(path: Path) -> tuple[list[str], list[tuple]]:
    """加载 Excel（若文件位于 macOS /Volumes 网络挂载卷或 Windows \\\\files.example.invalid UNC 网络共享路径，
    均先复制到本地临时文件再读取，避免 openpyxl 在 SMB 网络流上频繁 random seek 导致卡慢或超时）。"""
    read_path = path
    tmp_dir = None
    try:
        if is_share_path_str(str(path)):
            tmp_dir = tempfile.mkdtemp(prefix="mdm_smb_")
            local_copy = Path(tmp_dir) / path.name
            shutil.copy2(path, local_copy)
            read_path = local_copy
        wb = openpyxl.load_workbook(read_path, read_only=True, data_only=True)
        ws = wb[wb.sheetnames[0]]
        ws.reset_dimensions()
        rows = ws.iter_rows(values_only=True)
        headers = bms.locate_header_row(rows)
        data = [r for r in rows if any(v is not None and str(v).strip() for v in r)]
        wb.close()
        return headers, data
    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)


def detect_field_types(rows: list[dict], fields: list[str]) -> dict[str, str]:
    """MDM 字段动态判定 number/text：非空值可解析为数字的占比 ≥ 80% 记为 number。"""
    types = {}
    for f in fields:
        total = ok = 0
        for raw in rows:
            v = bms.clean(raw.get(f))
            if v is None:
                continue
            total += 1
            if bms.number(v) is not None:
                ok += 1
        types[f] = "number" if total and ok / total >= 0.8 else "text"
    return types


def list_share_finished_excels(custom_dir: str | None = None) -> list[dict]:
    """列出共享盘（或候选目录）下的『物料属性查询报表-成品（含工艺）』候选列表。"""
    if not custom_dir and not SHARE_UNC and not SHARE_SMB and not SHARE_MOUNT_DIRS:
        return []
    ensure_smb_mounted(custom_dir or SHARE_UNC or SHARE_SMB)
    if custom_dir:
        _, mounts = unc_or_smb_to_mac_mounts(custom_dir)
        dirs = mounts
    else:
        dirs = list(SHARE_CANDIDATES)
    items = []
    seen = set()
    for d in dirs:
        try:
            if not d.exists() or not d.is_dir():
                continue
            for f in d.iterdir():
                if not f.is_file() or f.suffix.lower() != ".xlsx":
                    continue
                if f.name.startswith(("~$", ".", ".~")):
                    continue
                if "辅料" in f.name or "原盘纸" in f.name or "折算系数" in f.name:
                    continue
                if "物料属性查询报表" not in f.name and "物料属性" not in f.name:
                    continue
                has_craft = ("含工艺" in f.name) or ("(含工艺)" in f.name) or ("（含工艺）" in f.name)
                if not has_craft:
                    continue
                rp = str(f)
                if rp in seen:
                    continue
                seen.add(rp)
                st = f.stat()
                is_share = is_share_path_str(str(d))
                items.append({
                    "name": f.name,
                    "path": rp,
                    "mtime": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
                    "mtimeTs": st.st_mtime,
                    "sizeMB": round(st.st_size / (1024 * 1024), 2),
                    "hasCraft": True,
                    "isShare": is_share,
                    "dir": str(d),
                })
            if items and is_share_path_str(str(d)):
                break
        except OSError:
            continue
    # 排序：共享盘优先 → 修改时间最新
    items.sort(key=lambda x: (1 if x["isShare"] else 0, x["mtimeTs"]), reverse=True)
    return items


def resolve_latest_share_excel(custom_dir: str | None = None, prefer_craft: bool = True) -> tuple[Path, str]:
    """路线2：从集团共享目录 \\\\files.example.invalid\\示例组织\\共享资料\\MDM示例表（Windows 原生 UNC/映射盘符 或 macOS smb:// 挂载 /Volumes/MDM示例表）
    严格锁定寻找『物料属性查询报表-成品（含工艺）.xlsx』（123列完整表头）。
    返回 (文件路径, 来源模式描述)。
    """
    if not custom_dir and not SHARE_UNC and not SHARE_SMB and not SHARE_MOUNT_DIRS:
        raise FileNotFoundError("共享目录未配置，请选择本地 Excel 文件")
    ensure_smb_mounted(custom_dir or SHARE_UNC or SHARE_SMB)
    if custom_dir:
        raw_p = Path(custom_dir).expanduser()
        if raw_p.exists() and raw_p.is_file() and raw_p.suffix.lower() == ".xlsx":
            is_share = is_share_path_str(str(raw_p))
            return raw_p, (f"共享盘最新报表（{SHARE_UNC}）" if is_share else f"指定报表（{raw_p.parent}）")
        _, mounts = unc_or_smb_to_mac_mounts(custom_dir)
        dirs = mounts
    else:
        _, default_mounts = unc_or_smb_to_mac_mounts(SHARE_UNC or SHARE_SMB)
        dirs = [*default_mounts, *[c for c in SHARE_CANDIDATES if c not in default_mounts]]

    for d in dirs:
        try:
            if not d.exists() or not d.is_dir():
                continue
            # 严格锁定『物料属性查询报表-成品（含工艺）』
            cands = [
                f for f in d.iterdir()
                if f.is_file()
                and f.suffix.lower() == ".xlsx"
                and not f.name.startswith(("~$", ".", ".~"))
                and ("物料属性查询报表" in f.name or "物料属性" in f.name)
                and ("含工艺" in f.name)
                and "辅料" not in f.name
                and "原盘纸" not in f.name
            ]
            if not cands:
                continue
            prod_cands = [f for f in cands if "成品" in f.name] or cands
            best = max(prod_cands, key=lambda f: f.stat().st_mtime)
            matched_dir = str(d)
            is_share = is_share_path_str(matched_dir)
            mode_label = f"共享盘最新报表（{SHARE_UNC} -> {matched_dir}）" if is_share else f"本地镜像最新报表（{matched_dir}）"
            return best, mode_label
        except OSError:
            continue

    raise FileNotFoundError(f"未在共享路径 ({SHARE_UNC} / {SHARE_SMB}) 或候选目录中找到『物料属性查询报表-成品（含工艺）.xlsx』")


def parse_args(argv=None):
    """更新数据源双路线入口：
    路线1：--source 指定本地具体文件（可含无效 SKU，亦支持直接传 UNC/SMB 路径）
    路线2：--auto-share 自动识别 \\\\files.example.invalid\\示例组织\\共享资料\\MDM示例表 下最新成品报表
    """
    p = argparse.ArgumentParser(description="构建 MDM 高级查询工作台数据集（支持本地指定文件 / 共享盘最新报表两条路线，工艺路线每次基于源表实时重算）")
    p.add_argument("--source", default="", help="路线1：指定 MDM 物料属性查询报表 xlsx 路径（支持本地路径或 UNC/SMB 路径）")
    p.add_argument("--auto-share", action="store_true", help="路线2：自动识别 \\\\files.example.invalid\\示例组织\\共享资料\\MDM示例表 最新成品报表")
    p.add_argument("--share-dir", default="", help="可选：覆盖共享盘搜索目录或指定共享盘具体报表路径")
    a = p.parse_args(argv)
    if a.source and not a.auto_share:
        s_raw = a.source.strip()
        if s_raw.startswith("\\\\") or s_raw.lower().startswith("smb://"):
            return resolve_latest_share_excel(s_raw)
        src = Path(s_raw).expanduser()
        if src.is_dir():
            return resolve_latest_share_excel(str(src))
        if not src.exists():
            p.error(f"源报表不存在：{src}")
        is_share = is_share_path_str(str(src))
        return src, (f"共享盘指定报表（{src.name}）" if is_share else "本地指定文件")
    try:
        return resolve_latest_share_excel(a.share_dir or _SOURCE_PREFS.get("sharePath") or None)
    except FileNotFoundError as e:
        if not a.auto_share and SOURCE_XLSX.exists():
            return SOURCE_XLSX, "本地默认文件"
        p.error(str(e))


def main(argv=None) -> dict:
    src_xlsx, source_mode = parse_args(argv)
    print(f"读取源报表 [{source_mode}]：{src_xlsx}")
    headers, data = load_excel(src_xlsx)
    idx = {h: i for i, h in enumerate(headers)}
    print(f"列头定位：{len(headers)} 列；数据行 {len(data)}")

    def cell(row: tuple, name: str):
        j = idx.get(name, -1)
        return row[j] if 0 <= j < len(row) else None

    raws = []
    for row in data:
        raw = normalize_raw_record({h: bms.clean(cell(row, h)) for h in headers})
        raws.append(raw)

    # ---- 建行（工艺路线每次直接从当前 MDM 源表实时推导，不引用历史快照结论）----
    mdm_types = detect_field_types(raws, MDM_FIELDS)
    print("MDM 字段类型判定：", {k: v for k, v in mdm_types.items() if v == "text"})

    # 个人规则独立保存，刷新源表时沿用；默认规则与前端共用同一份声明。
    from workbench_config import ConfigStore
    stored = ConfigStore().read()
    process_config = (stored.get("config", {}).get("settings", {}).get("processRules") or pr.defaults())
    known = set(raws[0] if raws else ()) | {x[4] for x in SCHEMA if x[4]} | set(MDM_FIELDS) | {"$ruleCat", "$specP"}
    process_run = pr.compile_config(pr.validate(process_config, known))
    process_scope = pr.compile_node(process_config["scope"])
    pdf_rules = [{"no": 0, "id": "pdf-scope", "title": "适用范围", "gov": "supplement", "desc": pr.describe(process_config["scope"])}] + [{"no": r["no"], "id": r["id"], "title": r["title"], "gov": "numeric", "enabled": r["enabled"], "desc": pr.describe(r["scope"]) + "；" + "；".join(c["message"] for c in r["checks"] if c["enabled"])} for r in process_config["rules"]]
    process_raw_keys = [x[4] for x in SCHEMA if x[4] and x[3] == "number"]
    records = []
    process_raw_rows = []
    route_issues: dict[str, list[list[str]]] = {}
    route_status_counter: Counter = Counter()
    route_cross_counter: Counter = Counter()
    route_cat_counter: Counter = Counter()
    pdf_scope_stat = {"total": len(raws), "excludedInvalid": 0, "excludedImportType": 0, "excluded1900": 0, "inScope": 0}
    for raw in raws:
        material = str(raw.get("物料编码") or "")
        cat3 = str(raw.get("品类三级") or "")
        stock_cat = str(raw.get("物料库存类别") or "")

        # 实时推导 MPS 工艺路线（完全基于当前 MDM 字段，不读旧快照）
        rt_info = mre.compute_sku_route(raw)
        rule_cat = rt_info["category"] if rt_info["category"] in bms.CATEGORY_FIELD_RULES else RULE_CAT_MAP.get(cat3, "其他")
        box_size = raw.get("纸盒尺寸")
        box_variant = ""
        if rule_cat == "面巾":
            box_variant = bms.face_tissue_variant({"纸盒尺寸": box_size})
        spec_c, spec_p = bms.canonical_material_spec(raw.get("物料规格"))
        created = bms.parse_date_value(raw.get("创建时间"))
        updated = bms.parse_date_value(raw.get("最后更新时间"))
        load_v = bms.number(raw.get("原始装数"))

        # 缺失（必填口径；面巾盒巾豁免小包长宽高）
        required = bms.required_fields(rule_cat, {"纸盒尺寸": box_size}) if rule_cat != "其他" else []
        missing = [f for f in required if bms.clean(raw.get(f)) is None]
        score = round(100 * (len(required) - len(missing)) / len(required)) if required else None

        # 明显错值
        numeric_bad = []
        for f in NUMERIC_CHECK_FIELDS:
            v = bms.number(raw.get(f))
            if v is not None and v <= 0:
                numeric_bad.append(f)

        # 盒巾待确认（面巾且纸盒尺寸有值但解析不出长宽高）
        box_pending = rule_cat == "面巾" and box_variant == "盒巾" and bms.parse_box_dimensions(box_size) is None

        # 包装数量错值（同层级单位与数量未成对：仅单边缺失算异常，与主工具口径一致）
        pair_bad = []
        chain_parts: list[str] = []
        chain_levels = 0
        for level in range(1, 5):
            unit = bms.clean(raw.get(f"包装规格单位{level}"))
            qty = bms.number(raw.get(f"包装规格数量{level}"))
            if unit is not None:
                chain_levels += 1
                chain_parts.extend(p.strip() for p in str(unit).split("/") if p.strip())
            if (unit is None) != (qty is None):
                pair_bad.append(f"包装规格单位{level}")
        # 包装层级与证据对齐（提示级，不阻断）
        level_bad = []
        middle_method = bms.clean(raw.get("中包包装方式"))
        if middle_method and middle_method != "无" and chain_levels and not (set(chain_parts) & bms.MIDDLE_LEVEL_UNITS):
            level_bad.append("中包包装方式")
        if rule_cat == "面巾" and box_variant:
            has_box = "盒" in chain_parts
            has_pack = "包" in chain_parts
            if box_variant == "软抽" and has_box and not has_pack:
                level_bad.append("纸盒尺寸")
            if box_variant == "盒巾" and chain_levels and not has_box:
                level_bad.append("纸盒尺寸")

        # 装数与规格乘积校验（提示级）
        spec_mismatch = False
        if load_v and spec_p and abs(load_v - spec_p) > max(0.5, abs(load_v) * 1e-6):
            spec_mismatch = True

        # 路线实时推导结果（MPS 专属板块口径，不混入全局 MDM 阻断/异常计数）
        route = rt_info["route"]
        route_status = rt_info["routeStatus"]
        route_missing = rt_info["routeMissing"]
        route_nodes = rt_info["routeNodes"]
        if rt_info["inScope"]:
            route_status_counter[route_status] += 1
            route_cross_counter[rt_info["crossStatus"]] += 1
            route_cat_counter[rt_info["category"]] += 1
            if rt_info["issues"]:
                route_issues[material] = rt_info["issues"]

        # ---- 工艺属性自动检查（示例校验规范，范围 = 有效物料，排除进口/1900）----
        pt = str(raw.get("成品类型") or "")
        if str(raw.get("物料状态") or "") != "有效":
            pdf_scope_stat["excludedInvalid"] += 1
        elif "进口" in pt:
            pdf_scope_stat["excludedImportType"] += 1
        elif material.startswith("1900"):
            pdf_scope_stat["excluded1900"] += 1
        if process_scope({**raw, "$ruleCat": rule_cat, "$specP": spec_p}):
            pdf_scope_stat["inScope"] += 1
        pdf_flags, pdf_rule_hits, pdf_block_hits = (
            process_run({**raw, "$ruleCat": rule_cat, "$specP": spec_p})
        )

        # 全局 MDM 异常标记（严格排除 MPS 工艺路线问题，避免干扰非 MPS 使用者）
        flags: list[str] = []
        flags += [f"MISS:{f}" for f in missing]
        flags += [f"NUM:{f}" for f in numeric_bad]
        if box_pending:
            flags.append("BOX:纸盒尺寸")
        flags += [f"PAIR:{f}" for f in pair_bad]
        flags += [f"LEVEL:{f}" for f in level_bad]
        if spec_mismatch:
            flags.append("SPEC")
        flags += pdf_flags
        pdf_count = len(pdf_flags)
        pdf_block = sum(1 for f in pdf_flags if f.split(":")[0] in ("PFN", "PFC"))
        blocking = bool(numeric_bad or box_pending or pair_bad or pdf_block)

        values = {
            "material": material, "vcode": str(raw.get("V码") or ""), "desc": str(raw.get("物料说明") or ""),
            "status": str(raw.get("物料状态") or ""), "pre": str(raw.get("预失效") or ""),
            "cat": cat3, "ruleCat": rule_cat, "stock": str(raw.get("库存小类") or ""),
            "formula": str(raw.get("配方大类") or ""),
            "stockCat": stock_cat,
            "unit": str(raw.get("主单位") or ""), "brand": str(raw.get("品牌") or ""),
            "series": str(raw.get("产品系列") or ""), "npt": str(raw.get("新品类型") or ""),
            "gift": str(raw.get("加赠位置") or ""), "prodType": pt,
            "ecom": str(raw.get("是否电商") or ""), "isCombo": str(raw.get("是否组合装") or ""),
            "liquid": str(raw.get("含液量") or ""),
            "spec": str(raw.get("物料规格") or ""),
            "specC": spec_c or "", "specP": spec_p, "load": load_v,
            "net": bms.number(raw.get("净重")), "netNG": bms.number(raw.get("不含赠品净重")),
            "gross": bms.number(raw.get("毛重")), "wetNet": bms.number(raw.get("不含液成品净重（kg）")),
            "rollNet": bms.number(raw.get("小卷/包净重(g)")), "rollGross": bms.number(raw.get("小卷/包毛重(g)")),
            "quant": bms.number(raw.get("成品定量")),
            "pian": bms.number(raw.get("pian数量")),
            "created": created.isoformat() if created else "",
            "updated": updated.isoformat() if updated else "",
            "pack": join_packaging(raw),
            "route": route, "routeStatus": route_status, "routeMissing": route_missing,
            "routeNodes": route_nodes, "vconf": 0, "score": score,
            "issueCount": len(flags), "blocking": 1 if blocking else 0,
            "pdfCount": pdf_count, "pdfBlock": pdf_block,
            "flags": "|".join(flags),
        }
        for f in MDM_FIELDS:
            values[f] = raw.get(f)
        process_raw_rows.append([raw.get(f) for f in process_raw_keys])
        records.append({"material": material, "values": values, "raw_npt": str(raw.get("新品类型") or ""),
                        "pdf_rule_hits": pdf_rule_hits, "pdf_block_hits": pdf_block_hits})

    # ---- 同V码冲突（剔除内部周转；比 原始装数+规格标准化）----
    by_vcode: dict[str, list[dict]] = defaultdict(list)
    for rec in records:
        v = rec["values"]["vcode"]
        if v and rec["raw_npt"] != "内部周转":
            by_vcode[v].append(rec)
    vconf_groups = []
    for v, members in by_vcode.items():
        keys = {(m["values"]["load"], m["values"]["specC"]) for m in members}
        if len(members) > 1 and len(keys) > 1:
            for m in members:
                m["values"]["vconf"] = 1
                m["values"]["flags"] = (m["values"]["flags"] + "|VCONF").strip("|")
                m["values"]["issueCount"] = len(m["values"]["flags"].split("|")) if m["values"]["flags"] else 0
            vconf_groups.append({
                "vcode": v,
                "materialCount": len(members),
                "specCount": len(keys),
                "specs": [[m["values"]["material"], m["values"]["load"], m["values"]["specC"], m["values"]["desc"][:40]] for m in members[:8]],
            })
    vconf_groups.sort(key=lambda g: -g["materialCount"])
    print(f"同V码冲突组：{len(vconf_groups)}")

    # ---- 组装 schema（从『物料属性查询报表-成品（含工艺）』123 个表头列全量初始化 + 质量/MPS计算字段）----
    schema = [{"key": k, "label": lb, "group": g, "type": t} for k, lb, g, t, _ in SCHEMA]
    schema += [{"key": f, "label": f, "group": MDM_FIELD_GROUPS.get(f, "MDM字段"), "type": mdm_types[f]} for f in MDM_FIELDS]
    keys = [s["key"] for s in schema]
    assert len(keys) == len(set(keys)), "schema key 重复"

    rows = [[rec["values"].get(k) for k in keys] for rec in records]

    # ---- MPS 工艺路线实时重算统计（完全基于当前源表实时计算，不引用任何历史快照）----
    mps_issue_type_counter: Counter = Counter()
    mps_sev_counter: Counter = Counter()
    for m, iss_list in route_issues.items():
        for iss in iss_list:
            mps_sev_counter[iss[0]] += 1
            mps_issue_type_counter[iss[1]] += 1
    mps_summary = {
        "engine": "MPS 工艺路线实时推导引擎 V2.3.2（每次基于当前 MDM 源表重算）",
        "inScopeTotal": int(sum(route_status_counter.values())),
        "statusCounts": dict(route_status_counter),
        "crossCounts": dict(route_cross_counter),
        "categoryCounts": dict(route_cat_counter),
        "issueSkus": len(route_issues),
        "issueTotal": int(sum(len(v) for v in route_issues.values())),
        "issueByType": dict(mps_issue_type_counter),
        "issueBySev": dict(mps_sev_counter),
    }
    print(f"MPS 工艺路线实时重算：覆盖 {mps_summary['inScopeTotal']} 个成品 SKU，"
          f"状态分布 {dict(route_status_counter)}，路线专项问题 {mps_summary['issueTotal']} 条 / {mps_summary['issueSkus']} 个物料")

    # ---- 示例对比篮：一个阻断 + 一个无标记的有效面巾 ----
    demo = []
    for want in (True, False):
        for rec in records:
            v = rec["values"]
            if v["ruleCat"] == "面巾" and v["status"] == "有效" and bool(v["blocking"]) == want:
                demo.append(v["material"])
                break
    if len(demo) < 2:  # 兜底：取前两个有效物料
        demo = [r["values"]["material"] for r in records if r["values"]["status"] == "有效"][:2]

    # ---- 统计 ----
    flag_counter = Counter()
    for rec in records:
        for fl in filter(None, rec["values"]["flags"].split("|")):
            flag_counter[fl.split(":")[0]] += 1
    blocking_n = sum(1 for r in records if r["values"]["blocking"])
    pdf_hit_rows = sum(1 for r in records if r["values"]["pdfCount"] > 0)
    pdf_block_rows = sum(1 for r in records if r["values"]["pdfBlock"] > 0)
    print("flag 分布：", dict(flag_counter))
    print(f"全局 MDM 阻断 SKU（不含 MPS 路线）：{blocking_n}；工艺属性检查命中 {pdf_hit_rows}（其中阻断 {pdf_block_rows}）")

    # 工艺属性规则统计（按规则号：命中行数 / 阻断行数 / TOP 问题）
    pdf_rule_stats: dict[str, dict] = {}
    for rule in pdf_rules:
        no = str(rule["no"])
        hits = [r for r in records if no in {str(x) for x in r["pdf_rule_hits"]}]
        if not hits:
            continue
        detail = Counter()
        for r in hits:
            for fl in r["values"]["flags"].split("|"):
                parts = fl.split(":")
                if len(parts) >= 3 and parts[0].startswith("PF") and parts[1] == no:
                    detail[f"{parts[0]}·{parts[2]}"] += 1
        pdf_rule_stats[no] = {
            "hits": len(hits),
            "block": sum(1 for r in hits if no in {str(x) for x in r["pdf_block_hits"]}),
            "top": [[k, v] for k, v in detail.most_common(4)],
        }
    print("工艺属性规则统计：", {k: v["hits"] for k, v in pdf_rule_stats.items()})

    # 治理归口实时计数（全局仅统计 MDM 质量与工艺属性标记，MPS 路线专项单列在 MPS 板块）
    FLAG_GOV = {
        "MISS": "supplement", "NUM": "numeric", "BOX": "adjudication", "PAIR": "numeric",
        "LEVEL": "packaging", "VCONF": "packaging", "SPEC": "packaging",
        "PFM": "supplement", "PFN": "numeric", "PFC": "numeric", "PFI": "supplement", "PFP": "packaging",
    }
    gov_counts = {g["id"]: 0 for g in bms.GOVERNANCE_META}
    for t, n in flag_counter.items():
        if t in FLAG_GOV:
            gov_counts[FLAG_GOV[t]] = gov_counts.get(FLAG_GOV[t], 0) + n
    # 近2年创建 cutoff（与主工具同口径：今天回退 24 个日历月）
    created_cutoff = bms.subtract_months(date.today(), 24).isoformat()
    print("治理归口计数：", gov_counts, "近2年cutoff:", created_cutoff)

    rules = [
        {"id": "required", "title": "关键字段完整性", "desc": "按品类选择工艺与包装必填字段；只有必填项为空才定义为缺失，明确填写“无”视为已确认，选填字段不计入完整率。"},
        {"id": "numeric", "title": "明显错值", "desc": "净重、毛重、成品定量、层数、原始装数等数值字段不得小于等于 0。"},
        {"id": "box", "title": "盒巾/纸盒尺寸口径", "desc": "面巾以纸盒尺寸区分软抽与盒巾：纸盒尺寸为空或“无”即软抽（取小包长宽高），维护了有效纸盒尺寸即盒巾（长宽直接取纸盒尺寸长/宽，无法解析进入待确认）。"},
        {"id": "packaging", "title": "包装层级与成对校验", "desc": "包装规格只做两类判断：同层级单位与数量成对维护；链条与主单位、中包包装方式、面巾小包证据对齐。"},
        {"id": "vcode", "title": "同V码规格一致性", "desc": "剔除新品类型=内部周转后，以原始装数 + 物料规格乘积表达式识别同V码多规格；保留乘法因子顺序，1×10×6 与 10×6 等同、1×6×10 不同。"},
        {"id": "route", "title": "MPS 工艺路线实时推导（独立板块）", "desc": "面巾/卫卷/纸巾/餐巾按 V2.3.2 规则每次基于当前 MDM 源表实时重算工艺路线、节点状态与包装数组交叉校验；问题归入独立「MPS 工艺路线」板块，不混入全局 MDM 阻断与异常数。"},
    ]
    for r in rules:
        # 路线完整度属特殊项目口径，单列一组；其余为一般性质量口径
        r["group"] = "MPS 工艺路线专项（独立板块·每次重算）" if r["id"] == "route" else "MDM 质量口径"
    for r in pdf_rules:
        r["group"] = "工艺属性自动检查（示例校验规范）"
        r["stats"] = pdf_rule_stats.get(str(r["no"]))
    rules += pdf_rules

    dataset = {
        "meta": {
            "source": src_xlsx.name,
            "sourcePath": src_xlsx.name,
            "sourceMode": source_mode,
            "shareUnc": SHARE_UNC,
            "sourceStamp": datetime.fromtimestamp(src_xlsx.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
            "sourceRows": len(records),
            "routeSource": "实时重算（MPS 规则引擎 V2.3.2）",
            "routeStamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "builtAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "createdCutoff": created_cutoff,
            "govCounts": gov_counts,
            "mpsSummary": mps_summary,
            "pdfScope": pdf_scope_stat,
            "pdfHitRows": pdf_hit_rows,
            "pdfBlockRows": pdf_block_rows,
            "pdfSpec": "示例工艺属性校验规则",
        },
        "gov": [g for g in bms.GOVERNANCE_META if g["id"] not in ("equipment", "device", "route")],
        "mpsGov": [g for g in bms.GOVERNANCE_META if g["id"] in ("equipment", "device", "route")],
        "blockTypes": [b for b in bms.BLOCKING_ISSUE_TYPES if (b.get("id") if isinstance(b, dict) else b) not in ("route", "路线逻辑异常")],
        "pdfFlagMeta": PDF_FLAG_META,
        "pdfRules": pdf_rules,
        "pdfRuleStats": pdf_rule_stats,
        "flagFieldToKey": FLAG_FIELD_TO_KEY,
        "rules": rules,
        "fieldRules": bms.CATEGORY_FIELD_RULES,
        "mdmFields": MDM_FIELDS,
        "processAliases": {x[4]: x[0] for x in SCHEMA if x[4]},
        "processRawKeys": process_raw_keys,
        "processRawRows": process_raw_rows,
        "schema": schema,
        "defaultVisible": DEFAULT_VISIBLE,
        "presets": VIEW_PRESETS,
        "demoBasket": demo,
        "vconf": vconf_groups[:200],
        "routeIssues": route_issues,
        "rows": rows,
    }

    raw_json = json.dumps(dataset, ensure_ascii=False, separators=(",", ":"))
    (OUT_DIR / "dataset.json").write_text(raw_json, encoding="utf-8")
    packed = base64.b64encode(gzip.compress(raw_json.encode("utf-8"), compresslevel=9)).decode("ascii")
    (OUT_DIR / "dataset.b64").write_text(packed, encoding="utf-8")
    print(f"dataset.json {len(raw_json)/1e6:.1f} MB → dataset.b64 {len(packed)/1e6:.1f} MB")
    print(f"示例对比篮：{demo}")
    return dataset


if __name__ == "__main__":
    main()
