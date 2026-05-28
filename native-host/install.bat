@echo off
setlocal

REM 可记 Obsidian Native Messaging Host 安装脚本 (Windows)
REM 此脚本注册 Native Messaging Host 到 Chrome 注册表

set HOST_NAME=com.keji.obsidian
set HOST_PATH=%~dp0host.py

echo ========================================
echo   可记 - Obsidian Native Host 安装
echo ========================================
echo.

REM 检查 Python 是否可用
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.x
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 创建 Native Host manifest
set MANIFEST_PATH=%~dp0keji-obsidian-host.json

echo 正在生成 Native Host manifest...
(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "可记智能收藏助手 - Obsidian 导出服务",
echo   "path": "python",
echo   "args": ["%HOST_PATH%"],
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://YOUR_EXTENSION_ID_HERE/"
echo   ]
echo }
) > "%MANIFEST_PATH%"

REM 注册到 Chrome 注册表
echo 正在注册到 Chrome 注册表...
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1

if errorlevel 1 (
    echo [错误] 注册失败，请以管理员权限运行此脚本
    pause
    exit /b 1
)

echo.
echo [成功] Native Messaging Host 已注册！
echo.
echo Manifest 路径: %MANIFEST_PATH%
echo Host 脚本路径: %HOST_PATH%
echo.
echo 下一步：
echo 1. 在 Chrome 扩展设置中找到扩展 ID
echo 2. 编辑 %MANIFEST_PATH%
echo    将 YOUR_EXTENSION_ID_HERE 替换为实际的扩展 ID
echo 3. 在可记扩展的设置页中配置 Obsidian Vault 路径
echo.
pause
