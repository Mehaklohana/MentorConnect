@echo off
REM ============================================
REM MentorConnect API - Startup Script
REM ============================================
echo Starting MentorConnect API...
echo.
echo Node.js path: C:\Program Files\nodejs\node.exe
echo Working directory: c:\Users\Techenzo\Desktop\mentor-platform
echo.
cd /d "c:\Users\Techenzo\Desktop\mentor-platform"
node server.js > server_log.txt 2>&1
pause
