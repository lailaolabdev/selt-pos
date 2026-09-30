@echo off
setlocal

rem 4B-easy-POS Windows launcher
rem Double-click this file from the project root.
set "ROOT=%~dp0"

where npm >nul 2>&1 || (
  echo [ERROR] Node.js/npm was not found in PATH.
  pause
  exit /b 1
)
where go >nul 2>&1 || (
  echo [ERROR] Go was not found in PATH.
  pause
  exit /b 1
)


if not exist "%ROOT%server\node_modules" (
  echo [ERROR] Server dependencies are missing. Run: cd server ^&^& npm install
  pause
  exit /b 1
)
if not exist "%ROOT%client\node_modules" (
  echo [ERROR] Client dependencies are missing. Run: cd client ^&^& npm install
  pause
  exit /b 1
)

echo Starting 4B-easy-POS...

start "4B Server" /D "%ROOT%server" cmd /k "npm run build ^&^& npm run start:prod"
start "4B Client" /D "%ROOT%client" cmd /k "npm run build ^&^& npm run desktop:start"
start "4B RFID Hub" /D "%ROOT%hub_scanner" cmd /k "set RFID_SERVER_URL=http://localhost:3000 ^&^& set RFID_BAUD=9600 ^&^& go build -o cart_scanner.exe ./cmd/cart_scanner ^&^& cart_scanner.exe"
start "4B ngrok" cmd /k "ngrok http 3000"

echo.
echo Started:
echo   Server : http://localhost:3000
echo   Client : Electron POS
echo   Hub    : RFID reader at 9600 baud
echo   ngrok  : public tunnel for port 3000
echo.
echo Keep the four command windows open while using the POS.
timeout /t 3 /nobreak >nul
exit /b 0
