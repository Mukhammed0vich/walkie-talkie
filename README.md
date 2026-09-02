# Onlayn Ratsia — 1ga-1 PTT (Web)

Juda sodda web ratsia: jamoa a'zolari bir-birini ro'yxatdan tanlab, **bosib turib gapiradi**, qo'yib yuborsa ovoz faqat tanlangan odamga boradi. 
- **Backend:** Uy kompyuterida (Node.js + Socket.io)
- **Frontend:** GitHub Pages da (Vite + React, bepul random domen - tunnel orqali)

> Managing Director / CEO / CO-FOUNDER — hammasi bir xil panelga ega. Har kim istalgan odamni tanlab gapira oladi.

## Tez ishga tushirish (dev)

### 1. Backend (uy PC)
```bash
cd server
npm install
npm start          # http://localhost:3001
# team.json da jamoani tahrirlang (8 kishi default)
```

### 2. Frontend
```bash
cd client
npm install
npm run dev        # http://localhost:5173
# .env da VITE_SERVER_URL=http://localhost:3001
```

Mikrofon uchun **HTTPS** kerak (prod da avtomatik).

## Prod — Uy PC + GitHub Pages

### Backend ni tashqariga chiqarish (tunnel)

Uy PC NAT ortida, shuning uchun tunnel kerak (port ochish shart emas):

**Mac (brew):**
```bash
brew install cloudflared
cd server
./start-tunnel.sh
# chiqadi: https://xxxx.trycloudflare.com
```

**Windows:** `server/start-tunnel.bat` ni 2 marta bosing. Yoki qo'lda:
```powershell
cloudflared tunnel --url http://localhost:3001
# yoki
npx localtunnel --port 3001
```

Chiqqan `https://...` linkni nusxalab oling.

### Frontend ni GitHub ga chiqarish

1. Repo ni GitHub ga push qiling (`main` branch)
2. GitHub → Settings → Pages → Source: **GitHub Actions** ni tanlang
3. (Ixtiyoriy) Settings → Secrets → `VITE_SERVER_URL` ni qo'shing, qiymati tunnel URL (mas: `https://xxxx.trycloudflare.com`). Qo'shmasangiz ham bo'ladi — foydalanuvchi brauzerda ⚙ bosib kiritadi va localStorage da saqlanadi.
4. Push qiling → Actions avtomatik build qilib Pages ga chiqaradi: `https://username.github.io/repo-nomi/`

> Frontendda ⚙ (sozlama) tugmasidan istalgan vaqtda server manzilini o'zgartirish mumkin, qayta deploy shart emas.

## Foydalanish

1. Linkni och → o'z ismingni tanla → Kirish
2. Chapdan kimga gapirish kerakligini tanla (yashil = onlayn)
3. Katta tugmani **bosib tur** → gapir → **qo'yib yubor** → ovoz yuboriladi
4. Qarshi tomonda avtomatik eshittiriladi + beep
5. Space tugmasi ham PTT sifatida ishlaydi

## team.json

`server/team.json` ni tahrirlab odam qo'shing/o'chiring, serverni qayta ishga tushiring:

```json
[
  { "id": "ceo", "name": "Sardor", "role": "CEO", "avatar": "S" },
  { "id": "md",  "name": "Jasur", "role": "Managing Director", "avatar": "J" }
]
```
`id` — noyob, lotin harflari. `avatar` — bosh harf.

## Texnologiya

- **Relay:** MediaRecorder (opus/webm) → Socket.io `ptt:blob` (ArrayBuffer) → target ga forward. WebRTC emas — sodda, barqaror, kechikish ~250-400ms.
- **Presence:** `presence:update`, `talking:update`
- **Bandlik:** Bir kanal (A↔B) band bo'lsa ikkinchi urinish bloklanadi

## Muammolar

- **Mikrofon ishlamayapti:** HTTPS da ekanligini tekshiring, brauzer ruxsatini bering.
- **Ovoz eshitilmayapti:** Birinchi kirishda biror joyni bosish kerak (autoplay blok). Qabul qiluvchida ovoz balandligini tekshiring.
- **Tunnel link o'zgarib qoldi (ngrok):** Cloudflare Tunnel ishlatilsa doimiy emas, har safar yangi random link chiqadi. Shuning uchun frontendda ⚙ dan yangilash kerak, yoki `cloudflared tunnel --config` bilan doimiy tunnel qiling (ixtiyoriy).

## Keyingi qadamlar

- Guruhli kanal (hammaga birdan)
- Ovoz tarixi
- Doimiy Cloudflare Tunnel (config file)
- PM2 bilan uy PC da avto-start
