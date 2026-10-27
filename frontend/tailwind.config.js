/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Nepal flag blue for the interface, crimson only for critical states.
        brand: { 50: '#eef3fb', 100: '#d5e1f4', 500: '#1d4ea8', 600: '#0a3d91', 700: '#003893', 800: '#002b70', 900: '#001d4d' },
        crimson: { 50: '#fdf2f3', 100: '#fbe3e6', 600: '#c8102e', 700: '#a50d26' },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
