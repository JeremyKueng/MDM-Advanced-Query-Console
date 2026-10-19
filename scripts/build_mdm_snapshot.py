"""通用主数据规范化与字段校验辅助函数；不包含历史业务快照或报表任务。"""
from __future__ import annotations

import argparse

import calendar

import json

import math

import re

from collections import Counter, defaultdict

from datetime import date, datetime

from pathlib import Path

from typing import Any

import openpyxl

HEADER_ANCHOR = "物料编码"

HEADER_示例品牌01N_LIMIT = 30

def locate_header_row(rows) -> list[str]:
    """定位真正的列头行；返回列头，rows 停在列头的下一行。

    系统导出的报表前几行常是标题与筛选条件（如「物料属性查询报表(含工艺)」
    「物料组织：…」「导表时间：…」），列头并不在第一行。以包含「物料编码」
    的那一行作为列头，兼容「首行即列头」与「前 N 行为元信息」两种导出格式。
    """
    for index, values in enumerate(rows):
        cells = [str(x).strip() if x is not None else "" for x in values]
        if HEADER_ANCHOR in cells:
            return cells
        if index >= HEADER_示例品牌01N_LIMIT:
            break
    raise SystemExit(
        f"前 {HEADER_示例品牌01N_LIMIT + 1} 行内未找到含「{HEADER_ANCHOR}」的列头行，请检查源文件格式。"
    )

def clean(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        if value.is_integer():
            return int(value)
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value

def number(value: Any) -> float | None:
    value = clean(value)
    if value is None:
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None

def parse_date_value(value: Any) -> date | None:
    """把 Excel 日期或常见文本日期转成 date；解析失败返回 None。"""
    value = clean(value)
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value is None:
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y年%m月%d日"):
        try:
            return datetime.strptime(text[:10] if fmt != "%Y年%m月%d日" else text, fmt).date()
        except ValueError:
            continue
    return None

def subtract_months(anchor: date, months: int) -> date:
    """按日历月回退，月底自动归到目标月最后一天。"""
    month_index = anchor.year * 12 + anchor.month - 1 - months
    year, month_zero = divmod(month_index, 12)
    month = month_zero + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)

def parse_box_dimensions(value: Any) -> tuple[float, float, float] | None:
    """解析纸盒尺寸中的长、宽、高；取末尾三个数字以跳过“半盖/全盖”等前缀编号。"""
    value = clean(value)
    if value is None or str(value).strip().lower() in {"无", "不适用", "n/a", "na"}:
        return None
    nums = re.findall(r"\d+(?:\.\d+)?", str(value))
    if len(nums) < 3:
        return None
    return tuple(float(x) for x in nums[-3:])

def _format_number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:g}"

def canonical_material_spec(value: Any) -> tuple[str | None, float | None]:
    """将物料规格中的乘法/加法表达式标准化，保留乘法因子顺序。

    规则示例：1×6×10 → 6*10；1×10×6 → 10*6；10×6 与 1×10×6 等同；
    (3+1)×2 → 4*2。无法完整解析时返回清洗后的原值，避免静默合并。
    """
    raw = clean(value)
    if raw is None:
        return None, None
    text = str(raw).strip().replace("×", "*").replace("x", "*").replace("X", "*").replace("＋", "+")
    text = re.sub(r"\s+", "", text)
    index = 0

    def parse_expr() -> tuple[float, list[float]] | None:
        nonlocal index
        first = parse_term()
        if first is None:
            return None
        total, factors = first
        while index < len(text) and text[index] == "+":
            index += 1
            part = parse_term()
            if part is None:
                return None
            total += part[0]
            # 加法表达式作为一个因子参与外层乘法，避免错误地交换/展开顺序。
            factors = [total]
        return total, factors

    def parse_term() -> tuple[float, list[float]] | None:
        nonlocal index
        first = parse_factor()
        if first is None:
            return None
        total, factors = first
        while index < len(text) and text[index] == "*":
            index += 1
            part = parse_factor()
            if part is None:
                return None
            total *= part[0]
            factors.extend(part[1])
        return total, factors

    def parse_factor() -> tuple[float, list[float]] | None:
        nonlocal index
        if index >= len(text):
            return None
        if text[index] == "(":
            index += 1
            nested = parse_expr()
            if nested is None or index >= len(text) or text[index] != ")":
                return None
            index += 1
            return nested[0], [nested[0]]
        match = re.match(r"\d+(?:\.\d+)?", text[index:])
        if not match:
            return None
        value_num = float(match.group(0))
        index += len(match.group(0))
        return value_num, [value_num]

    parsed = parse_expr()
    if parsed is None or index != len(text):
        return text, None
    product, factors = parsed
    while len(factors) > 1 and abs(factors[0] - 1) < 1e-9:
        factors.pop(0)
    canonical = "*".join(_format_number(x) for x in factors)
    return canonical or _format_number(product), product

