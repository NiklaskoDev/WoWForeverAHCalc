@echo off
title Forever AH price sync
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync.ps1"
pause
