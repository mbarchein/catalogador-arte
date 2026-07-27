/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Minimum comfortable touch target for one-handed use (RF-1205).
      minHeight: { touch: '2.75rem' },
    },
  },
  plugins: [],
}
