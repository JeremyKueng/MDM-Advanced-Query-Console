@echo off
cd /d "%~dp0"
if exist .venv\Scripts\python.exe (
 .venv\Scripts\python.exe scripts\launch_workbench.py %*
) else (
 py -3 scripts\launch_workbench.py %*
)
if errorlevel 1 pause
