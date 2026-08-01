/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

// Lo que la aplicación no puede saber de sí misma en ejecución se incrusta al
// compilar. El commit lo aporta el entorno de despliegue (Vercel o Actions);
// en local no hay ninguno y se dice, en vez de inventar uno.
const BUILD = {
  version: pkg.version,
  date: new Date().toISOString(),
  commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '').slice(0, 7),
  deps: {
    react: pkg.dependencies.react,
    'react-router': pkg.dependencies['react-router'],
    '@supabase/supabase-js': pkg.dependencies['@supabase/supabase-js'],
    vite: pkg.devDependencies.vite,
  },
}

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(BUILD),
  },
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
        runtimeCaching: [
          {
            // Los ficheros de imagen SÍ se cachean, y es seguro porque sus
            // rutas son inmutables: cada subida crea una ruta nueva con sufijo
            // aleatorio y nada se sobrescribe, así que una ruta identifica un
            // contenido para siempre. Cambiar la imagen principal de una obra
            // cambia la ruta, y por tanto la entrada del caché: la
            // invalidación es automática.
            // Solo lo que pinta una etiqueta `img`. Una petición hecha con
            // `fetch` para LEER los bytes —la ficha en PDF convierte la
            // derivada a JPEG— no puede servirse de aquí: lo que se guardó al
            // pintar una miniatura es una respuesta opaca, sin cuerpo legible
            // y con estado 0, así que la conversión fallaba y la ficha salía
            // con «Imagen no disponible». Esas peticiones van siempre a la red.
            urlPattern: ({ url, request }) =>
              url.pathname.includes('/storage/v1/object/sign/') && request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'imagenes-obras',
              // La firma viaja en la cadena de consulta y cambia en cada
              // firma: sin quitarla, el mismo fichero ocuparía una entrada
              // nueva cada semana y nunca se acertaría en el caché.
              plugins: [
                {
                  cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
                    const u = new URL(request.url)
                    return u.origin + u.pathname
                  },
                },
              ],
              expiration: {
                maxEntries: 1200,
                maxAgeSeconds: 60 * 60 * 24 * 60,
                purgeOnQuotaError: true,
              },
              // 0 admite respuestas opacas: la imagen se pide desde una
              // etiqueta img y puede no traer cabeceras CORS.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
