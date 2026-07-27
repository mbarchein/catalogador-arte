/**
 * Instalación de la PWA («Añadir a pantalla de inicio»).
 *
 * Chrome y derivados disparan `beforeinstallprompt` cuando la aplicación es
 * instalable; hay que retener ese evento para poder lanzar el diálogo después,
 * desde un gesto del usuario. El oyente se registra al cargar el módulo porque
 * el evento puede llegar antes de que React monte nada. Safari en iOS no tiene
 * este evento: allí solo cabe explicar el gesto manual.
 */

interface EventoAntesDeInstalar extends Event {
  prompt(): Promise<void>
}

let eventoDiferido: EventoAntesDeInstalar | null = null
const oyentes = new Set<() => void>()

function avisar() {
  oyentes.forEach((oyente) => oyente())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sin esto, algunos navegadores muestran su propio aviso en un momento
    // arbitrario. Se retiene y se ofrece en «Mi perfil», que es donde se busca.
    evento.preventDefault()
    eventoDiferido = evento as EventoAntesDeInstalar
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    eventoDiferido = null
    avisar()
  })
}

/** Para useSyncExternalStore: avisa cuando cambia la disponibilidad. */
export function suscribirInstalacion(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export function sePuedeInstalar(): boolean {
  return eventoDiferido !== null
}

/** Ya corre como aplicación instalada (pantalla completa, sin navegador). */
export function estaInstalada(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

export async function lanzarInstalacion(): Promise<void> {
  const evento = eventoDiferido
  // El navegador solo permite usar el evento una vez; si el usuario descarta
  // el diálogo, ya disparará otro beforeinstallprompt cuando toque.
  eventoDiferido = null
  avisar()
  await evento?.prompt()
}
