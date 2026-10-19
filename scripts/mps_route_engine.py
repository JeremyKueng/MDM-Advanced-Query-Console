"""MPS 工艺路线实时重算引擎（V2.3.2 口径，完全基于当前 MDM 原始记录实时推导，不引用任何历史路线快照）。

规则要点：
1. 覆盖范围：配方大类=干巾，且品类归属为 卫卷 / 面巾 / 纸巾 / 餐巾 四品类模板（支持全量物料实时计算，不限预失效=Y）。
2. 工段节点：
   - 机头（复卷/折叠）：制造类别、层数、压线/压花 + 品类特定机头参数
   - 裁切（卫卷/面巾）：卫卷看卷高/卷径，面巾看纸长/小包宽度/单包高度
   - 加香（可选）：加香/香型非空且非“无/不加香”
   - 首次包装（小包/纸盒）：面巾纸盒尺寸有值走纸盒，否则走小包；卫卷按卷高/卷径/小包卷数（1/2/4/6卷）计算小包三维尺寸
   - 中包：中包包装方式非空且不为无时生成；盒巾包装规格出现“提”且中包方式为空/无时，临时按单排生成中包节点并记提示
   - 终端包装（装箱/大包/件装末端）+ 板化提示：包装规格单位1-4有序数组按上下文弹性归一（提/中提/中袋→中包），与主单位交叉校验
   - 加赠附加工艺：加赠位置挂接到中包、装箱或大包节点
"""
from __future__ import annotations

import math
import re
from typing import Any

CATEGORIES = ("卫卷", "面巾", "纸巾", "餐巾")
HEAD_FAMILY = {"卫卷": "复卷", "面巾": "折叠", "纸巾": "折叠", "餐巾": "折叠"}
RULE_COVERAGE = {
    "卫卷": {"机头", "裁切", "加香", "小包", "中包", "大包", "装箱", "叠板"},
    "面巾": {"机头", "裁切", "加香", "小包", "纸盒", "中包", "装箱", "叠板"},
    "纸巾": {"机头", "加香", "小包", "中包"},
    "餐巾": {"机头", "加香", "小包", "装箱", "叠板"},
}
EMPTY_TOKENS = {"", "空", "null", "none", "nan", "/", "无", "否", "不适用"}
MIDDLE_TOKENS = ("提", "中包", "中袋", "中提")
TERMINAL_MAP = {"箱": ("装箱", "装箱机"), "袋": ("大包", "大包机"), "件": ("件装末端", "叠板/待定义")}
TERMINAL_STAGES = {"装箱", "大包", "叠板", "件装末端", "终端待确认", "板化提示"}
GENERIC_MAIN_UNITS = {"件", "个"}
MIDDLE_PACK_UNITS = {"提", "中提", "中包", "中袋"}
PRIMARY_PACK_UNITS = {"包", "小包", "盒", "卷", "组", "粒"}

RULE_CAT_FALLBACK = {
    "面巾": "面巾", "软抽": "面巾", "乳霜软抽": "面巾", "悬挂式软抽": "面巾",
    "抽取多用纸抹布": "面巾", "悬挂式多用纸抹布": "面巾",
    "公用擦手纸": "面巾", "悬挂式公用擦手纸": "面巾",
    "有芯卫生卷纸": "卫卷", "无芯卫生卷纸": "卫卷", "公用卫生纸": "卫卷",
    "卷装多用纸抹布": "卫卷", "卷装擦手纸": "卫卷",
    "纸巾": "纸巾", "纸巾便携式": "纸巾",
    "餐巾": "餐巾",
}


