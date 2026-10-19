"""工艺属性声明式规则：条件树与安全四则运算，不执行用户代码。"""
import json
from datetime import date
import math
import re
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parents[1] / 'outputs/advq/process-rules.defaults.json'
NA = {'无', '无要求', '无节距', '不适用', 'n/a', 'na', 'N/A', '-', '—', '/'}
CODES = {'PFM', 'PFN', 'PFC', 'PFI', 'PFP'}
OPS = {'empty', 'notEmpty', 'junk', 'nonzero', 'eq', 'neq', 'contains', 'notContains', 'icontains', 'prefix', 'notPrefix', 'in', 'notIn', 'numberIn', 'gt', 'gte', 'lt', 'lte', 'grossName', 'difference', 'between'}


def defaults():
    return json.loads(DEFAULT_PATH.read_text(encoding='utf-8'))


def clean(value):
    if value is None or isinstance(value, float) and not math.isfinite(value): return None
    text = str(value).strip()
    return None if not text or text.strip('（）()').strip() in NA else value if not isinstance(value, str) else text


def number(value):
    value = clean(value)
    if value is None: return None
    try:
        n = float(str(value).replace(',', ''))
        return n if math.isfinite(n) else None
    except (TypeError, ValueError): return None


DATE_FIELDS = {'创建时间', '最后更新时间'}
def iso_date(value):
    text = str(value or '').strip()
    found = re.match(r'^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[ T])', text) or re.match(r'^(\d{4})(\d{2})(\d{2})$', text)
    if not found: return ''
    try: return date(*map(int,found.groups())).isoformat()
    except ValueError: return ''


def expression(source, known=None):
    """Parse into a small AST; only fields, finite constants and + - * / parentheses."""
    if not isinstance(source, str) or not source.strip() or len(source) > 300: raise ValueError('计算式为空或过长')
    tokens = re.findall(r'\[[^\[\]]+\]|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[()+*/-]|\S', source)
    pos = 0
    def parse(minimum=0):
        nonlocal pos
        if pos >= len(tokens): raise ValueError('计算式不完整')
        token = tokens[pos]; pos += 1
        if token in ('+', '-'):
            node = ('unary', token, parse(3))
        elif token == '(':
            node = parse()
            if pos >= len(tokens) or tokens[pos] != ')': raise ValueError('计算式括号未闭合')
            pos += 1
        elif token.startswith('['):
            key = token[1:-1]
            if known is not None and key not in known: raise ValueError('未知计算字段：' + key)
            node = ('field', key)
        else:
            try: value = float(token)
            except ValueError: raise ValueError('计算式只支持字段、数字和四则运算') from None
            if not math.isfinite(value): raise ValueError('计算式数字必须有限')
            node = ('number', value)
        while pos < len(tokens) and tokens[pos] in ('+', '-', '*', '/'):
            op = tokens[pos]; prec = 2 if op in ('*', '/') else 1
            if prec < minimum: break
            pos += 1; node = ('binary', op, node, parse(prec + 1))
        return node
    result = parse()
    if pos != len(tokens): raise ValueError('计算式含未识别内容')
    return result


def calc(ast, row):
    if ast[0] == 'field': return number(row.get(ast[1]))
    if ast[0] == 'number': return ast[1]
    if ast[0] == 'unary':
        val = calc(ast[2], row)
        return None if val is None else -val if ast[1] == '-' else val
    left, right = calc(ast[2], row), calc(ast[3], row)
    if left is None or right is None or ast[1] == '/' and right == 0: return None
    result = {'+': lambda: left + right, '-': lambda: left - right, '*': lambda: left * right, '/': lambda: left / right}[ast[1]]()
    return result if math.isfinite(result) else None


