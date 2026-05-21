@echo off
echo ================================================
echo  Hospital Management System — Starting App
echo ================================================
echo.

echo [1/2] Starting Backend...
start "HMS Backend" cmd /k "cd /d "%~dp0backend" && start.bat"

echo [2/2] Starting Frontend...
start "HMS Frontend" cmd /k "cd /d "%~dp0frontend" && build.bat"

echo.
echo Both windows launched. Backend on :8080, Frontend on :5173.
