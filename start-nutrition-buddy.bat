@echo off
REM 营养Buddy 一键启动脚本
REM 用法: 双击本文件，或命令行运行 start-nutrition-buddy.bat
cd /d "%~dp0"

REM 清除可能导致 Electron 以 Node 模式启动的环境变量
set ELECTRON_RUN_AS_NODE=

echo ============================================
echo   🌿 营养Buddy v0.1 启动中...
echo ============================================
echo.

REM 检查依赖是否已安装
if not exist "node_modules\electron\dist\electron.exe" (
  echo [错误] Electron 未安装，正在安装依赖（国内镜像）...
  call npm install --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试
    pause
    exit /b 1
  )
)

REM 检查数据库是否已导入
if not exist "data\nutrition.db" (
  echo [提示] 未找到数据库，正在导入食物成分数据...
  call npm run import-foods
)

echo 正在启动应用，窗口即将弹出...
start "" "node_modules\electron\dist\electron.exe" . --disable-gpu --no-sandbox
echo.
echo 若窗口未弹出，请检查是否被杀毒软件拦截。
pause