CATEGORY_FIELD_RULES: dict[str, list[dict[str, Any]]] = {
    "卫卷": [
        {"name": "卷体与工艺", "required": True, "fields": ["制造类别", "层数", "压线/压花", "卷径", "卷高", "节距", "筒芯", "米数"]},
        {"name": "中包与出货", "required": True, "fields": ["中包包装方式", "单提长", "单提宽", "单提高"]},
        {"name": "装箱（仅提示未维护）", "required": False, "fields": ["装箱方式"]},
    ],
    "面巾": [
        {"name": "折叠与成品", "required": True, "fields": ["制造类别", "层数", "压线/压花", "纸长", "纸宽", "抽(张)/包(盒)"]},
        {"name": "小包", "required": True, "fields": ["小包长度", "小包宽度", "单包高度"]},
        {"name": "中包与出货", "required": True, "fields": ["中包包装方式", "单提长", "单提宽", "单提高"]},
        {"name": "装箱（仅提示未维护）", "required": False, "fields": ["装箱方式"]},
        {"name": "纸盒变体（条件字段）", "required": False, "fields": ["纸盒尺寸"]},
    ],
    "纸巾": [
        {"name": "折叠与成品", "required": True, "fields": ["制造类别", "层数", "压线/压花", "纸长", "纸宽", "张/片数", "标准/迷你"]},
        {"name": "中包与出货", "required": True, "fields": ["中包包装方式", "单提长", "单提宽", "单提高"]},
        {"name": "人工装箱（暂不定义）", "required": False, "fields": ["装箱方式"]},
    ],
    "餐巾": [
        {"name": "折叠与成品", "required": True, "fields": ["制造类别", "层数", "压线/压花", "纸长", "纸宽", "张/片数", "折数"]},
        {"name": "小包", "required": True, "fields": ["小包长度", "小包宽度", "单包高度"]},
        {"name": "出货包装（按包装关系确认）", "required": False, "fields": ["中包包装方式", "单提长", "单提宽", "单提高", "装箱方式"]},
    ],
}

GOVERNANCE_META: list[dict[str, Any]] = [
    {"id": "numeric", "name": "数值修正", "priority": 1, "description": "净重、层数、原始装数、包装数量等出现 0 或负值，先修正数值再进入补录流程。"},
    {"id": "supplement", "name": "MDM补录", "priority": 2, "description": "品类必填字段为空，回到 MDM 按品类口径补录；填写“无”视为已确认。"},
    {"id": "packaging", "name": "包装核对", "priority": 3, "description": "包装关系数组缺失、层级冲突或单位异常，需人工核对后重建包装关系。"},
    {"id": "adjudication", "name": "业务裁定", "priority": 4, "description": "盒巾纸盒尺寸待确认、板化是否属于生产工艺等，需要业务给出口径后落库。"},
    {"id": "device", "name": "设备规则", "priority": 5, "description": "设备规则未覆盖的路线节点，进入设备台账补规则。"},
    {"id": "route", "name": "路线口径", "priority": 6, "description": "品类模板未覆盖、临时规则应用等路线定义层面的缺口。"},
]

BLOCKING_ISSUE_TYPES = ["明显错值", "包装数量错值", "盒巾长宽匹配异常", "路线逻辑异常"]

MIDDLE_LEVEL_UNITS = {"包", "中包", "提", "袋", "组", "中提"}

def face_tissue_variant(raw: dict[str, Any]) -> str:
    """区分面巾软抽与盒巾：纸盒尺寸为空或“无”即软抽，维护了有效纸盒尺寸即盒巾。"""
    box_size = clean(raw.get("纸盒尺寸"))
    if box_size is None or str(box_size).strip() == "无":
        return "软抽"
    return "盒巾"

def required_fields(category: str, raw: dict[str, Any] | None = None) -> list[str]:
    fields = [field for group in CATEGORY_FIELD_RULES.get(category, []) if group.get("required") for field in group["fields"]]
    if category == "面巾" and raw is not None and face_tissue_variant(raw) == "盒巾":
        # 盒巾长宽高由纸盒尺寸提供，小包长宽高不再作为必填。
        fields = [field for field in fields if field not in {"小包长度", "小包宽度", "单包高度"}]
    return fields
