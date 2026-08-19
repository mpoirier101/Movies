@echo off
setlocal
set "PID_FILE=%~dp0server.pid"

if exist "%PID_FILE%" (
  set /p MOVIES_PID=<"%PID_FILE%"
  taskkill /F /PID %MOVIES_PID% /T >nul 2>&1
  del "%PID_FILE%" >nul 2>&1
)

start "" wscript.exe "%~dp0start-silent.vbs"
echo Movies server restarted.