def compile_node(node):
    if 'logic' in node:
        items = [compile_node(c) for c in node['conditions']]
        if node['logic'] == 'NOT': return lambda r: not items[0](r)
        if node['logic'] == 'OR': return lambda r: any(c(r) for c in items)
        return lambda r: all(c(r) for c in items)
    op = node['op']; field = node.get('field', '')
    if op == 'difference':
        left, right = expression(node['left']), expression(node['right'])
        def diff(row):
            l, r = calc(left, row), calc(right, row)
            ref = number(row.get(node['reference'])) if node.get('reference') else r
            return l is not None and r is not None and ref is not None and abs(l-r) > max(float(node.get('absolute', 0)), abs(ref)*float(node.get('relative', 0)))
        return diff
    parts = [s.strip() for s in re.split(r'[、,，;；\n]', str(node.get('value', ''))) if s.strip()]
    def test(row):
        v = clean(row.get(field)); s = '' if v is None else str(v)
        value = node.get('value', ''); rhs = clean(row.get(node['otherField'])) if node.get('otherField') else value
        t = '' if rhs is None else str(rhs)
        if field in DATE_FIELDS and op in ('eq','neq','gt','gte','lt','lte','between'):
            left, right = iso_date(v), iso_date(rhs)
            if not left or not right: return False
            if op == 'between': return bool(iso_date(node.get('valueTo'))) and right <= left <= iso_date(node['valueTo'])
            return {'eq':lambda:left==right,'neq':lambda:left!=right,'gt':lambda:left>right,'gte':lambda:left>=right,'lt':lambda:left<right,'lte':lambda:left<=right}[op]()
        if op == 'empty': return v is None
        if op == 'notEmpty': return v is not None
        if op == 'junk': return v is not None and re.search(r'\d', s) is None
        if op == 'grossName': return re.search(r'毛重[：:]?\s*\d+(?:\.\d+)?\s*[克g]', s) is not None
        if op == 'eq': return s == t
        if op == 'neq': return s != t
        if op in ('contains', 'notContains', 'icontains'):
            found = t.lower() in s.lower() if op == 'icontains' else t in s
            return not found if op == 'notContains' else found
        if op in ('prefix', 'notPrefix'): return not s.startswith(t) if op == 'notPrefix' else s.startswith(t)
        items = [x.strip() for x in re.split(r'[、,，;；\n]',t) if x.strip()] if node.get('otherField') else parts
        if op in ('in', 'notIn'): return s not in items if op == 'notIn' else s in items
        n = number(v)
        if op == 'nonzero': return n is not None and n != 0
        if op == 'numberIn':
            try: return float(s) in [float(x) for x in items]
            except ValueError: return False
        other = number(rhs)
        if n is None or other is None: return False
        if op == 'between':
            to = number(node.get('valueTo'))
            return to is not None and other <= n <= to
        eps = float(node.get('epsilon', 0))
        return {'gt': lambda: n > other + eps, 'gte': lambda: n >= other-eps, 'lt': lambda: n < other-eps, 'lte': lambda: n <= other+eps}[op]()
    return test


