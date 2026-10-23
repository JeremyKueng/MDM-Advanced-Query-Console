"""Parity against frozen business rules, invalid rule rejection, and source refresh persistence."""
import contextlib
import io
import json
import os
import shutil
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import process_rules as pr
import process_rules_legacy as legacy
from workbench_config import ConfigStore


def contexts():
    ds = json.loads((ROOT / 'outputs/advq/dataset.json').read_text())
    keys = [x['key'] for x in ds['schema']]
    result=[]
    for i, values in enumerate(ds['rows']):
        row=dict(zip(keys, values)); raw={f:row.get(k) for f,k in ds['processAliases'].items()}
        raw.update({f:row.get(f) for f in ds['mdmFields']})
        raw.update(zip(ds['processRawKeys'],ds['processRawRows'][i]))
        raw.update({'$specP':row['specP'],'$ruleCat':row['ruleCat']})
        result.append(raw)
    return ds,result


class ProcessRuleTests(unittest.TestCase):
    def test_all_source_rows_match_frozen_original(self):
        ds, raws=contexts();run=pr.compile_config(pr.validate(pr.defaults()))
        for raw in raws:
            with self.subTest(material=raw['物料编码']):
                old=legacy.check_pdf_rules(raw,raw['品类三级'],raw['物料库存类别'],raw['$specP'],raw['$ruleCat'],pr.number(raw['原始装数'])) if legacy.in_pdf_scope(raw) else ([],set(),set())
                self.assertEqual(run(raw),old)

    def test_numeric_na_thresholds_and_expression_safety(self):
        _,raws=contexts();base=raws[0];run=pr.compile_config(pr.defaults())
        for f in ['净重','不含赠品净重','毛重','纸长','纸宽','成品定量','pian数量']:
            for value in [None,'','无','（无要求）','待定','138mm','7x27s',0,-1,'1,234',105,120.5]:
                raw={**base,f:value}
                expected=legacy.check_pdf_rules(raw,raw['品类三级'],raw['物料库存类别'],raw['$specP'],raw['$ruleCat'],pr.number(raw['原始装数'])) if legacy.in_pdf_scope(raw) else ([],set(),set())
                self.assertEqual(run(raw),expected,(f,value))
        self.assertEqual(pr.calc(pr.expression('([净重] + 2) * -3 / 2',{'净重'}),{'净重':4}),-9)
        self.assertIsNone(pr.calc(pr.expression('1 / 0'),{}))
        for field in ['创建时间','最后更新时间']:
            self.assertTrue(pr.compile_node({'field':field,'op':'between','value':'20260101','valueTo':'2026-01-31'})({field:'2026-01-31 18:25:00'}))
            self.assertFalse(pr.compile_node({'field':field,'op':'gte','value':'2026/1/2'})({field:'2026-01-01'}))
        for source in ['__import__("os")','[unknown]+1','1e999','[净重] ** 2','[净重]+']:
            with self.assertRaises(ValueError): pr.expression(source,{'净重'})

    def test_config_validation_and_independent_persistence(self):
        with tempfile.TemporaryDirectory() as temp:
            store=ConfigStore(temp);config=pr.defaults();config['rules'][1]['enabled']=False
            document={'type':'mdm-workbench-config','schemaVersion':1,'settings':{'v':6,'processRules':config}}
            store.save(document)
            self.assertEqual(ConfigStore(temp).read()['config'],document)
            bad=json.loads(json.dumps(document));bad['settings']['processRules']['rules'][0]['checks'][0]['code']='NUM'
            with self.assertRaises(ValueError):store.save(bad)
            self.assertEqual(store.read()['config'],document)

    def test_old_tabs_cannot_erase_saved_rules(self):
        with tempfile.TemporaryDirectory() as temp:
            store=ConfigStore(temp);config=pr.defaults();config['rules'][1]['enabled']=False
            base={'type':'mdm-workbench-config','schemaVersion':1,'settings':{'v':6,'processRules':config}}
            store.save(base)
            old={'type':'mdm-workbench-config','schemaVersion':1,'settings':{'v':6,'q':'new search'}}
            store.save(old)
            self.assertEqual(store.read()['config']['settings']['processRules'],config)
            self.assertEqual(store.read()['config']['settings']['q'],'new search')
            store.save({**old,'settings':{**old['settings'],'processRules':None}})
            self.assertIsNone(store.read()['config']['settings']['processRules'])

    def test_source_rebuild_uses_saved_custom_rule(self):
        ds,raws=contexts();source=Path(ds['meta']['sourcePath'])
        if not source.exists():self.skipTest('source workbook is not mounted')
        import build_adv_query_dataset as build
        config=pr.defaults()
        config['rules'].append({'id':'test-custom','no':12,'title':'源表更新保留规则测试','enabled':True,'scope':{'logic':'AND','conditions':[]},'checks':[{'id':'c1','enabled':True,'code':'PFC','message':'测试净重上限','when':{'field':'净重','op':'gt','value':5}}]})
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);out=folder/'outputs';out.mkdir()
            # RPA 源表会持续更新；固定本次输入，用同一份源表核对行数和规则，不能与旧浏览器快照比较。
            input_copy=folder/'source.xlsx';shutil.copyfile(source,input_copy)
            headers, values=build.load_excel(input_copy)
            raws=[build.normalize_raw_record({h:build.bms.clean(v) for h,v in zip(headers,row)}) for row in values]
            store=ConfigStore(folder/'config');store.save({'type':'mdm-workbench-config','schemaVersion':1,'settings':{'v':6,'processRules':config}})
            with patch.dict(os.environ,{'MDM_WORKBENCH_CONFIG_DIR':str(store.directory)}),patch.object(build,'OUT_DIR',out),contextlib.redirect_stdout(io.StringIO()):
                rebuilt=build.main(['--source',str(input_copy)])
            self.assertEqual(len(rebuilt['rows']),len(raws))
            names=[s['key'] for s in rebuilt['schema']];flagidx=names.index('flags')
            self.assertEqual(sum('PFC:12:测试净重上限' in r[flagidx] for r in rebuilt['rows']),sum(pr.compile_node(config['scope'])(r) and (pr.number(r.get('净重')) or 0)>5 for r in raws))
            self.assertIn('12',rebuilt['pdfRuleStats'])
            self.assertEqual(len(rebuilt['processRawRows']),len(rebuilt['rows']))
            self.assertEqual(store.read()['config']['settings']['processRules'],config)


if __name__=='__main__':unittest.main()
