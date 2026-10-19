"""Frozen original checks: regression oracle only."""
import re
import build_mdm_snapshot as bms
PDF_NA_TXT = {"无", "无要求", "无节距", "不适用", "n/a", "na", "N/A", "-", "—", "/"}
# 纸长/纸宽互换嫌疑：这些是典型"纸长"值，出现在纸宽即疑似填反（PDF 规则 7.3）
SWAP_WIDTHS = {105, 120, 133, 153, 160, 187, 189}
# 规则 7 适用品类三级（面巾类、纸巾/纸手帕、餐巾、湿巾、口罩、生活用垫纸；非卷类、非组合）
PAPER_CATS = {
    "面巾", "软抽", "乳霜软抽", "悬挂式软抽", "抽取多用纸抹布", "悬挂式多用纸抹布",
    "公用擦手纸", "悬挂式公用擦手纸", "纸巾", "纸巾便携式", "餐巾",
    "生活用纸湿巾", "婴儿护理湿巾", "成人护理湿巾", "女性护理湿巾", "口罩", "生活用垫纸",
}
# 规则 7.3 互换检查的库存类别前缀（常规软抽、面巾）
SWAP_STOCK_PREFIX = ("成品.面巾.软抽", "成品.面巾.面巾")
# 规则 9 排除的护理类品类三级
CARE_CATS = {
    "个护产品", "卫生巾", "卫生护垫", "卫生棉条", "女性护肤用品", "婴儿护肤用品", "婴儿纸尿片",
    "婴儿纸尿裤", "婴儿裤型纸尿裤", "常规内裤", "成人尿渗护垫", "成人护理垫", "成人护肤用品",
    "成人纸尿片", "成人纸尿裤", "成人裤型纸尿裤", "日抛内裤", "裤型卫生巾",
}
# 规则 9：查张/片数的品类（餐巾、湿巾、纸巾）
SHEET_CATS = {"餐巾", "纸巾", "纸巾便携式"}
# 规则 9：查抽(张)/包(盒)的面巾类（不含卷装类——那些属卷类已排除）
TISSUE_CATS = {
    "面巾", "软抽", "乳霜软抽", "悬挂式软抽", "抽取多用纸抹布", "悬挂式多用纸抹布",
    "公用擦手纸", "悬挂式公用擦手纸",
}
# 规则 10 适用范围：四规则品类 + 湿巾
ROLLP_RULE_CATS = {"面巾", "卫卷", "纸巾", "餐巾"}
# PDF 标记 → 报表列名 → schema key（供前端"关联异常"按字段反查）
FLAG_FIELD_TO_KEY = {
    "净重": "net", "毛重": "gross", "不含赠品净重": "netNG", "成品定量": "quant",
    "不含液成品净重": "wetNet", "小卷/包净重": "rollNet", "小卷/包毛重": "rollGross",
}


def pdf_clean(value):
    """clean + PDF 口径的"无要求/不适用"归一（这类文本视为未维护，不参与非数字判定）。

    兼容全角/半角括号包裹的写法，如"（无节距）""(无要求)"。
    """
    v = bms.clean(value)
    if v is None:
        return None
    s = str(v).strip().strip("（）()").strip()
    return None if s in PDF_NA_TXT else v


def pdf_number(value):
    v = pdf_clean(value)
    return None if v is None else bms.number(v)


def pdf_junk(value) -> bool:
    """非空、非 NA 标记、且完全不含数字 → 判定为"非数字"垃圾值（如"待定"）。"""
    v = pdf_clean(value)
    if v is None:
        return False
    return re.search(r"\d", str(v)) is None


def is_wet_scope(cat3: str, stock_cat: str) -> bool:
    """湿巾范围：品类三级含"湿巾"，或库存类别为 成品.湿纸巾。"""
    return "湿巾" in cat3 or "湿纸巾" in stock_cat


def is_roll_scope(stock_cat: str) -> bool:
    """卷类范围：库存类别含卫卷，排除方块。"""
    return "卫卷" in stock_cat and "方块" not in stock_cat


def in_pdf_scope(raw: dict) -> bool:
    """PDF 规则总范围：仅有效物料（无效/停产物料不纳入工艺属性检查）；排除进口品（成品类型含"进口"）与 1900 开头物料编码。"""
    if str(bms.clean(raw.get("物料状态")) or "") != "有效":
        return False
    pt = str(bms.clean(raw.get("成品类型")) or "")
    m = str(bms.clean(raw.get("物料编码")) or "")
    return "进口" not in pt and not m.startswith("1900")


