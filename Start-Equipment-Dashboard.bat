@echo off
start "" /b "C:\Users\320314137\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "%~dp0server.js"
timeout /t 1 /nobreak >nul
start "Equipment Dashboard" microsoft-edge:http://127.0.0.1:4173
