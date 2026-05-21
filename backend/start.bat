@echo off
cd /d "%~dp0"
echo Starting HMS Backend...
echo.
mvn clean spring-boot:run
pause
