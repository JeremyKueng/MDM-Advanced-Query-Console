"""共享目录、.env 初次迁移、配置隔离与代码更新后的路径保留。"""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from source_settings import SourceSettingsStore, dotenv_values


class SourceSettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "project"
        self.root.mkdir()
        self.store = SourceSettingsStore(self.root, Path(self.temp.name) / "profile")
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_saved_unc_survives_code_and_environment_changes(self):
        path = r"\\files.example.invalid\团队资料\物料表"
        saved = self.store.save_shared_path(path)
        self.assertEqual(saved["shareUnc"], path)
        self.assertEqual(saved["shareSmb"], "smb://files.example.invalid/团队资料/物料表")
        with patch.dict(os.environ, {"MDM_SHARE_UNC": r"\\other.invalid\share"}):
            self.assertEqual(self.store.resolve({"shareUnc": "new-code-default"})["sharePath"], path)
        self.assertEqual(json.loads(self.store.path.read_text())["sharePath"], path)
        self.assertNotEqual(self.store.path.parent, self.root)

    def test_dotenv_is_literal_and_migrates_once(self):
        self.root.joinpath('.env').write_text('MDM_SHARE_UNC="\\\\files.example.invalid\\share"\nMDM_SOURCE_XLSX="Z:\\reports\\source.xlsx"\nUNRELATED_SECRET=ignored\n', encoding='utf-8')
        values = dotenv_values(self.root)
        self.assertNotIn('UNRELATED_SECRET', values)
        result = self.store.resolve(persist=True)
        self.assertEqual(result['shareUnc'], r'\\files.example.invalid\share')
        self.root.joinpath('.env').write_text('MDM_SHARE_UNC=changed', encoding='utf-8')
        self.assertEqual(self.store.resolve()['shareUnc'], result['shareUnc'])
        self.assertEqual(result['sourcePath'], r'Z:\reports\source.xlsx')

    def test_mapped_drive_smb_and_clear_preserve_other_preferences(self):
        default = {'sourcePath':'materials.xlsx'}
        self.assertEqual(self.store.save_shared_path(r'Z:\reports', default)['shareDirs'], [r'Z:\reports'])
        result = self.store.save_shared_path('smb://files.example.invalid/team/reports')
        self.assertEqual(result['shareUnc'], r'\\files.example.invalid\team\reports')
        self.assertEqual(result['sourcePath'], 'materials.xlsx')
        cleared = self.store.save_shared_path('')
        self.assertEqual(cleared['shareUnc'], '')
        self.assertEqual(cleared['sourcePath'], 'materials.xlsx')
        self.assertEqual(self.store.resolve({'shareUnc':'new-default'})['shareUnc'], '')
        before = self.store.path.read_bytes()
        with self.assertRaises(ValueError):
            self.store.save_shared_path('smb://user:password@files.example.invalid/share')
        self.assertEqual(self.store.path.read_bytes(), before)

    def test_corrupt_settings_do_not_silently_reset(self):
        self.store.save_shared_path(r'Z:\old')
        self.store.save_shared_path(r'Z:\new')
        self.store.path.write_text('broken')
        self.assertEqual(self.store.resolve()['sharePath'], r'Z:\old')
        self.assertEqual(self.store.path.read_text(), 'broken')
        with self.assertRaises(ValueError):
            self.store.save_shared_path(r'Z:\third')
        self.assertEqual(self.store.path.read_text(), 'broken')


if __name__ == '__main__':
    unittest.main()
