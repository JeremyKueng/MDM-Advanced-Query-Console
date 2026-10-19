#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [ -x .venv/bin/python3 ]; then PY_BIN=.venv/bin/python3; else PY_BIN=$(command -v python3); fi
"$PY_BIN" scripts/launch_workbench.py "$@"
