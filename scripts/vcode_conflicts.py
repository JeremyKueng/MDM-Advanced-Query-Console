"""同 V 码冲突：先限定参与物料，再比较原始装数与有序规格表达式。"""
from collections import defaultdict
import re
import unicodedata

RULE_DESCRIPTION = "先筛选并剔除新品类型=内部周转及预失效=X、F，再以原始装数 + 有序规格识别同V码差异，区分不同装数、同装数不同排列；仅装数相同、规格因子换序且每条物料说明的可比装数写法一致时降为待确认，保留原始值与判断依据。"


def spec_factors(value):
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    if not re.fullmatch(r"\d+(?:\.\d+)?(?:\s*[xX×*✕]\s*\d+(?:\.\d+)?)*", text):
        return None
    factors = [float(n) for n in re.split(r"\s*[xX×*✕]\s*", text)]
    while len(factors) > 1 and factors[0] == 1:
        factors.pop(0)
    return factors if all(n > 0 for n in factors) else None


def factor_text(factors):
    return "×".join(format(n, ".15g") for n in factors)


def description_specs(description, factors):
    """只取与本组规格因子完全对应的连续乘法串，避免把尺寸当成装数。"""
    text = unicodedata.normalize("NFKC", str(description or ""))
    matches = re.finditer(r"\d+(?:\.\d+)?(?:\s*[xX×*✕]\s*\d+(?:\.\d+)?)+", text)
    result = {}
    for match in matches:
        start, end = match.span()
        # 不截取加法、括号乘法或尺寸单位表达式的一部分。
        if (re.search(r"[\d.+xX×*✕]\s*$", text[:start])
                or re.match(r"\s*(?:[.\d+xX×*✕]|mm|cm|米|毫米|厘米)", text[end:], re.I)
                or re.search(r"\)\s*[xX×*✕]\s*$", text[:start])
                or re.match(r"\s*\)\s*[xX×*✕]", text[end:])):
            continue
        parsed = spec_factors(match.group())
        if parsed and sorted(parsed) == sorted(factors):
            result[factor_text(parsed)] = match.group()
    return result


def classify_conflict(members):
    loads = {row.get("load") for row in members}
    result = {"conflictType": "不同装数" if len(loads) > 1 else "同装数不同排列",
              "reviewStatus": "规格冲突", "reviewReason": "原始装数不同", "descriptionSpecs": {}}
    if len(loads) > 1:
        return result
    parsed = [spec_factors(row.get("specC")) for row in members]
    if (not parsed or any(not f for f in parsed)
            or any(sorted(f) != sorted(parsed[0]) for f in parsed)):
        result["reviewReason"] = "规格差异不只是相同因子换序，保留核查"
        return result
    load = members[0].get("load")
    product = 1
    for n in parsed[0]:
        product *= n
    if not isinstance(load, (int, float)) or load <= 0 or abs(product - load) > max(1e-6, abs(load) * 1e-9):
        result["reviewReason"] = "装数缺失或规格乘积与装数不一致，保留核查"
        return result
    orientations = set()
    complete = True
    for row in members:
        evidence = description_specs(row.get("desc"), parsed[0])
        result["descriptionSpecs"][row["material"]] = "；".join(evidence)
        complete = complete and len(evidence) == 1
        orientations.update(evidence)
    if complete and len(orientations) == 1:
        result.update(reviewStatus="待确认", reviewReason="装数相同、规格因子仅换序；物料说明均为 " + next(iter(orientations)) + "，疑似规格填写顺序不一致")
    elif len(orientations) > 1:
        result["reviewReason"] = "物料说明的装数写法不一致或存在多个可比表达式，保留核查"
    else:
        result["reviewReason"] = "部分物料说明缺少明确的可比装数，保留核查"
    return result


def eligible(vcode, pre=None, new_product_type=None):
    return (bool(str(vcode or "").strip())
            and str(pre or "").strip().upper() not in {"X", "F"}
            and str(new_product_type or "").strip() != "内部周转")


def rebuild_vcode_conflicts(records):
    """仅更新冲突标记、异常标记和异常数，不改源字段或其他校验结果。"""
    by_vcode = defaultdict(list)
    for row in records:
        row["vconf"] = 0
        row["flags"] = "|".join(flag for flag in str(row.get("flags") or "").split("|") if flag and flag not in {"VCONF", "VREVIEW"})
        if eligible(row.get("vcode"), row.get("pre"), row.get("npt")):
            by_vcode[row["vcode"]].append(row)
    groups = []
    for vcode, members in by_vcode.items():
        signatures = {(row.get("load"), row.get("specC") or "") for row in members}
        if len(signatures) < 2:
            continue
        assessment = classify_conflict(members)
        for row in members:
            row["vconf"] = 1
            row["flags"] = (row["flags"] + ("|VREVIEW" if assessment["reviewStatus"] == "待确认" else "|VCONF")).strip("|")
        groups.append({"vcode": vcode, "materialCount": len(members), "specCount": len(signatures),
                       **assessment,
                       "specs": [[row["material"], row.get("load"), row.get("specC") or "", str(row.get("desc") or "")[:40]] for row in members[:8]]})
    for row in records:
        row["issueCount"] = len(row["flags"].split("|")) if row["flags"] else 0
    return sorted(groups, key=lambda group: -group["materialCount"])


def refresh_dataset_conflicts(dataset):
    """为已导入的快照重算派生结果，保留原物料、规则配置和来源信息。"""
    keys = [field["key"] for field in dataset["schema"]]
    records = [dict(zip(keys, row)) for row in dataset["rows"]]
    old_count = sum(bool({"VCONF", "VREVIEW"} & set(str(row.get("flags") or "").split("|"))) for row in records)
    dataset["vconf"] = rebuild_vcode_conflicts(records)[:200]
    indices = {key: keys.index(key) for key in ("vconf", "flags", "issueCount")}
    for values, row in zip(dataset["rows"], records):
        for key, index in indices.items():
            values[index] = row[key]
    counts = dataset.get("meta", {}).get("govCounts", {})
    if "packaging" in counts:
        counts["packaging"] += sum(row["vconf"] for row in records) - old_count
    for rule in dataset.get("rules", []):
        if rule.get("id") == "vcode":
            rule["desc"] = RULE_DESCRIPTION
    return dataset
