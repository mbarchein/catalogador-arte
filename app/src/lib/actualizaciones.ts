/**
 * Cuándo preguntar si hay una versión nueva publicada.
 *
 * El armazón se sirve de caché para arrancar al instante (RF-1202), y el
 * navegador solo revisa el service worker al abrir la aplicación: una pestaña
 * que pasa el día abierta en el almacén se quedaría con la versión vieja
 * indefinidamente. Aquí se decide cuándo volver a preguntar; la recarga al
 * activarse la versión nueva la hace el registro de main.tsx (autoUpdate).
 */

export const INTERVALO_COMPROBACION_MS = 15 * 60 * 1000

/** Lo único que se necesita de `document`, para poder fingirlo en los tests. */
export interface FuenteVisibilidad {
  visibilityState: DocumentVisibilityState
  addEventListener(tipo: 'visibilitychange', manejador: () => void): void
}

export function programarComprobaciones(
  comprobar: () => void,
  doc: FuenteVisibilidad = document,
): void {
  // Cada cuarto de hora mientras la aplicación siga abierta...
  setInterval(comprobar, INTERVALO_COMPROBACION_MS)

  // ...y al volver a primer plano: en móvil, bloquear la pantalla o cambiar de
  // aplicación no cierra la pestaña, así que este es el momento típico de
  // retomar — a veces días después de la última carga completa.
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') comprobar()
  })
}
