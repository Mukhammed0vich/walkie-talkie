@echo off
REM Uy kompyuter (Windows) uchun 1-klik ishga tushirish
REM Talab: Node.js o'rnatilgan, cloudflared o'rnatilgan bo'lsa yaxshi: https://developers.cloudflare.com/cloudflare-one/connections/connect/networks/downloads/
set PORT=3001
echo - Server ishga tushmoqda (port %PORT%)...
start "ratsia-server" cmd /k npm start
timeout /t 3 /nobreak >nul
echo.
echo - Tunnel ochilmoqda...
echo   Chiqqan https://....trycloudflare.com linkini nusxalab,
echo   frontend .env ga yoki brauzerda sozlamaga qoying.
echo.
where cloudflared >nul 2>nul
if %ERRORLEVEL%==0 (
  cloudflared tunnel --url http://localhost:%PORT%
) else (
  echo cloudflared topilmadi, localtunnel ishlatilmoqda...
  npx localtunnel --port %PORT%
)
pause
