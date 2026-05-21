@echo off
setlocal
cd /d "%~dp0"

REM ---- First-run dependency install ------------------------------------------
if not exist "node_modules" (
  echo Installing dependencies, this will take a minute...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo *** npm install failed. See errors above. ***
    pause
    exit /b 1
  )
)

echo.
echo Starting Vite dev server on http://localhost:5173 ...
echo (Press Ctrl+C in this window to stop the server.)
echo.

REM ---- Open browser after a short delay so Vite has time to bind the port ----
start "" /b powershell -NoProfile -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:5173'"

REM ---- Run dev server in the foreground (this window keeps it alive) --------
call npm run dev

echo.
echo Server stopped. Press any key to close this window.
pause >nul

endlocal
