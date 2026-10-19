#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [ $# -lt 1 ]; then echo '请传入本地 .xlsx 文件路径，或从页面选择文件导入。'; exit 1; fi
if [ -x .venv/bin/python3 ]; then PY_BIN=.venv/bin/python3; else PY_BIN=$(command -v python3); fi
"$PY_BIN" scripts/build_adv_query_dataset.py --source "$1"
"$PY_BIN" scripts/build_adv_query_workbench.py
