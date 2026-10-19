"""Verify a source/demo release before pushing it; rejects imported production records."""
import base64
import gzip
from html import unescape
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[1]

def check():
    result=subprocess.run(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT,check=True,stdout=subprocess.PIPE)
    paths=sorted(set(p.decode() for p in result.stdout.split(b'\0') if p))
    denied=[]
    private=re.compile(r'/Use' r'rs/[^/\s]+/|/ho' r'me/[^/\s]+/|(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?!\d)')
    secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{25,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{30,}')
    for name in paths:
        path=ROOT/name
        if path.is_symlink() or not path.is_file():denied.append(name);continue
        if any(part in {'reports','.workbuddy','uploaded','node_modules'} for part in path.relative_to(ROOT).parts):denied.append(name)
        if path.suffix.lower() in {'.xlsx','.xls','.csv','.pdf','.png','.jpg','.jpeg'}:
            if name not in {'examples/materials-demo.xlsx','docs/demo.png'}:denied.append(name)
            continue
        try: text=path.read_text()
        except UnicodeDecodeError:denied.append(name);continue
        if private.search(text) or secret.search(text):denied.append(name)
    if denied:raise SystemExit('Release check failed for: '+', '.join(sorted(set(denied))))
    raw=(ROOT/'outputs/advq/dataset.json').read_bytes();data=json.loads(raw)
    packed=(ROOT/'outputs/advq/dataset.b64').read_text().strip()
    assert gzip.decompress(base64.b64decode(packed))==raw,'Compressed and JSON datasets differ'
    html=(ROOT/'outputs/MDM高级查询工作台.html').read_text()
    matches=re.findall(r'const DATASET_B64 = "([A-Za-z0-9+/=]+)";',html)
    assert matches==[packed],'HTML must contain exactly the verified demo dataset'
    assert data['meta']['sourceMode']=='完全虚构演示数据','Regenerate the demo before publishing'
    assert data['meta']['sourcePath']=='examples/materials-demo.xlsx'
    assert not data['meta']['shareUnc']
    names=[s['key'] for s in data['schema']]
    for values in data['rows']:
        row=dict(zip(names,values))
        assert re.fullmatch(r'9900\d{6}',row['material']), 'Unexpected material identifier'
        assert row['vcode'].startswith('DEMO-V')
        assert row['desc'].startswith('演示数据 ')
        assert row['brand'].startswith('示例品牌')
        assert row.get('申请人','').startswith('演示用户')
        assert row.get('部门','').startswith('演示部门')
        for k,v in row.items():
            if '条码' in k or '条形码' in k:
                assert v in (None,'') or str(v).startswith('DEMO-BC-'), 'Unexpected barcode'
    with zipfile.ZipFile(ROOT/'examples/materials-demo.xlsx') as book:
        xml=unescape('\n'.join(book.read(n).decode() for n in book.namelist() if n.endswith('.xml')))
        assert not private.search(xml) and not secret.search(xml),'Unexpected Excel metadata'
        assert '演示数据' in xml and 'Demo' in xml
    print(f'PASS: {len(paths)} release files; {len(data["rows"])} fictional records; Excel, gzip/base64 and HTML checked.')

if __name__=='__main__':check()
