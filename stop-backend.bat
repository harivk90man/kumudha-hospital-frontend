@echo off
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do (
    echo Stopping PID %%p on port 8080
    taskkill /PID %%p /F
    exit /b
)
echo Nothing running on port 8080
