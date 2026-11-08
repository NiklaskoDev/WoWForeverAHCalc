@echo off
rem Serves the app on this computer only. Blizzard's API refuses pages opened directly as local files.
cd /d "%~dp0"
start "" cmd /c "timeout /t 1 >nul & start http://localhost:8778/"
echo Forever AH Crafting is running at http://localhost:8778/
echo Keep this window open while you use the app. Close it when you're done.
python -m http.server 8778 --bind 127.0.0.1
if errorlevel 1 pause
