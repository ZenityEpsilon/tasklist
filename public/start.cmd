@echo off
chcp 65001 >nul
setlocal

set "APP_DIR=%~dp0"
set "PORT=%PORT%"
if "%PORT%"=="" set "PORT=8080"
set "APP_URL=http://localhost:%PORT%/"
set "OBS_URL=http://localhost:%PORT%/obs"
set "TASKLIST_PARENT_PID="

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not available in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

cd /d "%APP_DIR%"

for /f %%P in ('powershell -NoProfile -Command "$parent=(Get-CimInstance Win32_Process -Filter \"ProcessId=$PID\").ParentProcessId; Write-Output $parent" 2^>nul') do set "TASKLIST_PARENT_PID=%%P"

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  echo Tasklist is already running, or port %PORT% is used by another app.
  echo.
  echo Close the other Tasklist console window first.
  echo If you need another port, run this file with PORT set to a free value.
  echo Example: set PORT=8081
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%update.ps1" -AppDir "%APP_DIR%"

echo Starting Tasklist server...
echo Admin URL: %APP_URL%
echo OBS URL: %OBS_URL%

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process '%APP_URL%'"

echo.
echo Keep this window open while using the app.
echo Press Ctrl+C to stop the server.
echo.

node server.js

echo.
echo Server stopped or failed to start.
pause
endlocal
