"""个人配置升级/损坏/写入中断的恢复保障，运行：python3 -m unittest discover -s tests。"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from workbench_config import ConfigStore, validate_document


def document(name):
    return {"type": "mdm-workbench-config", "schemaVersion": 1, "savedAt": name,
            "settings": {"v": 6, "order": ["material", "brand"], "visible": ["brand"],
                         "savedViews": [{"id": "view1", "name": name, "visible": ["brand"]}]}}


class ConfigStoreTests(unittest.TestCase):
    def test_nested_query_conditions_roundtrip_and_reject_malformed_groups(self):
        doc = document("嵌套条件")
        doc["settings"]["v"] = 7
        tree = [{"type": "group", "logic": "OR", "conditions": [
            {"field": "desc", "op": "containsAny", "val": "面巾；餐巾"},
            {"type": "group", "logic": "AND", "conditions": [
                {"field": "material", "op": "prefix", "val": "100"},
                {"field": "created", "op": "gte", "val": "20260101"}]}]}]
        doc["settings"]["filters"] = {"customLogic": "AND", "customConditions": tree}
        self.store.save(doc)
        self.assertEqual(self.store.read()["config"]["settings"]["filters"]["customConditions"], tree)
        for invalid in ([{"type": "group", "logic": "XOR", "conditions": []}],
                        [{"type": "group", "logic": "AND", "conditions": "invalid"}],
                        [{"type": "group", "logic": "OR", "conditions": [{}]}]):
            bad = json.loads(json.dumps(doc))
            bad["settings"]["filters"]["customConditions"] = invalid
            with self.assertRaises(ValueError):
                self.store.save(bad)
            self.assertEqual(self.store.read()["config"], doc)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = ConfigStore(self.temp.name)

    def test_read_does_not_create_defaults(self):
        self.assertFalse(self.store.read()["exists"])
        self.assertFalse(self.store.path.exists())

    def test_corrupt_file_recovers_previous_and_preserves_evidence(self):
        old, new = document("旧视图"), document("新视图")
        self.store.save(old)
        self.store.save(new)
        self.store.path.write_text("broken", encoding="utf-8")
        restored = self.store.read()
        self.assertTrue(restored["recovered"])
        self.assertEqual(restored["config"], old)
        self.store.save(new)
        self.assertEqual(self.store.read()["config"], new)
        self.assertEqual(next(Path(self.temp.name).glob("user-config.damaged-*.json")).read_text(), "broken")

    def test_interrupted_atomic_replace_keeps_existing_config(self):
        self.store.save(document("已保存"))
        with patch("workbench_config.os.replace", side_effect=OSError("模拟写入中断")):
            with self.assertRaises(OSError):
                self.store.save(document("未完成"))
        self.assertEqual(self.store.read()["config"], document("已保存"))
        self.assertFalse(list(Path(self.temp.name).glob(".config-*.tmp")))

    def test_future_or_malformed_config_does_not_overwrite(self):
        initial = document("正常")
        self.store.save(initial)
        for bad in ({**initial, "schemaVersion": 99},
                    {**initial, "settings": {"v": 6, "visible": "brand"}},
                    {**initial, "settings": {"v": 6, "savedViews": [None]}},
                    {**initial, "settings": {"v": 6, "savedViews": [{"id": "x", "name": "缺少字段"}]}}):
            with self.assertRaises(ValueError):
                self.store.save(bad)
            self.assertEqual(self.store.read()["config"], initial)

    def test_concurrent_updates_always_leave_complete_document(self):
        docs = [document("视图%d" % i) for i in range(12)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(self.store.save, docs))
        self.assertIn(self.store.read()["config"], docs)
        self.assertIn(json.loads(self.store.previous.read_text()), docs)
        self.assertFalse(list(Path(self.temp.name).glob(".config-*.tmp")))

    def test_saved_query_round_trip_and_invalid_query_preserves_file(self):
        doc = document("原字段视图")
        context = {"q": "示例商店", "qMode": "smart", "qField": "all", "visible": ["material", "desc"],
                   "order": ["material", "desc"], "view": "table", "sort": {"key": "updated", "dir": -1},
                   "filters": {"mfg": [], "formula": [], "cats": [], "stocks": [], "brands": ["示例品牌13"],
                               "status": "有效", "pre": "", "scope": "", "onlyFieldIssue": "", "onlyPdfRule": "",
                               "onlyBlock": False, "onlyIssue": False, "onlyVconf": False, "onlyBasket": False, "onlyPdf": False,
                               "customLogic": "AND", "customConditions": [{"field": "created", "op": "gte", "val": "2026-01-01"}]}}
        doc["settings"]["queryViews"] = [{"id": "q1", "name": "包装核对", "context": context}]
        self.store.save(doc)
        self.assertEqual(self.store.read()["config"], doc)
        for change in (lambda c: c["filters"].update(brands="示例品牌13"),
                       lambda c: c["sort"].update(dir=True),
                       lambda c: c.update(qMode="unknown")):
            bad = json.loads(json.dumps(doc))
            change(bad["settings"]["queryViews"][0]["context"])
            with self.assertRaises(ValueError):
                self.store.save(bad)
            self.assertEqual(self.store.read()["config"], doc)

    def test_quick_detail_survives_old_tabs_and_rejects_invalid_layout(self):
        doc = document("速览")
        view = {"version": 1, "columns": 2, "hideEmpty": True, "showDescription": True,
                "showAnalysis": False, "showAllFields": True,
                "sections": [{"id": "weights", "title": "重量", "enabled": True, "fields": ["gross", "net"]}]}
        doc["settings"]["quickDetailView"] = view
        self.store.save(doc)
        self.assertEqual(self.store.read()["config"]["settings"]["quickDetailView"], view)
        legacy = document("旧标签页保存字段视图")
        self.store.save(legacy)
        self.assertEqual(self.store.read()["config"]["settings"]["quickDetailView"], view)
        baseline = self.store.read()["config"]
        for change in (lambda v: v.update(columns=True),
                       lambda v: v.update(showAnalysis="false"),
                       lambda v: v.update(sections=[]),
                       lambda v: v["sections"].append(v["sections"][0]),
                       lambda v: v["sections"][0].update(fields="net")):
            bad = json.loads(json.dumps(baseline))
            change(bad["settings"]["quickDetailView"])
            with self.assertRaises(ValueError):
                self.store.save(bad)
            self.assertEqual(self.store.read()["config"], baseline)
        reset = document("保存另一份速览布局")
        reset["settings"]["quickDetailView"] = {**view, "columns": 3}
        self.store.save(reset)
        self.assertEqual(self.store.read()["config"]["settings"]["quickDetailView"]["columns"], 3)


if __name__ == "__main__":
    unittest.main()
