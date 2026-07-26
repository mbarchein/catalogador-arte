/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // RF-1202: se cachea el armazón de la aplicación para que arranque al
      // instante, pero NO los datos. No hay funcionamiento sin conexión, y es
      // deliberado: la edición desconectada es incompatible con el bloqueo de
      // edición (RF-1203).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // Las peticiones a la API nunca se sirven de caché: un dato de catálogo
        // obsoleto mostrado como actual es peor que no mostrar nada.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
        runtimeCaching: [],
      },
      manifest: {
        name: 'Catalogador — Rotili / Ruiz Campins',
        short_name: 'Catalogador',
        description: 'Inventario y catálogo razonado',
        lang: 'es-ES',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1c1917',
        theme_color: '#1c1917',
        icons: [
          { src: '/icons/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icono-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icono-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    // Los tests unitarios no hablan con Supabase, pero importar cualquier
    // módulo que use el cliente ejecuta createClient() en la carga, y sin URL
    // revienta — en CI no hay .env. Valores ficticios, como en el paso de
    // compilación del workflow.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:8321',
      VITE_SUPABASE_ANON_KEY: 'clave-de-tests-sin-uso',
    },
  },
})