def validate(config, known=None):
    if not isinstance(config, dict) or config.get('version') != 1 or not isinstance(config.get('rules'), list) or len(config['rules']) > 100: raise ValueError('工艺规则配置格式不正确（最多100组）')
    count = 0
    def node(c, depth=0):
        nonlocal count
        count += 1
        if count > 4000 or depth > 10 or not isinstance(c, dict): raise ValueError('规则条件过多或嵌套过深')
        if 'logic' in c:
            if c['logic'] not in ('AND', 'OR', 'NOT') or not isinstance(c.get('conditions'), list): raise ValueError('条件组合无效')
            if c['logic'] == 'NOT' and len(c['conditions']) != 1: raise ValueError('取反条件必须只有一个条件组')
            if c['logic'] == 'OR' and not c['conditions']: raise ValueError('任一条件组不能为空')
            for child in c['conditions']: node(child, depth+1)
            return
        op = c.get('op')
        if op not in OPS: raise ValueError('不支持的条件运算')
        if op == 'between' and c.get('otherField'): raise ValueError('区间请使用两个固定边界')
        if op == 'difference':
            expression(c.get('left'), known); expression(c.get('right'), known)
            for k in ('absolute','relative'):
                if type(c.get(k,0)) not in (int,float) or not math.isfinite(c.get(k,0)) or c.get(k,0) < 0: raise ValueError('容差必须为非负数字')
            if c.get('reference') and known is not None and c['reference'] not in known: raise ValueError('未知容差字段')
            return
        if not isinstance(c.get('field'),str) or not c['field'] or known is not None and c['field'] not in known: raise ValueError('请选择有效字段：'+str(c.get('field','')))
        if c.get('otherField') and known is not None and c['otherField'] not in known: raise ValueError('请选择有效比较字段')
        if type(c.get('epsilon',0)) not in (int,float) or not math.isfinite(c.get('epsilon',0)) or c.get('epsilon',0)<0: raise ValueError('数值精度无效')
        if op not in ('empty','notEmpty','junk','grossName','nonzero') and not c.get('otherField'):
            if str(c.get('value','')).strip() == '': raise ValueError('请填写条件值')
            if op in ('eq','neq','gt','gte','lt','lte','between') and c['field'] in DATE_FIELDS:
                if not iso_date(c.get('value')): raise ValueError('日期请输入完整的 YYYYMMDD 或 YYYY-MM-DD')
            elif op in ('gt','gte','lt','lte','between') and number(c.get('value')) is None: raise ValueError('大小比较必须填写数字')
            if op == 'between':
                convert = iso_date if c['field'] in DATE_FIELDS else number
                start, end = convert(c.get('value')), convert(c.get('valueTo'))
                if end is None or end == '' or start > end: raise ValueError('请填写完整且起止正确的区间')
            if op == 'numberIn' and any(number(x) is None for x in re.split(r'[、,，;；\n]', str(c['value']))): raise ValueError('可选数值列表含无效数字')
    node(config.get('scope'))
    ids=set(); nos=set()
    for rule in config['rules']:
        if not isinstance(rule,dict) or not isinstance(rule.get('id'),str) or not rule['id'] or rule['id'] in ids or type(rule.get('no')) is not int or rule['no']<=0 or rule['no'] in nos: raise ValueError('规则标识或编号无效/重复')
        ids.add(rule['id']);nos.add(rule['no'])
        if not isinstance(rule.get('title'),str) or not rule['title'].strip() or len(rule['title'])>100: raise ValueError('请填写规则名称（最多100字）')
        if type(rule.get('enabled')) is not bool or not isinstance(rule.get('checks'),list) or len(rule['checks'])>100: raise ValueError('规则检查项格式错误')
        node(rule.get('scope'))
        if rule['enabled'] and not any(x.get('enabled') for x in rule['checks'] if isinstance(x,dict)): raise ValueError('启用的规则至少需要一个启用检查项')
        cids=set()
        for check in rule['checks']:
            if not isinstance(check,dict) or not isinstance(check.get('id'),str) or not check['id'] or check['id'] in cids: raise ValueError('检查项标识重复或无效')
            cids.add(check['id'])
            if type(check.get('enabled')) is not bool or check.get('code') not in CODES: raise ValueError('检查项级别无效')
            if not isinstance(check.get('message'),str) or not check['message'].strip() or len(check['message'])>180 or any(x in check['message'] for x in '|:\n\r'): raise ValueError('问题提示须为1–180字，不能包含冒号、竖线或换行')
            node(check.get('when'))
    return config


def compile_config(config):
    scope = compile_node(config['scope'])
    rules = [(r['no'], compile_node(r['scope']), [(c['code'],c['message'],compile_node(c['when'])) for c in r['checks'] if c['enabled']]) for r in config['rules'] if r['enabled']]
    def run(row):
        if not scope(row): return [],set(),set()
        flags=[]; hits=set(); blocks=set()
        for no, applies, checks in rules:
            if not applies(row): continue
            for code,message,test in checks:
                if test(row):
                    flag=f'{code}:{no}:{message}'
                    if flag not in flags: flags.append(flag)
                    hits.add(no)
                    if code in ('PFN','PFC'): blocks.add(no)
        return flags,hits,blocks
    return run


def describe(node):
    if 'logic' in node:
        parts = [describe(c) for c in node['conditions']]
        return ('不满足：' if node['logic'] == 'NOT' else '') + (' 或 ' if node['logic'] == 'OR' else ' 且 ').join(parts) if parts else '全部物料'
    if node['op'] == 'difference':
        return node['left'] + ' 与 ' + node['right'] + ' 差异超出容差'
    return node.get('field','') + ' ' + node['op'] + ' ' + str(node.get('otherField',node.get('value','')))
