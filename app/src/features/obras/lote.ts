import { FECHA_VACIA, type FechaEstructurada } from '../../lib/fechaEstructurada'
import type { FondoArtista } from '../../lib/tipos'

/**
 * Estado de un lote de captura. La distinción entre las dos mitades es la que
 * evita que un lote acabe con datos heredados que nadie quiso:
 *
 *  - **Fijos**: se eligen al abrir el lote y no cambian mientras esté abierto.
 *    Cambiarlos exige cerrar el lote, que es un gesto deliberado. Son los dos
 *    campos que definen «qué estoy catalogando ahora»: fondo y tipo de obra.
 *
 *  - **Arrastrados**: parten del valor de la obra anterior y se ajustan en cada
 *    una. Son campos que suelen repetirse dentro de un lote pero que pertenecen a
 *    la pieza, no al lote.
 *
 * Lo que NO se arrastra nunca: título y medidas. Heredarlos sería inventarse
 * datos de una obra a partir de otra, que es la peor cosa que puede hacer un
 * inventario.
 */
export interface Lote {
  fijos: {
    artista: FondoArtista
    tipoObra: string
  }
  arrastrados: {
    fecha: FechaEstructurada
    tecnica: string
    ubicacion: string
  }
}

export const LOTE_INICIAL: Lote = {
  fijos: { artista: 'ROTILI', tipoObra: '' },
  arrastrados: { fecha: FECHA_VACIA, tecnica: '', ubicacion: '' },
}

const CLAVE = 'catalogador.lote'

/**
 * El lote sobrevive a recargas y a que el móvil descarte la pestaña. En un
 * almacén eso pasa: se bloquea la pantalla, se atiende una llamada, se vuelve.
 * Perder los ajustes del lote a la tercera obra es lo que hace que la gente
 * abandone una herramienta.
 *
 * No se guarda ningún dato de la obra en curso, solo la configuración del lote.
 */
export function leerLote(almacen: Storage | undefined = obtenerAlmacen()): Lote {
  if (!almacen) return LOTE_INICIAL
  try {
    const crudo = almacen.getItem(CLAVE)
    if (!crudo) return LOTE_INICIAL
    return normalizar(JSON.parse(crudo))
  } catch {
    // Un valor corrupto o de una versión anterior no puede impedir catalogar.
    return LOTE_INICIAL
  }
}

export function guardarLote(lote: Lote, almacen: Storage | undefined = obtenerAlmacen()): void {
  try {
    almacen?.setItem(CLAVE, JSON.stringify(lote))
  } catch {
    // Navegación privada o cuota agotada: se sigue trabajando sin persistencia.
  }
}

export function olvidarLote(almacen: Storage | undefined = obtenerAlmacen()): void {
  try {
    almacen?.removeItem(CLAVE)
  } catch {
    /* nada que hacer */
  }
}

/**
 * Comprueba campo a campo lo que viene de fuera. Confiar en la forma de un JSON
 * ajeno es cómo un dato guardado hace meses tumba la aplicación entera.
 */
function normalizar(valor: unknown): Lote {
  if (typeof valor !== 'object' || valor === null) return LOTE_INICIAL
  const v = valor as Record<string, unknown>
  const fijos = (v.fijos ?? {}) as Record<string, unknown>
  const arrastrados = (v.arrastrados ?? {}) as Record<string, unknown>
  const fecha = (arrastrados.fecha ?? {}) as Record<string, unknown>

  return {
    fijos: {
      artista: fijos.artista === 'RUIZ_CAMPINS' ? 'RUIZ_CAMPINS' : 'ROTILI',
      tipoObra: typeof fijos.tipoObra === 'string' ? fijos.tipoObra : '',
    },
    arrastrados: {
      fecha: {
        anio: typeof fecha.anio === 'number' ? fecha.anio : null,
        aproximada: fecha.aproximada === true,
        anioFin: typeof fecha.anioFin === 'number' ? fecha.anioFin : null,
        sinConfirmar: fecha.sinConfirmar === true,
      },
      tecnica: typeof arrastrados.tecnica === 'string' ? arrastrados.tecnica : '',
      ubicacion: typeof arrastrados.ubicacion === 'string' ? arrastrados.ubicacion : '',
    },
  }
}

function obtenerAlmacen(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** Un lote está listo para capturar cuando sus dos campos fijos tienen valor. */
export function loteConfigurado(lote: Lote): boolean {
  return lote.fijos.tipoObra.trim() !== ''
}
