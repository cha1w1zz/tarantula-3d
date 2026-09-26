@echo off
rem Double-click = run setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
pause
