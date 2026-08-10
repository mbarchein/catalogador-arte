import type { PhotoProvenance, ShotTypeValue } from '../../lib/types'
import { cleanPhotoSource, photoSourceField } from './photoSource'

/**
 * Los datos de una toma, como un formulario (RF-417, RF-405).
 *
 * ── POR QUÉ ESTO ES UN FORMULARIO Y NO TRES CONTROLES SUELTOS ──
 *
 * El panel de una fotografía tenía nueve cosas apiladas en una caja sin un solo
 * título, y cada control guardaba por su cuenta: los chips al tocarlos y el campo
 * de texto al salir de él. Eso último es medio invisible en un móvil —se toca
 * fuera y no se sabe si entró, o se cierra la pantalla y se pierde—, y conviven
 * dos formas de guardar en el mismo bloque, que es lo que hace que no se sepa
 * cuándo hay algo pendiente.
 *
 * Ahora los tres son un formulario con «Guardar»: **nada se escribe hasta
 * pulsarlo** y la pantalla puede decir si queda algo sin guardar. Es lo mismo que
 * hace el formulario de la ficha, así que las dos pantallas se comportan igual.
 *
 * ── LOS DOS TEXTOS VIAJAN JUNTOS ────────────────────────────
 *
 * El borrador guarda **las dos** columnas de texto y no solo la que se está
 * enseñando, porque la procedencia se puede cambiar sin guardar: quien marque
 * «tomada de otro catálogo» tiene que ver el campo del origen vacío y recuperar su
 * autoría intacta si vuelve atrás. Con un solo texto en el borrador, ese viaje de
 * ida y vuelta se llevaría por delante lo que hubiera escrito.
 */

export interface PhotoDataDraft {
  shotType: ShotTypeValue
  provenance: PhotoProvenance
  /** Who took it. Shown when the provenance is our own. */
  credit: string
  /** Where it came from. Shown when it is not. */
  origin: string
}

/** What is stored, as the starting draft. */
export function photoDataDraft(saved: {
  shot_type: ShotTypeValue
  provenance: PhotoProvenance
  photo_credit: string
  provenance_source: string
}): PhotoDataDraft {
  return {
    shotType: saved.shot_type,
    provenance: saved.provenance,
    credit: saved.photo_credit,
    origin: saved.provenance_source,
  }
}

/** The text to show with the provenance chosen right now. */
export function draftSourceText(draft: PhotoDataDraft): string {
  return photoSourceField(draft.provenance) === 'credit' ? draft.credit : draft.origin
}

/** The draft with that text changed, without touching the other one. */
export function withSourceText(draft: PhotoDataDraft, value: string): PhotoDataDraft {
  return photoSourceField(draft.provenance) === 'credit'
    ? { ...draft, credit: value }
    : { ...draft, origin: value }
}

/**
 * Si hay algo que guardar.
 *
 * Los textos se comparan recortados: unos espacios de más no son un cambio, y sin
 * esto abrir el campo y cerrarlo dejaría el botón encendido para siempre.
 */
export function photoDataDirty(draft: PhotoDataDraft, saved: PhotoDataDraft): boolean {
  return (
    draft.shotType !== saved.shotType ||
    draft.provenance !== saved.provenance ||
    cleanPhotoSource(draft.credit) !== cleanPhotoSource(saved.credit) ||
    cleanPhotoSource(draft.origin) !== cleanPhotoSource(saved.origin)
  )
}

/** What is sent to the base: the four columns, with the texts trimmed. */
export function photoDataColumns(draft: PhotoDataDraft): {
  shot_type: ShotTypeValue
  provenance: PhotoProvenance
  photo_credit: string
  provenance_source: string
} {
  return {
    shot_type: draft.shotType,
    provenance: draft.provenance,
    photo_credit: cleanPhotoSource(draft.credit),
    provenance_source: cleanPhotoSource(draft.origin),
  }
}

/**
 * Los títulos de las secciones del panel, en el orden en que se leen.
 *
 * Eran cuatro y queda una. Las otras tres se fueron por el mismo camino y por el
 * mismo motivo: girar y recortar, la portada, el orden y quitar **actúan sobre la
 * toma que se está mirando**, así que ahora son iconos sobre la propia fotografía
 * y su estado se lee debajo de ella. Lo que queda aquí es lo único que se
 * escribe, y por eso es lo único que tiene «Guardar».
 *
 * Sigue siendo un objeto con un solo título, y no una constante suelta: la
 * sección puede volver a tener compañía, y el sitio donde se decide cómo se llama
 * un bloque de este panel no debería mudarse por eso.
 */
export const PHOTO_SECTIONS = {
  data: 'Qué es esta toma',
} as const

/** What is read under the save button, or null when nothing is pending. */
export function pendingDataNotice(dirty: boolean): string | null {
  return dirty ? 'Hay cambios sin guardar en esta toma.' : null
}
