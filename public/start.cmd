@echo off
chcp 65001 >nul
setlocal

set "APP_DIR=%~dp0"
set "PORT=%PORT%"
if "%PORT%"=="" set "PORT=8080"
set "APP_URL=http://localhost:%PORT%/"
set "OBS_URL=http://localhost:%PORT%/obs"
set "TASKLIST_PARENT_PID="
set "ELECTRON_CMD="
set "PROJECT_DIR=%APP_DIR%.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not available in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

cd /d "%APP_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%update.ps1"

if exist "%APP_DIR%node_modules\.bin\electron.cmd" set "ELECTRON_CMD=%APP_DIR%node_modules\.bin\electron.cmd"
if "%ELECTRON_CMD%"=="" if exist "%PROJECT_DIR%\node_modules\.bin\electron.cmd" set "ELECTRON_CMD=%PROJECT_DIR%\node_modules\.bin\electron.cmd"
if "%ELECTRON_CMD%"=="" (
  where electron >nul 2>nul
  if not errorlevel 1 set "ELECTRON_CMD=electron"
)

if not "%ELECTRON_CMD%"=="" (
  echo Admin app: Electron
  echo Sync server starts only after pressing Play in the app.
  echo.
  "%ELECTRON_CMD%" "%APP_DIR%electron-main.js"
  goto appclosed
)

echo Electron is not available. Falling back to browser admin.

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

echo Starting Tasklist server...
echo Admin URL: %APP_URL%
echo OBS URL: %OBS_URL%

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process '%APP_URL%'"

echo.
echo Keep this window open while using the app.
echo Press Ctrl+C to stop the server.
echo.

node server.js

:stopped
echo.
echo Server stopped or failed to start.
pause
endlocal
exit /b

:appclosed
endlocal
