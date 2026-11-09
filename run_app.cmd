@echo off
rem Starts the Delhi Night Activity Map on http://127.0.0.1:8765/ (local only).
cd /d "%~dp0"
".venv\Scripts\python.exe" -I pipeline\server.py --processed "%~dp0data\processed" --web "%~dp0public" --port 8765
