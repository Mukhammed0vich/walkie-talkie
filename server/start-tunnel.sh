#!/bin/bash
# Uy kompyuter (Mac/Linux) uchun 1-klik ishga tushirish
# Talab: cloudflared o'rnatilgan bo'lsin: brew install cloudflared  (Mac)  yoki  https://developers.cloudflare.com/cloudflare-one/connections/connect/networks/downloads/

PORT=${PORT:-3001}
echo "→ Server ishga tushmoqda (port $PORT)..."
npm start &
SERVER_PID=$!
sleep 2

echo ""
echo "→ Tunnel ochilmoqda..."
echo "  Chiqqan https://....trycloudflare.com linkini nusxalab,"
echo "  frontend .env ga yoki brauzerda ⚙ ga qo'ying."
echo ""

# cloudflared bo'lmasa localtunnel fallback
if command -v cloudflared >/dev/null 2>&1; then
  cloudflared tunnel --url http://localhost:$PORT
else
  echo "cloudflared topilmadi, localtunnel ishlatilmoqda (npx)..."
  npx localtunnel --port $PORT
fi

kill $SERVER_PID 2>/dev/null
