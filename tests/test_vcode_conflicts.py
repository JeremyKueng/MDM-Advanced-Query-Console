"""冲突准入规则与旧快照迁移，保留原始物料和其他质量问题。"""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from vcode_conflicts import rebuild_vcode_conflicts, refresh_dataset_conflicts


class VcodeConflictTests(unittest.TestCase):
    def test_exclusions_precede_grouping_and_only_conflict_flags_change(self):
        rows = json.loads((ROOT / "tests/fixtures/vcode-conflicts.json").read_text())
        before = deepcopy(rows)
        groups = rebuild_vcode_conflicts(rows)
        self.assertEqual([g["vcode"] for g in groups], ["TEST-V-B", "TEST-V-E"])
        self.assertEqual([r["material"] for r in rows if r["vconf"]], ["TEST-04", "TEST-05", "TEST-13", "TEST-14"])
        self.assertEqual(rows[0]["flags"], "NUM:层数")
        self.assertEqual(rows[5]["flags"], "MISS:品牌")
        for old, new in zip(before, rows):
            for key in old:
                if key != "flags":
                    self.assertEqual(old[key], new[key])
            self.assertEqual(new["issueCount"], len(new["flags"].split("|")) if new["flags"] else 0)
        self.assertEqual(rebuild_vcode_conflicts(rows), groups, "repeated builds must be idempotent")

    def test_refresh_old_snapshot_updates_counts_and_keeps_source(self):
        keys = ["material", "vcode", "pre", "npt", "load", "specC", "flags", "vconf", "issueCount"]
        records = json.loads((ROOT / "tests/fixtures/vcode-conflicts.json").read_text())
        before_count = sum("VCONF" in row["flags"] for row in records)
        dataset = {"schema": [{"key": key} for key in keys], "rows": [[r.get(key) for key in keys] for r in records],
                   "meta": {"source": "fixture.xlsx", "govCounts": {"packaging": before_count + 7}},
                   "rules": [{"id": "vcode", "desc": "old rule"}], "vconf": [{"vcode": "old"}]}
        refresh_dataset_conflicts(dataset)
        self.assertEqual(len(dataset["rows"]), len(records))
        self.assertEqual(dataset["meta"]["source"], "fixture.xlsx")
        self.assertEqual(dataset["meta"]["govCounts"]["packaging"], 11)
        self.assertIn("预失效=X、F", dataset["rules"][0]["desc"])
        self.assertEqual([g["materialCount"] for g in dataset["vconf"]], [2, 2])


if __name__ == "__main__":
    unittest.main()
