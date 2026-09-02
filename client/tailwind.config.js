/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ink: '#0a0a0a',
        paper: '#fcfcf9',
        accent: '#ff3b30',
        muted: '#8a8a8a',
      },
      animation: {
        pulseSoft: 'pulseSoft 1.5s ease-in-out infinite',
        wave: 'wave 1.2s ease-in-out infinite',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.85, transform: 'scale(1.03)' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(1.8)' },
        }
      }
    },
  },
  plugins: [],
}
