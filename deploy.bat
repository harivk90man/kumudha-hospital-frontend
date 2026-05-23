@echo off
REM ============================================================
REM  deploy.bat
REM  ----------------------------------------------------------
REM  Pushes the current branch to GitHub, then deploys the
REM  frontend/ build to Vercel production.
REM
REM  Run from anywhere:
REM     C:\hari\hms\hms-fe\deploy.bat
REM  or just `deploy.bat` if you're already in the project root.
REM
REM  Live URL after success: https://kumudha-hms.vercel.app
REM ============================================================

setlocal EnableDelayedExpansion

REM Always run relative to the script's own directory so the
REM relative `frontend` path resolves no matter where it's invoked.
cd /d "%~dp0"

echo.
echo === 1/2  Pushing latest commits to origin =================
git push origin HEAD
if errorlevel 1 (
    echo.
    echo ^>^>^> git push failed. Aborting before touching Vercel.
    exit /b 1
)

echo.
echo === 2/2  Deploying to Vercel production ==================
pushd frontend
call vercel deploy --prod --yes
set "RC=%ERRORLEVEL%"
popd

if not "%RC%"=="0" (
    echo.
    echo ^>^>^> Vercel deploy failed with exit code %RC%.
    exit /b %RC%
)

echo.
echo === Done ==================================================
echo Live at: https://kumudha-hms.vercel.app
echo.

endlocal
