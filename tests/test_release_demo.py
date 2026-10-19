"""Default demo builds must not inspect private shared drives or load another tool's preferences."""
import importlib
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))

class DemoIsolationTests(unittest.TestCase):
    def test_unconfigured_share_has_no_network_or_keychain_access(self):
        import build_adv_query_dataset as b
        with patch.object(b,'SHARE_UNC',''),patch.object(b,'SHARE_SMB',''),patch.object(b.socket,'gethostbyname',side_effect=AssertionError('unexpected network')),patch.object(b.subprocess,'run',side_effect=AssertionError('unexpected system command')):
            status=b.probe_intranet_share_status('',auto_mount=True)
        self.assertEqual(status['overall'],'not_configured')
        self.assertEqual(status['auth'],{})
    def test_personal_configuration_is_namespaced(self):
        import workbench_config as config
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(config.config_directory().name,'mdm-advanced-query-console')

if __name__=='__main__':unittest.main()
