@echo off
chcp 65001 >nul
title 开宝五子棋陪练 - 手机测试
cd /d "%~dp0"

echo.
echo   ============================================
echo    开宝五子棋陪练 · 本地测试服务器
echo   ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [!] 没有找到 Node.js
  echo       请先安装：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo   正在启动，请稍候...
echo   启动后：iPhone 连同一个 Wi-Fi，用 Safari 打开下面显示的手机地址
echo.
echo   注意：若手机上打不开，请在 Windows 防火墙弹窗中允许 Node.js 访问网络
echo.

node tools\serve.js 8000

echo.
echo   服务已停止。
pause
