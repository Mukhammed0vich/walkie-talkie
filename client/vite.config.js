import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages uchun base ni o'zgartirish kerak bo'lsa:
// Masalan repo nomi "online-ratsia" bo'lsa: base: '/online-ratsia/'
// Hozir avtomatik aniqlaydi, agar kerak bo'lsa qo'lda o'zgartiring
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      // dev paytida uy PC tunnel o'rniga localhost ga ulanish uchun
      // '/socket.io': 'http://localhost:3001'
    }
  }
})
