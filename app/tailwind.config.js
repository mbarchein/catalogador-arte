/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Objetivo táctil mínimo cómodo para uso a una mano (RF-1205).
      minHeight: { toque: '2.75rem' },
    },
  },
  plugins: [],
}
