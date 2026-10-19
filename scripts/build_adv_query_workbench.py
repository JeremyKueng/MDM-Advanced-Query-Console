"""组装「MDM 高级查询工作台」单文件 HTML。

读取 outputs/advq/template.html + dataset.b64 + advq.*.js，
替换占位符后输出 outputs/MDM高级查询工作台.html（全内联零外链）。
"""
from __future__ import annotations

import base64
import gzip
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADVQ = ROOT / "outputs/advq"
OUT = ROOT / "outputs/MDM高级查询工作台.html"


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def main() -> None:
    template = read(ADVQ / "template.html")
    dataset_b64 = read(ADVQ / "dataset.b64").strip()
    dataset = json.loads(gzip.decompress(base64.b64decode(dataset_b64)))
    parts = {
        "<!--__MATERIAL_COUNT__-->": f"{len(dataset['rows']):,}",
        "/*__DATASET__*/": 'const DATASET_B64 = "' + dataset_b64 + '";',
        "/*__APP_CORE__*/": read(ADVQ / "advq.core.js") + "\nconst PROCESS_DEFAULTS = " + read(ADVQ / "process-rules.defaults.json").strip() + ";\n" + read(ADVQ / "advq.process.js") + "\n" + read(ADVQ / "advq.config.js"),
        "/*__APP_VIEWS__*/": read(ADVQ / "advq.views.js") + "\n" + read(ADVQ / "advq.views2.js"),
        "/*__APP_EVENTS__*/": read(ADVQ / "advq.sorting.js") + "\n" + read(ADVQ / "advq.dates.js") + "\n" + read(ADVQ / "advq.searchdock.js") + "\n" + read(ADVQ / "advq.events.js"),
    }
    html = template
    for placeholder, content in parts.items():
        if placeholder not in html:
            sys.exit(f"模板缺少占位符：{placeholder}")
        if "</script" in content.lower():
            sys.exit(f"注入内容包含 </script>，终止：{placeholder}")
        html = html.replace(placeholder, content, 1)
    OUT.write_text(html, encoding="utf-8")
    print(f"已生成 {OUT}（{OUT.stat().st_size / 1e6:.2f} MB）")


if __name__ == "__main__":
    main()
