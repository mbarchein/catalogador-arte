/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Minimum comfortable touch target for one-handed use (RF-1205).
      minHeight: { touch: '2.75rem' },
      // The two sizes below `text-xs` used by the badges («En la papelera»,
      // «Retirado del archivo») and the thumbnails' captions. They were written as
      // `text-[11px]` and `text-[10px]`, in pixels, and stayed pinned while the rest
      // of the interface grew with the letter size chosen in the profile — which is the
      // detail that makes an accessibility setting look half done. The same
      // values, now in `rem`: 11px and 10px over the base root of 16.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
}
