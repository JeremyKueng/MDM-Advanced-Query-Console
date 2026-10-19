@echo off
cd /d "%~dp0"
if "%~1"=="" (
 echo Please provide a local .xlsx file path.
 exit /b 1
)
if exist .venv\Scripts\python.exe (
 .venv\Scripts\python.exe scripts\build_adv_query_dataset.py --source "%~1"
 if errorlevel 1 exit /b 1
 .venv\Scripts\python.exe scripts\build_adv_query_workbench.py
) else (
 py -3 scripts\build_adv_query_dataset.py --source "%~1"
 if errorlevel 1 exit /b 1
 py -3 scripts\build_adv_query_workbench.py
)
