@echo off
chcp 65001 >nul
title WinAssistant Local Server (0.0.0.0:8000)
color 0a

echo ========================================================
echo        WinAssistant — تشغيل الخادم المحلي
echo ========================================================
echo.

cd /d "%~dp0"

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] خطأ: Python غير مثبت أو غير مضاف إلى متغيرات النظام (PATH).
    echo يرجى تثبيت Python 3.11 أو 3.12 من https://www.python.org/
    echo وتأكد من تفعيل خيار "Add Python to PATH" أثناء التثبيت.
    echo.
    pause
    exit /b 1
)

echo [✓] Python متوفر.
echo [+] التحقق من تثبيت اعتماديات الخادم...
cd server
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [!] تحذير: قد تكون بعض الاعتماديات لم تثبت بشكل صحيح.
)

echo.
echo [+] بدء تشغيل الخادم المحلي...
python run_server.py

cd ..
echo.
echo ========================================================
pause
