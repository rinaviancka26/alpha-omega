@echo off
rem Starts the app (only the halves that are down) and opens the browser. Double-click me.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
