"""Generate wholly fictional demo records, their Excel source and the standalone workbench."""
from __future__ import annotations
import base64
from datetime import datetime
import gzip
import json
import os
from pathlib import Path
import tempfile
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DEMO_BRANDS = ['示例品牌13', '示例品牌B', '示例品牌C']

def generate(count=192):
    import build_adv_query_dataset as build
    categories = ['软抽', '面巾', '有芯卫生卷纸', '纸巾', '餐巾', '生活用纸湿巾', '成人纸尿裤', '分配器']
    headers = list(dict.fromkeys([s[4] for s in build.SCHEMA if s[4]] + build.MDM_FIELDS))
    book = openpyxl.Workbook(); sheet = book.active; sheet.title = '演示物料'
    book.properties.creator = 'Demo'; book.properties.lastModifiedBy = 'Demo'
    book.properties.created = datetime(2026, 1, 1); book.properties.modified = datetime(2026, 1, 1)
    sheet.append(headers)
    for i in range(count):
        cat = categories[i % len(categories)]; wet = cat == '生活用纸湿巾'; roll = cat == '有芯卫生卷纸'
        load = 12 + (i % 3) * 6; net = round(4.8 + (i % 5) * .6, 3)
        brand = DEMO_BRANDS[i % len(DEMO_BRANDS)]; code = str(9900000001 + i)
        spec = '1×3×' + str(load // 3)
        label = f'演示数据 {brand} {cat} {i + 1:03d} {spec}'
        if i % 4 == 0: label += ' 样例渠道'
        if i % 7 == 0: label += ' 示例商店'
        record = dict.fromkeys(headers)
        record.update({'物料编码':code,'V码':f'DEMO-V{i // 3 + 1:04d}','物料说明':label,'物料说明（繁体）':label,
            '物料说明（英文）':f'Fictional demo material {i+1:03d}', '产品描述':'完全虚构的功能演示记录',
            '物料状态':'无效' if i % 17 == 0 else '有效','预失效':['Y','Y','Y','N','X','F'][i%6],
            '品牌':brand,'产品系列':'演示系列'+str(i%3+1),'品类三级':cat,'库存小类':('卫卷' if roll else '湿巾' if wet else '面巾' if cat in ['面巾','软抽'] else cat)+'.演示',
            '物料库存类别':('成品.卫卷' if roll else '成品.湿巾' if wet else '成品.'+cat),
            '配方大类':'湿巾' if wet else '护理' if cat in ['成人纸尿裤','分配器'] else '干巾',
            '主单位':'箱','制造类别':'LDC','品类一级':'演示日用品','品类二级':'卷类' if roll else '非卷',
            '品类四级':'演示细类','申请人':f'演示用户{i%5+1:02d}','部门':'演示部门'+str(i%3+1),
            '成品类型':'演示自产','产品来源':'演示生成器','新品类型':'演示产品','是否电商':'是' if i%2 else '否',
            '是否组合装':'否','是否OEM':'否','物料规格':spec,'原始装数':load,'净重':net,'不含赠品净重':net,'毛重':net+.4,
            '不含液成品净重（kg）':net*.4 if wet else None,'小卷/包净重(g)':round(net*1000/load,3),
            '小卷/包毛重(g)':round(net*1000/load+4,3),'成品定量':18,'pian数量':None,
            '创建时间':f'{2023 if i%9==0 else 2026}-01-{i%28+1:02d}','最后更新时间':f'2026-09-{i%28+1:02d}',
            '层数':2+i%3,'纸长':200+i%3*10,'纸宽':195+i%3*5,'抽(张)/包(盒)':80+i%3*20,'张/片数':80,
            '小包长度':200,'小包宽度':100,'单包高度':70,'纸盒尺寸':'220×110×80 mm' if cat=='面巾' else None,
            '中包包装方式':'单排单层','单提长':200,'单提宽':300,'单提高':70,'中包毛重(g)':800,
            '装箱方式':'平放','长(外包装)':420,'宽(外包装)':320,'高(外包装)':300,
            '包装规格单位1':'包/提','包装规格数量1':3,'包装规格单位2':'提/箱','包装规格数量2':load//3,
            '压线/压花':'双压线','粗压花':'无','加香/香型':'不加香','纸页颜色':'原色','是否上胶':'否',
            '节距':110 if roll else None,'卷高':100 if roll else None,'卷径':105 if roll else None,
            '节数':180 if roll else None,'米数':20 if roll else None,'净含量':100 if roll else None,
            '毛重/卷':105 if roll else None,'筒芯':'纸芯' if roll else None,'小卷形状':'圆形' if roll else None,
            '含液量':'150%' if wet else None,'体积':.04,'体积单位':'立方米','重量单位':'千克',
            '品牌（五级架构）':brand,'品类（五级架构）':cat,'销售大类（五级架构）':'演示渠道',
            '小包/袋/盒产品条码':f'DEMO-BC-{i+1:06d}' if i%5 else None})
        # Intentional fictional issues demonstrate rule editing and route filtering.
        if i%11==0: record['层数']=None
        if i%13==0: record['毛重']=net-.2
        if i%19==0: record['包装规格数量2']=None
        if i%7==0 and not wet: record['不含液成品净重（kg）']=1
        sheet.append([record[h] for h in headers])
    dest=ROOT/'examples/materials-demo.xlsx';dest.parent.mkdir(parents=True,exist_ok=True);book.save(dest)
    previous=os.environ.get('MDM_WORKBENCH_CONFIG_DIR')
    try:
        with tempfile.TemporaryDirectory(prefix='mdm-demo-config-') as config:
            os.environ['MDM_WORKBENCH_CONFIG_DIR']=config
            data=build.main(['--source',str(dest)])
    finally:
        if previous is None:os.environ.pop('MDM_WORKBENCH_CONFIG_DIR',None)
        else:os.environ['MDM_WORKBENCH_CONFIG_DIR']=previous
    data['meta'].update(sourcePath='examples/materials-demo.xlsx',sourceMode='完全虚构演示数据',shareUnc='')
    raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()
    (ROOT/'outputs/advq/dataset.json').write_bytes(raw)
    (ROOT/'outputs/advq/dataset.b64').write_text(base64.b64encode(gzip.compress(raw,mtime=0)).decode())
    import build_adv_query_workbench
    build_adv_query_workbench.main()
    print(f'Generated {count} fictional records; no production data was read.')

if __name__=='__main__':generate()
