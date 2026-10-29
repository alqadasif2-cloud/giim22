@echo off
chcp 65001 >nul
title WinAssistant Windows Agent
color 0b

echo ========================================================
echo        WinAssistant — تشغيل وكيل Windows
echo ========================================================
echo.

cd /d "%~dp0"

set EXE_PATH=""
if exist "WinAssistantAgent.exe" set EXE_PATH="WinAssistantAgent.exe"
if exist "agent\dist\WinAssistantAgent.exe" set EXE_PATH="agent\dist\WinAssistantAgent.exe"
if exist "dist\WinAssistantAgent.exe" set EXE_PATH="dist\WinAssistantAgent.exe"

if not %EXE_PATH%=="" (
    echo [✓] تم العثور على الملف التنفيذي: %EXE_PATH%
    echo [+] بدء تشغيل الوكيل...
    echo.
    %EXE_PATH% %*
    goto end
)

echo [i] لم يتم العثور على WinAssistantAgent.exe مجمّع.
echo [+] التحقق من تثبيت Python لتشغيل الكود المصدري...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [!] خطأ: لم يتم العثور على WinAssistantAgent.exe ولا على Python في جهازك!
    echo.
    echo للحل:
    echo  1. نزّل ملف WinAssistantAgent.exe الجاهز من تبويب Actions في GitHub.
    echo  2. أو ثبّت Python 3.11 مع تحديد خيار "Add Python to PATH".
    echo.
    goto end
)

echo [✓] Python متوفر. التحقق من تثبيت الحزم المطلوبة...
cd agent
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [!] فشل في تثبيت بعض الحزم.
)

echo.
echo [+] تشغيل الوكيل عبر Python...
python main.py %*
cd ..

:end
echo.
echo ========================================================
pause
