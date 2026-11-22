@echo off
rem Frees ports 4316 (web) and 4317 (server).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
