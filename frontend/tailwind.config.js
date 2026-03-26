/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: '#070e1d',
        surface_container_lowest: '#000000',
        surface_container_low: '#0b1323',
        surface_container: '#11192b',
        surface_container_high: '#161f33',
        surface_container_highest: '#1b263b',
        surface_bright: '#212c43',
        primary: {
          DEFAULT: '#a7a5ff',
          dim: '#645efb',
          foreground: '#ffffff',
        },
        on_surface: '#E2E8F0',
        secondary_container: '#4d329b',
        on_secondary_container: '#d6c9ff',
        background: '#ffffff',
        foreground: '#09090b',
        muted: {
          DEFAULT: '#f4f4f5',
          foreground: '#71717a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'primary-gradient': 'linear-gradient(135deg, #a7a5ff, #645efb)',
      },
    },
  },
  plugins: [],
}
