@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "EXAMPLE=%cd%"
set "FRAMEWORK=%EXAMPLE%\loom-realm"

if not defined HOSTRA_SOURCE_DIR if exist "%FRAMEWORK%\.qualification\hostra\packages\hostra\scripts\hostra.js" set "HOSTRA_SOURCE_DIR=%FRAMEWORK%\.qualification\hostra"
if not defined HOSTRA_SOURCE_DIR if exist "%EXAMPLE%\..\hostra\packages\hostra\scripts\hostra.js" set "HOSTRA_SOURCE_DIR=%EXAMPLE%\..\hostra"

if not defined HOSTRA_SOURCE_DIR (
  echo 找不到冻结 Hostra。请设置 HOSTRA_SOURCE_DIR，或把 lithdoo/hostra 放在仓库旁的 ..\hostra。
  pause
  exit /b 1
)

set "HOSTRA_JS=%HOSTRA_SOURCE_DIR%\packages\hostra\scripts\hostra.js"
set "ELECTRON_EXE=%HOSTRA_SOURCE_DIR%\packages\hostra\electron_bin\electron.exe"
set "DESKTOP_ENTRY=%FRAMEWORK%\apps\desktop\dist\main-entry.js"

if not exist "%HOSTRA_JS%" (
  echo 无效的 Hostra 源：%HOSTRA_JS%
  pause
  exit /b 1
)
if not exist "%ELECTRON_EXE%" (
  echo Hostra 还没有 Electron 运行时。请在该目录执行 npm ci：
  echo   %HOSTRA_SOURCE_DIR%
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo 找不到 Node.js。请先安装 Node 20+ 并加入 PATH。
  pause
  exit /b 1
)
for /f "delims=" %%I in ('where node') do (
  set "NODE=%%I"
  goto :got_node
)
:got_node

if not exist "%FRAMEWORK%\node_modules\" (
  echo 正在安装 LoomRealm 依赖...
  pushd "%FRAMEWORK%"
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    popd
    echo npm ci 失败。
    pause
    exit /b 1
  )
  popd
)

if not exist "%EXAMPLE%\node_modules\" (
  echo 正在安装 PokeMan 与 game-libs 依赖...
  pushd "%EXAMPLE%"
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    popd
    echo npm install 失败。
    pause
    exit /b 1
  )
  popd
)

echo 正在构建并同步 PokeMan Presentation（Schema Form / Controls / Map / Dialogue）...
"%NODE%" "%EXAMPLE%\scripts\sync-map-presentation.mjs"
if errorlevel 1 (
  echo PokeMan Presentation 同步失败。
  pause
  exit /b 1
)

echo 正在构建 Dialogue Runtime...
pushd "%EXAMPLE%"
call npm run build -w @loomrealm-game/rpg-dialogue
set "DIALOGUE_BUILD_CODE=%ERRORLEVEL%"
popd
if not "%DIALOGUE_BUILD_CODE%"=="0" (
  echo Dialogue Runtime 构建失败。
  pause
  exit /b %DIALOGUE_BUILD_CODE%
)

set "HOSTRA_RPC_PORT=0"
set "HOSTRA_RPC_TOKEN=loomrealm-pokeman-%RANDOM%%RANDOM%"
set "HOSTRA_CONFIG_DIR=%FRAMEWORK%"
set "HOSTRA_USER_DATA_DIR=%TEMP%\loomrealm-pokeman-hostra"
set HOSTRA_SUBCMD="%NODE%" "%DESKTOP_ENTRY%"
set "LOOMREALM_DESKTOP_INSTALLATION_ROOT=%EXAMPLE%"
set "HOSTRA_APP_NAME=PokeMan"
set ELECTRON_RUN_AS_NODE=

echo 启动 PokeMan（DeepSeek Session Gate + Map + Dialogue）...
echo   游戏: %EXAMPLE%
echo   Hostra: %HOSTRA_SOURCE_DIR%
pushd "%FRAMEWORK%"
"%NODE%" "%HOSTRA_JS%"
set "CODE=%ERRORLEVEL%"
popd
if not "%CODE%"=="0" (
  echo Hostra 退出码 %CODE%。
  pause
)
exit /b %CODE%
