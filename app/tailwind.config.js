/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Minimum comfortable touch target for one-handed use (RF-1205).
      minHeight: { touch: '2.75rem' },
      // Los dos tamaños por debajo de `text-xs` que usan las insignias («En la papelera»,
      // «Retirado del archivo») y los pies de las miniaturas. Estaban escritos como
      // `text-[11px]` y `text-[10px]`, en píxeles, y se quedaban clavados mientras el resto
      // de la interfaz crecía con el tamaño de letra elegido en el perfil — que es el
      // detalle que hace que un ajuste de accesibilidad parezca a medio hacer. Los mismos
      // valores, ahora en `rem`: 11px y 10px sobre la raíz base de 16.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
}