def clean(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        if isinstance(value, float) and value.is_integer():
            return int(value)
        return value
    s = re.sub(r"\s+", " ", str(value).replace("　", " ")).strip()
    return s or None


def text(value: Any) -> str:
    v = clean(value)
    return "" if v is None else str(v)


def is_blank_or_no(value: Any) -> bool:
    v = clean(value)
    return v is None or str(v).strip().lower() in EMPTY_TOKENS


def is_fragrance_required(value: Any) -> bool:
    v = clean(value)
    if v is None:
        return False
    norm = str(v).strip().lower()
    return norm not in EMPTY_TOKENS and "不加香" not in norm


def as_number(value: Any) -> float | None:
    v = clean(value)
    if isinstance(v, (int, float)):
        return float(v)
    if v is None:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def fmt_num(value: Any) -> str:
    if value is None:
        return "?"
    n = float(value)
    return str(int(n)) if n.is_integer() else f"{n:g}"


def parse_dims(value: Any) -> tuple[float, float, float] | None:
    s = text(value)
    nums = re.findall(r"\d+(?:\.\d+)?", s)
    if len(nums) < 3:
        return None
    return tuple(float(x) for x in nums[-3:])


def classify_route_category(record: dict) -> str:
    """判定工艺路线四品类归属：优先库存小类前缀，其次品类三级映射。"""
    sub = text(record.get("库存小类"))
    for cat in CATEGORIES:
        if sub == cat or sub.startswith(cat + "."):
            return cat
    cat3 = text(record.get("品类三级"))
    return RULE_CAT_FALLBACK.get(cat3, "其他")


def normalize_relation(raw_unit: Any) -> tuple[str | None, str | None, str]:
    raw = text(raw_unit).strip()
    if not raw:
        return None, None, "空"
    normalized = raw.replace("／", "/").replace("\\", "/").replace("→", "/")
    normalized = re.sub(r"\s+", "", normalized)
    if re.fullmatch(r"\d+(?:\.\d+)?", normalized):
        return None, None, "单位字段误填数字"
    parts = normalized.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return None, None, "未形成起始单位/目标单位关系"
    return parts[0], parts[1], "有效"


def build_packaging_array(record: dict) -> list[dict]:
    relations = []
    for level in range(1, 5):
        raw_unit = clean(record.get(f"包装规格单位{level}"))
        raw_qty = clean(record.get(f"包装规格数量{level}"))
        if raw_unit is None and raw_qty is None:
            continue
        origin, target, status = normalize_relation(raw_unit)
        qty = as_number(raw_qty)
        if status == "有效" and qty is None:
            status = "数量缺失"
        relations.append({
            "层级": level,
            "原始单位": text(raw_unit),
            "原始数量": raw_qty,
            "起始单位": origin or "",
            "目标单位": target or "",
            "数量": qty,
            "关系状态": status,
        })
    return relations


def packaging_signature(relations: list[dict]) -> str:
    if not relations:
        return "未维护"
    parts = []
    for item in relations:
        unit = item["原始单位"] or "?"
        qty = fmt_num(item["数量"]) if item["数量"] is not None else text(item["原始数量"]) or "?"
        parts.append(f"L{item['层级']} {unit}×{qty}")
    return " → ".join(parts)


def canonical_packaging_unit(unit: Any) -> str:
    u = text(unit)
    return "中包" if u in MIDDLE_PACK_UNITS else u


def normalize_packaging_relations(relations: list[dict], main_unit: Any):
    parsed = [item for item in relations if item["起始单位"] and item["目标单位"]]
    normalized = []
    corrections = []
    seen_pairs = set()
    audited = {}
    main_unit_str = text(main_unit)

    for position, item in enumerate(parsed):
        relation = dict(item)
        original_start = item["起始单位"]
        original_end = item["目标单位"]
        start = canonical_packaging_unit(original_start)
        end = canonical_packaging_unit(original_end)
        notes = []

        previous_end = normalized[-1]["归一目标单位"] if normalized else ""
        previous_original_end = normalized[-1]["目标单位"] if normalized else ""
        is_last = position == len(parsed) - 1

        if (
            previous_end == start == "中包"
            and previous_original_end != original_start
            and previous_original_end in MIDDLE_PACK_UNITS
            and original_start in MIDDLE_PACK_UNITS
        ):
            notes.append(
                f"L{normalized[-1]['层级']}目标单位“{previous_original_end}”与"
                f"L{item['层级']}起始单位“{original_start}”按同一中包层级识别"
            )

        if previous_end == "中包" and start in {"包", "小包"}:
            start = "中包"
            notes.append(f"L{item['层级']}起始单位“{original_start}”按上一层中包识别")

        if (
            is_last
            and previous_end == "中包"
            and start == "中包"
            and end == "中包"
            and main_unit_str in {"箱", "袋"}
        ):
            end = main_unit_str
            notes.append(f"L{item['层级']}目标单位“{original_end}”按主单位“{main_unit_str}”识别")

        relation["归一起始单位"] = start
        relation["归一目标单位"] = end
        relation["口语归一说明"] = "；".join(notes)
        relation["是否忽略"] = "否"

        pair = (start, end)
        if item["数量"] is None and pair in seen_pairs:
            relation["是否忽略"] = "是"
            extra = f"L{item['层级']}与前序关系重复且数量为空，保留原值但不参与路线"
            relation["口语归一说明"] = "；".join(filter(None, [relation["口语归一说明"], extra]))
            corrections.append(extra)
            audited[item["层级"]] = relation
            continue

        normalized.append(relation)
        audited[item["层级"]] = relation
        seen_pairs.add(pair)
        corrections.extend(notes)

    return normalized, list(dict.fromkeys(corrections)), audited


def analyze_packaging_array(relations: list[dict], main_unit: Any) -> dict:
    valid, corrections, audited = normalize_packaging_relations(relations, main_unit)
    errors = []
    for item in relations:
        ignored_duplicate = audited.get(item["层级"], {}).get("是否忽略") == "是"
        if item["关系状态"] != "有效" and not ignored_duplicate:
            errors.append(f"L{item['层级']}：{item['关系状态']}")
    for previous, current in zip(valid, valid[1:]):
        if previous["归一目标单位"] != current["归一起始单位"]:
            errors.append(
                f"L{previous['层级']}归一目标单位“{previous['归一目标单位']}”与"
                f"L{current['层级']}归一起始单位“{current['归一起始单位']}”不连续"
            )

    original_array_end = valid[-1]["目标单位"] if valid else ""
    array_end = valid[-1]["归一目标单位"] if valid else ""
    plate_flag = array_end == "板"
    packaging_terminal = valid[-1]["归一起始单位"] if plate_flag and valid else array_end
    main_unit_str = text(main_unit)

    if not valid:
        if main_unit_str in GENERIC_MAIN_UNITS:
            cross_status = f"主单位{main_unit_str}，包装形态待补"
            route_unit = ""
            final_shipping_unit = "待补包装形态"
            source = "主单位仅作计量，不能推断包装末端"
        else:
            cross_status = "包装数组缺失，主单位回退"
            route_unit = main_unit_str if main_unit_str in {"箱", "袋"} else ""
            final_shipping_unit = main_unit_str or "待补包装形态"
            source = "主单位暂定"
    elif errors:
        cross_status = "包装数组异常"
        route_unit = main_unit_str if main_unit_str in {"箱", "袋"} else ""
        final_shipping_unit = f"待确认（数组异常末端={array_end or '?'}；主单位={main_unit_str or '?'}）"
        source = "主单位暂定，数组待修复"
    elif main_unit_str in GENERIC_MAIN_UNITS:
        cross_status = (
            f"主单位{main_unit_str}，数组明确板出"
            if plate_flag
            else f"主单位{main_unit_str}，包装形态由数组确定"
        )
        route_unit = packaging_terminal
        final_shipping_unit = array_end
        source = "包装数组（主单位为计量单位）"
    elif packaging_terminal == main_unit_str:
        cross_status = "数组与主单位一致"
        route_unit = packaging_terminal
        final_shipping_unit = array_end
        source = "包装数组+主单位"
    else:
        cross_status = "数组与主单位冲突"
        route_unit = ""
        final_shipping_unit = f"待确认（数组={array_end or '?'}；主单位={main_unit_str or '?'}）"
        source = "冲突待确认"

    return {
        "有效关系数": len(valid),
        "原始数组末端单位": original_array_end,
        "数组末端单位": array_end,
        "包装终端单位": packaging_terminal,
        "主单位": main_unit_str,
        "交叉校验状态": cross_status,
        "最终出货单位": final_shipping_unit,
        "路线终端单位": route_unit,
        "末端判断来源": source,
        "是否板化": "是" if plate_flag else "否",
        "数组错误": errors,
        "口语归一说明": corrections,
        "归一关系明细": audited,
        "有效关系": valid,
    }


def derive_roll_primary_dimensions(record: dict, relations: list[dict]):
    roll_height = as_number(record.get("卷高"))
    roll_diameter = as_number(record.get("卷径"))
    pack_qty = 1
    qty_source = "默认单卷小包"
    for relation in relations:
        if relation["起始单位"] == "卷" and relation["目标单位"] in {"组", "包"}:
            pack_qty = int(relation["数量"]) if relation["数量"] is not None else None
            qty_source = f"包装规格单位{relation['层级']}/数量{relation['层级']}"
            break

    if roll_height is None or roll_diameter is None:
        missing = []
        if roll_height is None:
            missing.append("卷高")
        if roll_diameter is None:
            missing.append("卷径")
        return None, None, None, pack_qty, qty_source, missing, "卷高或卷径缺失，无法计算卫卷小包尺寸"

    formulas = {
        1: (roll_height, roll_diameter, roll_diameter, "卷高×卷径×卷径"),
        2: (roll_height, roll_diameter * 2, roll_diameter, "卷高×(卷径×2)×卷径"),
        4: (roll_height * 2, roll_diameter * 2, roll_diameter, "(卷高×2)×(卷径×2)×卷径"),
        6: (roll_height * 3, roll_diameter * 2, roll_diameter, "(卷高×3)×(卷径×2)×卷径"),
    }
    if pack_qty not in formulas:
        return None, None, None, pack_qty, qty_source, ["小包组内排列"], f"未定义{pack_qty}卷组包装的长宽高公式"
    length, width, height, formula = formulas[pack_qty]
    return length, width, height, pack_qty, qty_source, [], formula


def terminal_qty(analysis: dict, record: dict):
    unit = analysis["路线终端单位"]
    for relation in reversed(analysis["有效关系"]):
        if relation["归一目标单位"] == unit:
            return relation["数量"], f"包装规格单位{relation['层级']}/数量{relation['层级']}"
    fallback = as_number(record.get("原始装数"))
    return fallback, "原始装数回退" if fallback is not None else "包装规格"


def compute_sku_route(record: dict) -> dict:
    """对单条 MDM 原始记录实时推导 MPS 工艺路线。

    返回字典：
    - inScope: bool（是否属于干巾四品类工艺路线范围）
    - category: 四品类名称或 "其他"
    - route: 工艺路线字符串（如 "机头 → 裁切 → 小包 → 中包 → 装箱"）
    - routeStatus: "完整" | "待补MDM" | "待补设备规则" | "待补MDM+设备规则" | "逻辑异常" | ""
    - routeMissing: 缺失字段字符串（如 "机头.节距；装箱.装箱方式"）
    - routeNodes: "完整节点数/总节点数"
    - crossStatus: 包装数组与主单位交叉校验状态
    - issues: list[[severity, issue_type, field, description, action]]（不含普通字段缺失）
    - nodes: list[dict]（各工段节点摘要）
    """
    formula = text(record.get("配方大类"))
    category = classify_route_category(record)
    # 只要能归入四品类（且配方大类为干巾或为空但品类三级明确属于四品类），即实时计算工艺路线
    if category not in CATEGORIES or (formula and formula != "干巾"):
        return {
            "inScope": False,
            "category": category,
            "route": "",
            "routeStatus": "",
            "routeMissing": "",
            "routeNodes": "",
            "crossStatus": "",
            "issues": [],
            "nodes": [],
        }

    issues: list[list[str]] = []
    conflicts: list[str] = []
    fallbacks: list[str] = []
    nodes: list[dict] = []

    def add_issue(sev: str, itype: str, stage: str, field: str, desc: str, action: str = "补充MDM字段/口径"):
        issues.append([sev, itype, f"{stage}·{field}" if stage and field else (field or stage), desc, action])

    def node_status(missing_list: list[str], covered: bool) -> str:
        if missing_list and not covered:
            return "待补MDM+设备规则"
        if missing_list:
            return "待补MDM"
        if not covered:
            return "待补设备规则"
        return "完整"

    def append_node(seq: int, stage: str, device: str, family: str, spec: str,
                    missing_list: list[str], covered_override: bool | None = None):
        covered = (stage in RULE_COVERAGE[category]) if covered_override is None else covered_override
        st = node_status(missing_list, covered)
        nodes.append({
            "seq": seq,
            "stage": stage,
            "device": device,
            "family": family,
            "spec": spec,
            "status": st,
            "missing": list(missing_list),
            "covered": "是" if covered else "否",
            "gift": "",
        })
        if not covered:
            add_issue("中", "设备规则未覆盖", stage, "设备匹配规则", f"当前{category}匹配规则未完整覆盖{stage}", "补充该品类设备匹配规则")

    relations = build_packaging_array(record)
    analysis = analyze_packaging_array(relations, record.get("主单位"))
    if analysis["口语归一说明"]:
        fallbacks.append("包装单位按上下文弹性归一")

    # 1. 机头节点
    head_req = ["制造类别", "层数", "压线/压花"]
    if category == "卫卷":
        head_req += ["卷径", "卷高", "节距"]
        if "有芯" in text(record.get("库存小类")):
            head_req += ["筒芯"]
    elif category == "面巾":
        head_req += ["纸宽", "纸长", "抽(张)/包(盒)"]
    elif category == "纸巾":
        head_req += ["纸长", "纸宽", "张/片数", "标准/迷你"]
    elif category == "餐巾":
        head_req += ["纸长", "纸宽", "张/片数", "折数"]
    head_miss = [f for f in head_req if is_blank_or_no(record.get(f))]
    head_spec = f"制造={text(record.get('制造类别')) or '?'}｜层数={text(record.get('层数')) or '?'}｜压花={text(record.get('压线/压花')) or '?'}"
    append_node(10, "机头", HEAD_FAMILY[category] + "机", HEAD_FAMILY[category], head_spec, head_miss)

    # 2. 裁切节点（卫卷、面巾）
    if category in {"卫卷", "面巾"}:
        if category == "卫卷":
            c_req = ["卷高", "卷径"]
            c_spec = f"卷高={text(record.get('卷高')) or '?'}；卷径={text(record.get('卷径')) or '?'}"
        else:
            c_req = ["纸长", "小包宽度", "单包高度"]
            c_spec = f"长={text(record.get('纸长')) or '?'}；宽={text(record.get('小包宽度')) or '?'}；高={text(record.get('单包高度')) or '?'}"
        c_miss = [f for f in c_req if is_blank_or_no(record.get(f))]
        append_node(20, "裁切", "裁切机", "裁切", c_spec, c_miss)

    # 3. 加香节点（可选）
    if is_fragrance_required(record.get("加香/香型")):
        append_node(30, "加香", "加香机", "加香", text(record.get("加香/香型")), [])

    # 4. 首次包装（小包 / 纸盒）
    paper_box = not is_blank_or_no(record.get("纸盒尺寸")) and category == "面巾"
    primary_stage = "纸盒" if paper_box else "小包"
    primary_device = "纸盒机" if paper_box else "小包机"
    if category == "卫卷":
        pl, pw, ph, pack_qty, _, p_miss, formula_desc = derive_roll_primary_dimensions(record, relations)
        p_spec = f"包装粒数={pack_qty or '?'}；尺寸={fmt_num(pl)}×{fmt_num(pw)}×{fmt_num(ph)}mm"
        if p_miss:
            add_issue("中", "卫卷小包尺寸无法计算", "小包", "卷高/卷径/包装规格", formula_desc, "补卷高、卷径，或补充该包装粒数对应的排列公式")
        append_node(40, "小包", "小包机", "软包/卷包", p_spec, p_miss)
    else:
        pl = as_number(record.get("小包长度"))
        pw = as_number(record.get("小包宽度"))
        ph = as_number(record.get("单包高度"))
        if paper_box and any(v is None for v in (pl, pw, ph)):
            parsed = parse_dims(record.get("纸盒尺寸"))
            if parsed:
                pl, pw, ph = parsed
                fallbacks.append("纸盒尺寸解析长宽高")
        p_miss = []
        if pl is None:
            p_miss.append("小包长度")
        if pw is None:
            p_miss.append("小包宽度")
        if ph is None:
            p_miss.append("单包高度")
        append_node(40, primary_stage, primary_device, "纸盒" if paper_box else "软包/卷包",
                    f"尺寸={fmt_num(pl)}×{fmt_num(pw)}×{fmt_num(ph)}mm", p_miss)

    # 5. 中包节点
    middle_method = clean(record.get("中包包装方式"))
    middle_required = not is_blank_or_no(middle_method)
    has_mid_rel = any(any(tok in r["原始单位"] for tok in MIDDLE_TOKENS) for r in relations)
    inferred_box_mid = (
        category == "面巾"
        and primary_stage == "纸盒"
        and not middle_required
        and any("提" in r["起始单位"] or "提" in r["目标单位"] for r in relations)
    )
    if middle_required:
        ml, mw, mh = as_number(record.get("单提长")), as_number(record.get("单提宽")), as_number(record.get("单提高"))
        m_miss = [f for f, v in [("单提长", ml), ("单提宽", mw), ("单提高", mh)] if v is None]
        mid_qty = None
        for r in relations:
            if "/" in r["原始单位"] and any(tok in r["原始单位"].split("/", 1)[1] for tok in MIDDLE_TOKENS):
                mid_qty = r["数量"]
                break
        if mid_qty is None:
            m_miss.append("中包装量")
        append_node(50, "中包", "中包机", text(middle_method),
                    f"排列={text(middle_method)}；尺寸={fmt_num(ml)}×{fmt_num(mw)}×{fmt_num(mh)}mm", m_miss)
        if not has_mid_rel:
            conflicts.append("中包方式有值但包装规格未出现中包层级")
            add_issue("中", "包装层级冲突", "中包", "包装规格单位1-4", "中包包装方式有值，但包装规格未出现提/中包/中袋/中提", "核对包装层级")
    elif inferred_box_mid:
        ml, mw, mh = as_number(record.get("单提长")), as_number(record.get("单提宽")), as_number(record.get("单提高"))
        m_miss = [f for f, v in [("单提长", ml), ("单提宽", mw), ("单提高", mh)] if v is None]
        mid_qty = next((r["数量"] for r in relations if "提" in r["目标单位"]), None)
        if mid_qty is None:
            m_miss.append("中包装量")
        append_node(50, "中包", "中包机", "单排（临时默认）",
                    f"排列=单排（临时默认）；尺寸={fmt_num(ml)}×{fmt_num(mw)}×{fmt_num(mh)}mm", m_miss, covered_override=True)
        add_issue("低", "临时规则应用", "中包", "中包包装方式",
                  "盒巾包装规格出现提，临时推导存在中包，并将空/无的中包包装方式默认为单排", "后续在MDM补录真实中包包装方式")
    elif has_mid_rel:
        conflicts.append("包装规格出现中包层级，但中包包装方式为空/无")
        add_issue("高", "中包存在性冲突", "中包", "中包包装方式",
                  "包装规格出现中包层级，但中包包装方式为空/无", "补充中包包装方式；未补前不自动生成中包节点")

    # 6. 包装关系数组校验与终端节点
    if analysis["数组错误"]:
        conflicts.extend(analysis["数组错误"])
        for err_desc in analysis["数组错误"]:
            add_issue("高", "包装数组异常", "包装关系", "包装规格单位1-4/数量1-4", err_desc, "修复包装规格单位与数量")
    if analysis["交叉校验状态"] == "数组与主单位冲突":
        conflicts.append("包装数组末端与主单位不一致")
    elif analysis["交叉校验状态"] == "包装数组缺失，主单位回退":
        add_issue("中", "包装数组缺失", "包装关系", "包装规格单位1-4", "没有有效包装关系，终端路线暂按主单位回退", "补充包装规格单位和数量")
    elif "包装形态待补" in analysis["交叉校验状态"]:
        add_issue("中", "包装数组缺失", "包装关系", "包装规格单位1-4", "主单位是计量单位，不能据此推断实际包装末端或板出", "补充包装规格单位和数量")

    unit = analysis["路线终端单位"]
    tl = as_number(record.get("长(外包装)"))
    tw = as_number(record.get("宽(外包装)"))
    th = as_number(record.get("高(外包装)"))
    t_qty, t_qty_src = terminal_qty(analysis, record)

    def add_board_hint(conflict_mode: bool = False):
        if analysis["是否板化"] != "是" or not analysis["有效关系"]:
            return
        last_rel = analysis["有效关系"][-1]
        nodes.append({
            "seq": 70, "stage": "板化提示", "device": "叠板/码板待定义", "family": "板化",
            "spec": f"{last_rel['原始单位']}×{fmt_num(last_rel['数量'])}",
            "status": "待补设备规则", "missing": ["板化/叠板工艺定义"], "covered": "否", "gift": "",
        })
        add_issue(
            "中", "板化规则待确认", "板化提示", "包装规格单位1-4",
            "包装数组出现到板关系，但包装终端单位与主单位冲突" if conflict_mode
            else "包装数组明确出现到板关系；板化是否属于生产叠板工段仍待定义",
            "确认到板关系对应叠板/码板工段，或仅作为物流包装信息",
        )

    if not unit:
        if analysis["交叉校验状态"] == "数组与主单位冲突":
            conflicts.append("包装数组末端与主单位冲突，终端工段待确认")
            add_issue("高", "出货单位冲突", "终端", "包装规格单位1-4/主单位",
                      f"包装数组末端({analysis['数组末端单位']})与主单位({analysis['主单位']})不一致，不能自动选择装箱/大包/件装",
                      "确认最终出货单位并修复包装规格数组或主单位")
            nodes.append({
                "seq": 60, "stage": "终端待确认", "device": "待确认", "family": "终端包装",
                "spec": f"数组末端={analysis['数组末端单位'] or '?'}；主单位={analysis['主单位'] or '?'}",
                "status": "逻辑异常", "missing": ["最终出货单位确认"], "covered": "否", "gift": "",
            })
            add_board_hint(conflict_mode=True)
        else:
            add_issue("中", "包装形态待补", "终端", "包装规格单位1-4",
                      "主单位是计量单位，缺少包装数组时不能推断包装末端或板出", "补充包装规格单位和数量")
            nodes.append({
                "seq": 60, "stage": "终端待确认", "device": "待确认", "family": "终端包装",
                "spec": f"主单位={analysis['主单位'] or '?'}；包装数组未形成有效末端",
                "status": "待补MDM", "missing": ["包装规格单位1-4"], "covered": "否", "gift": "",
            })
    elif unit in MIDDLE_PACK_UNITS:
        if not any(n["stage"] == "中包" for n in nodes):
            conflicts.append(f"包装数组末端为{unit}，但路线未形成中包节点")
            add_issue("高", "包装层级与路线冲突", "中包", "包装规格单位1-4/中包包装方式",
                      "包装数组指向中包层级，但工艺路线没有中包节点", "核对中包包装方式与包装数组")
        add_board_hint()
    elif unit in PRIMARY_PACK_UNITS:
        if not any(n["stage"] in {"小包", "纸盒"} for n in nodes):
            conflicts.append(f"包装数组末端为{unit}，但路线未形成首次包装节点")
            add_issue("高", "包装层级与路线冲突", "小包", "包装规格单位1-4",
                      "包装数组指向首次包装层级，但工艺路线没有小包/纸盒节点", "核对小包或纸盒包装字段")
        add_board_hint()
    elif unit == "件":
        nodes.append({
            "seq": 60, "stage": "件装末端", "device": "待定义", "family": "件装",
            "spec": "包装数组明确形成件；不据此推断叠板",
            "status": "待补设备规则", "missing": ["件装工段定义"], "covered": "否", "gift": "",
        })
        add_issue("中", "叠板口径待确认", "件装末端", "最终包装方式",
                  "仅能确认最终形成件，不能仅凭件判断实际为叠板", "补充最终包装方式或明确件装到叠板的转换规则")
    elif unit in {"箱", "袋"}:
        t_stage, t_dev = TERMINAL_MAP[unit]
        t_miss = []
        t_method = ""
        t_cov = True
        if t_stage == "装箱":
            t_method = text(record.get("装箱方式"))
            if is_blank_or_no(t_method):
                t_miss.append("装箱方式")
            t_cov = category in {"卫卷", "面巾", "餐巾"}
        elif t_stage == "大包":
            t_method = "外袋"
            t_cov = category in {"卫卷", "纸巾", "餐巾"}
        for fld, val in [("长(外包装)", tl), ("宽(外包装)", tw), ("高(外包装)", th)]:
            if val is None:
                t_miss.append(fld)
        if t_qty is None:
            t_miss.append("最终包装装量")
        append_node(60, t_stage, t_dev, t_method or t_stage,
                    f"方式={t_method or '?'}；尺寸={fmt_num(tl)}×{fmt_num(tw)}×{fmt_num(th)}mm",
                    t_miss, covered_override=t_cov)
        add_board_hint()
    else:
        conflicts.append(f"包装终端单位“{unit}”未建立工段映射")
        add_issue("高", "包装终端单位未映射", "终端", "包装规格单位1-4",
                  f"包装单位“{unit}”尚未映射到小包/中包/大包/装箱工段", "补充包装单位到工段的映射")
        add_board_hint()

    # 7. 加赠位置挂接
    raw_gift = text(record.get("加赠位置"))
    if not is_blank_or_no(raw_gift):
        targets = []
        if "中包" in raw_gift or "中提" in raw_gift:
            targets.append("中包")
        if "箱" in raw_gift or "袋" in raw_gift:
            term_cands = [n for n in nodes if n["stage"] in {"装箱", "大包"}]
            if term_cands:
                targets.append(term_cands[-1]["stage"])
            else:
                conflicts.append("加赠位置指向箱/袋，但路线未形成装箱或大包节点")
                add_issue("高", "加赠位置与路线冲突", "加赠", "加赠位置",
                          "加赠位置为箱/袋，但终端工段不是装箱或大包", "核对包装数组、主单位和加赠位置")
        if not targets:
            conflicts.append(f"加赠位置“{raw_gift}”无法映射到包装工段")
            add_issue("高", "加赠位置未识别", "加赠", "加赠位置",
                      "无法将加赠位置映射到中包/装箱/大包", "补充加赠位置枚举映射")
        for target in dict.fromkeys(targets):
            node = next((n for n in nodes if n["stage"] == target), None)
            if node is None:
                conflicts.append(f"加赠位置要求{target}，但路线没有{target}节点")
                add_issue("高", "加赠位置与路线冲突", target, "加赠位置",
                          f"加赠位置要求{target}，但包装路线未生成该节点", "核对包装路线或加赠位置")
                continue
            node["gift"] = "加赠"
            node["spec"] += f"；加赠位置={raw_gift}"
            if target in {"装箱", "大包"}:
                node["covered"] = "部分"
                if node["status"] == "完整":
                    node["status"] = "待补设备规则"
                elif node["status"] == "待补MDM":
                    node["status"] = "待补MDM+设备规则"
                add_issue("中", "加赠设备规则未覆盖", target, "是否可以加赠",
                          f"现有规则未在{target}设备维护加赠能力校验", f"在{target}设备台账增加是否可以加赠及加赠类型")

    # 8. 汇总路线字符串与整体状态
    route_labels = [n["stage"] + ("（加赠）" if n.get("gift") == "加赠" else "") for n in nodes]
    missing_all = []
    uncovered_all = []
    for n in nodes:
        for fld in n["missing"]:
            missing_all.append(f"{n['stage']}.{fld}")
        if n["covered"] != "是":
            uncovered_all.append(n["stage"])
    missing_all = list(dict.fromkeys(missing_all))
    uncovered_all = list(dict.fromkeys(uncovered_all))
    conflicts = list(dict.fromkeys(conflicts))

    if conflicts or any(n["status"] == "逻辑异常" for n in nodes):
        overall = "逻辑异常"
    elif missing_all and uncovered_all:
        overall = "待补MDM+设备规则"
    elif missing_all:
        overall = "待补MDM"
    elif uncovered_all:
        overall = "待补设备规则"
    else:
        overall = "完整"

    complete_cnt = sum(1 for n in nodes if n["status"] == "完整")
    return {
        "inScope": True,
        "category": category,
        "route": " → ".join(route_labels),
        "routeStatus": overall,
        "routeMissing": "；".join(missing_all),
        "routeNodes": f"{complete_cnt}/{len(nodes)}" if nodes else "",
        "crossStatus": analysis["交叉校验状态"],
        "issues": issues,
        "nodes": nodes,
    }
