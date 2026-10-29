"""同 V 码冲突：先限定参与物料，再比较原始装数与有序规格表达式。"""
from collections import defaultdict

RULE_DESCRIPTION = "剔除新品类型=内部周转及预失效=X、F后，以原始装数 + 物料规格乘积表达式识别同V码多规格；保留乘法因子顺序，1×10×6 与 10×6 等同、1×6×10 不同。"


def eligible(vcode, pre=None, new_product_type=None):
    return (bool(str(vcode or "").strip())
            and str(pre or "").strip().upper() not in {"X", "F"}
            and str(new_product_type or "").strip() != "内部周转")


def rebuild_vcode_conflicts(records):
    """仅更新冲突标记、异常标记和异常数，不改源字段或其他校验结果。"""
    by_vcode = defaultdict(list)
    for row in records:
        row["vconf"] = 0
        row["flags"] = "|".join(flag for flag in str(row.get("flags") or "").split("|") if flag and flag != "VCONF")
        if eligible(row.get("vcode"), row.get("pre"), row.get("npt")):
            by_vcode[row["vcode"]].append(row)
    groups = []
    for vcode, members in by_vcode.items():
        signatures = {(row.get("load"), row.get("specC") or "") for row in members}
        if len(signatures) < 2:
            continue
        for row in members:
            row["vconf"] = 1
            row["flags"] = (row["flags"] + "|VCONF").strip("|")
        groups.append({"vcode": vcode, "materialCount": len(members), "specCount": len(signatures),
                       "specs": [[row["material"], row.get("load"), row.get("specC") or "", str(row.get("desc") or "")[:40]] for row in members[:8]]})
    for row in records:
        row["issueCount"] = len(row["flags"].split("|")) if row["flags"] else 0
    return sorted(groups, key=lambda group: -group["materialCount"])


def refresh_dataset_conflicts(dataset):
    """为已导入的快照重算派生结果，保留原物料、规则配置和来源信息。"""
    keys = [field["key"] for field in dataset["schema"]]
    records = [dict(zip(keys, row)) for row in dataset["rows"]]
    old_count = sum("VCONF" in str(row.get("flags") or "").split("|") for row in records)
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
