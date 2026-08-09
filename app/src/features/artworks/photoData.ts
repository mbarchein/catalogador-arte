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
  /** Quién la hizo. Se enseña cuando la procedencia es propia. */
  credit: string
  /** De dónde salió. Se enseña cuando no lo es. */
  origin: string
}

/** Lo que hay guardado, como borrador de partida. */
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

/** El texto que toca enseñar con la procedencia elegida ahora mismo. */
export function draftSourceText(draft: PhotoDataDraft): string {
  return photoSourceField(draft.provenance) === 'credit' ? draft.credit : draft.origin
}

/** El borrador con ese texto cambiado, sin tocar el otro. */
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

/** Lo que se manda a la base: las cuatro columnas, con los textos recortados. */
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

/** Los títulos de las cuatro secciones del panel, en el orden en que se leen. */
export const PHOTO_SECTIONS = {
  data: 'Qué es esta toma',
  image: 'La imagen',
  order: 'Orden y portada',
  remove: 'Retirar',
} as const

/** Lo que se lee bajo el botón de guardar, o null cuando no hay nada pendiente. */
export function pendingDataNotice(dirty: boolean): string | null {
  return dirty ? 'Hay cambios sin guardar en esta toma.' : null
}
