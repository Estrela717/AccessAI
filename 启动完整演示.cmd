@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20.12 or newer is required.
  pause
  exit /b 1
)
echo AccessAI - open http://127.0.0.1:4173/assistant.html in your browser.
echo Keep this window open. Press Ctrl+C to stop the local server.
node server.cjs
if errorlevel 1 pause