def check_pdf_rules(raw: dict, cat3: str, stock_cat: str, spec_p, rule_cat: str, load_v):
    """按 示例校验规范执行 11 类工艺属性检查。

    返回 (flags, rule_hits, block_hits)：
    - flags: ["PFM:2:不含赠品净重", ...]（CODE:规则号:字段或矛盾描述）
    - rule_hits: 命中的规则号集合
    - block_hits: 命中高严重度（PFN/PFC）的规则号集合
    """
    flags: list[str] = []
    rule_hits: set[int] = set()
    block_hits: set[int] = set()

    def add(code: str, rule: int, field: str, blocking: bool = False):
        flags.append(f"{code}:{rule}:{field}")
        rule_hits.add(rule)
        if blocking:
            block_hits.add(rule)

    def num_field(rule: int, field: str, value, require_pos: bool = False):
        """数值字段通用判定：空→PFM；垃圾值→PFN；≤0（可选）→PFN。返回解析值或 None。"""
        v = pdf_clean(value)
        if v is None:
            add("PFM", rule, field)
            return None
        if pdf_junk(value):
            add("PFN", rule, field, blocking=True)
            return None
        n = bms.number(v)
        if n is None:  # 带单位/复合表达式（如 138mm、7x27s）——不算非数字，但不参与数值比较
            return None
        if require_pos and n <= 0:
            add("PFN", rule, field, blocking=True)
            return None
        return n

    # ---- 规则 1 电商一致性 ----
    if pdf_clean(raw.get("是否电商")) == "是":
        if not any(pdf_clean(raw.get(f)) is not None for f in
                   ("基准条码", "外包装条形码（选择组织）", "小包/袋/盒产品条码", "手抽/中袋条形码")):
            add("PFI", 1, "条码缺失")

    # ---- 规则 2 净重/不含赠品净重/毛重 ----
    net = pdf_number(raw.get("净重"))
    ng = pdf_number(raw.get("不含赠品净重"))
    gross = pdf_number(raw.get("毛重"))
    if pdf_clean(raw.get("净重")) is None:
        add("PFM", 2, "净重")
    elif pdf_junk(raw.get("净重")):
        add("PFN", 2, "净重", blocking=True)
    if pdf_clean(raw.get("不含赠品净重")) is None:
        add("PFM", 2, "不含赠品净重")
    elif pdf_junk(raw.get("不含赠品净重")):
        add("PFN", 2, "不含赠品净重", blocking=True)
    if pdf_clean(raw.get("毛重")) is None:
        add("PFM", 2, "毛重")
    elif pdf_junk(raw.get("毛重")):
        add("PFN", 2, "毛重", blocking=True)
    if ng is not None and net is not None and ng > net + 1e-9:
        add("PFC", 2, "不含赠品净重>净重", blocking=True)
    if net is not None and gross is not None and net >= gross - 1e-9:
        add("PFC", 2, "净重≥毛重", blocking=True)
    if ng is not None and ng <= 0:
        add("PFC", 2, "不含赠品净重≤0", blocking=True)
    if gross is not None and gross <= 0:
        add("PFC", 2, "毛重≤0", blocking=True)

    # ---- 规则 3 成品定量（排除制造类别=其他）----
    make_cat = str(bms.clean(raw.get("制造类别")) or "")
    if make_cat != "其他":
        num_field(3, "成品定量", raw.get("成品定量"), require_pos=True)

    # ---- 规则 4 不含液成品净重 ----
    wet = is_wet_scope(cat3, stock_cat)
    wet_combo = wet and ("组合" in stock_cat or str(bms.clean(raw.get("是否组合装")) or "") == "是")
    wn = pdf_number(raw.get("不含液成品净重（kg）"))
    if wet and not wet_combo:
        if pdf_clean(raw.get("不含液成品净重（kg）")) is None:
            add("PFM", 4, "不含液成品净重")
        elif pdf_junk(raw.get("不含液成品净重（kg）")):
            add("PFN", 4, "不含液成品净重", blocking=True)
        if wn is not None:
            if wn <= 0:
                add("PFC", 4, "不含液成品净重≤0", blocking=True)
            if net is not None and wn >= net - 1e-9:
                add("PFC", 4, "不含液成品净重≥净重", blocking=True)
            if ng is not None and wn >= ng - 1e-9:
                add("PFC", 4, "不含液成品净重≥不含赠品净重", blocking=True)
    elif not wet and pdf_clean(raw.get("不含液成品净重（kg）")) is not None:
        # 规范要求非湿巾为空；MDM 尚未屏蔽其他品类填写（排期优化中），仅提示不阻断
        add("PFI", 4, "非湿巾已填不含液净重")

    # ---- 规则 5 节距/卷高（卫卷非方块）----
    if is_roll_scope(stock_cat):
        num_field(5, "节距", raw.get("节距"))
        num_field(5, "卷高", raw.get("卷高"))

    # ---- 规则 6 节数/米数/净含量/毛重每卷（卫卷标准品，按名称触发 >0 校验）----
    if is_roll_scope(stock_cat):
        std = str(bms.clean(raw.get("标准/迷你")) or "")
        if std == "" or std.startswith("标准"):
            desc = str(bms.clean(raw.get("物料说明")) or "")
            if re.search(r"毛重[：:]?\s*\d+(?:\.\d+)?\s*[克g]", desc):
                num_field(6, "毛重/卷", raw.get("毛重/卷"), require_pos=True)
            if "克" in desc:
                num_field(6, "净含量", raw.get("净含量"), require_pos=True)
            if "节数" in desc:
                num_field(6, "节数", raw.get("节数"), require_pos=True)
            if "米数" in desc:
                num_field(6, "米数", raw.get("米数"), require_pos=True)

    # ---- 规则 7 纸长/纸宽 ----
    if cat3 in PAPER_CATS and not is_roll_scope(stock_cat):
        combo = "组合" in stock_cat or str(bms.clean(raw.get("是否组合装")) or "") == "是"
        if not combo:
            pl = num_field(7, "纸长", raw.get("纸长"))
            pw = num_field(7, "纸宽", raw.get("纸宽"))
            if pl is not None and pl <= 0:
                add("PFC", 7, "纸长≤0", blocking=True)
            if pw is not None and pw <= 0:
                add("PFC", 7, "纸宽≤0", blocking=True)
            if stock_cat.startswith(SWAP_STOCK_PREFIX):
                pwr = pdf_clean(raw.get("纸宽"))
                if pwr is not None:
                    try:
                        if float(str(pwr)) in SWAP_WIDTHS:
                            add("PFC", 7, "纸长纸宽疑似互换", blocking=True)
                    except (TypeError, ValueError):
                        pass

    # ---- 规则 9 抽(张)/包(盒)、张/片数 ----
    if cat3 not in CARE_CATS and not is_roll_scope(stock_cat) and cat3 not in ("口罩", "生活用垫纸"):
        wet_combo9 = is_wet_scope(cat3, stock_cat) and (
            "组合" in stock_cat or str(bms.clean(raw.get("是否组合装")) or "") == "是")
        if not wet_combo9:
            if cat3 in SHEET_CATS or is_wet_scope(cat3, stock_cat):
                num_field(9, "张/片数", raw.get("张/片数"))
            elif cat3 in TISSUE_CATS:
                num_field(9, "抽(张)/包(盒)", raw.get("抽(张)/包(盒)"))

    # ---- 规则 10 小卷/包净重、小卷/包毛重（四品类+湿巾）----
    if rule_cat in ROLLP_RULE_CATS or is_wet_scope(cat3, stock_cat):
        rn = num_field(10, "小卷/包净重", raw.get("小卷/包净重(g)"))
        rg = num_field(10, "小卷/包毛重", raw.get("小卷/包毛重(g)"))
        if rn is not None and rg is not None and rn >= rg - 1e-9:
            add("PFC", 10, "小卷/包净重≥小卷/包毛重", blocking=True)
        # 除湿巾、餐巾外：小卷/包净重(g) × 装数 = 不含赠品净重(kg)×1000（2% 容差）
        if rn is not None and ng is not None and load_v and not is_wet_scope(cat3, stock_cat) and cat3 != "餐巾":
            expect = rn * load_v
            actual = ng * 1000
            if abs(expect - actual) > max(1.0, abs(actual) * 0.02):
                add("PFP", 10, "小卷/包净重×装数≠不含赠品净重")

    # ---- 规则 11 pian 校验（包装单位含 pian/片 时 pian数量×规格乘积=1）----
    has_pian_unit = any(
        "pian" in str(bms.clean(raw.get(f"包装规格单位{lv}")) or "").lower()
        or "片" in str(bms.clean(raw.get(f"包装规格单位{lv}")) or "")
        for lv in range(1, 5)
    )
    if has_pian_unit:
        pv = pdf_number(raw.get("pian数量"))
        if pv is None:
            if pdf_clean(raw.get("pian数量")) is None:
                add("PFM", 11, "pian数量")
        elif spec_p:
            if abs(pv * spec_p - 1) > max(0.5, abs(spec_p) * 1e-6):
                add("PFP", 11, "pian数量与规格乘积不符")

    return flags, rule_hits, block_hits
