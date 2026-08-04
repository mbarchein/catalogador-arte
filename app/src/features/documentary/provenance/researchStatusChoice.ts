/**
 * Declaring how far the research on the provenance has got (RF-218).
 *
 * The other half of `blockState`: that one decides what an empty block READS as,
 * this one decides what the cataloger may DECLARE about it. A status nobody can
 * change from the record stays `UNREVIEWED` for ever, and a value that never
 * changes teaches the reader to ignore it — which would take «sin revisar» no es
 * «no» down with it.
 *
 * **Why an option can be off.** The database refuses to declare «Investigado, sin
 * resultados» over a block that already holds rows, and refuses to add rows to a
 * block declared that way. That rule lives next to the data and is NOT
 * reimplemented here: what is done here is to stop offering an option that is
 * going to be refused, and to say why in the same place the option is. The
 * refusal still arrives from the database when the two disagree — another session
 * may add a link between the render and the tap — and it is shown verbatim.
 *
 * Pure and generic over any of the four blocks that carry a status, so the day
 * these four copies are merged this one moves up a folder unchanged.
 */

import {
  RESEARCH_STATUS_DESCRIPTION,
  RESEARCH_STATUS_LABEL,
  type ResearchStatus,
} from '../../../lib/types'
import type { DocumentarySectionSpec } from '../sections'

/** The four states in the order they are offered, from «nobody looked» to «closed». */
export const RESEARCH_STATUS_ORDER: readonly ResearchStatus[] = [
  'UNREVIEWED',
  'IN_PROGRESS',
  'NONE_FOUND',
  'COMPLETE',
]

export interface ResearchStatusOption {
  value: ResearchStatus
  /** «Investigado, sin resultados». */
  text: string
  /** What choosing it means, or why it cannot be chosen right now. */
  hint: string
  /** The database would refuse it: shown, greyed, with its reason. */
  disabled: boolean
}

/**
 * The four states to choose from, with the one the database would refuse turned
 * off and explaining itself.
 *
 * The refused one is SHOWN and not hidden: a menu missing an option looks like an
 * application that does not have it, and «Investigado, sin resultados» is
 * precisely the value a cataloger goes looking for after an afternoon in an
 * archive with nothing to show for it. Greyed, with the reason beside it, is what
 * tells her the value exists and what stands between her and it.
 */
export function researchStatusOptions(
  spec: DocumentarySectionSpec,
  count: number,
): ResearchStatusOption[] {
  const rows = Math.max(0, Math.trunc(count))
  return RESEARCH_STATUS_ORDER.map((value) => {
    const blocked = value === 'NONE_FOUND' && rows > 0
    return {
      value,
      text: RESEARCH_STATUS_LABEL[value],
      hint: blocked
        ? `No se puede declarar con ${rows === 1 ? `1 ${spec.one}` : `${rows} ${spec.many}`} ` +
          'en el bloque: sería decir que no hay nada justo encima de lo que hay. Retíralos antes.'
        : RESEARCH_STATUS_DESCRIPTION[value],
      disabled: blocked,
    }
  })
}

/**
 * What the block says when the state of its research could not be read (RF-304).
 *
 * The links may have loaded perfectly while the artwork's own row did not, and
 * then the heading has a count and no badge. Left like that, an empty block reads
 * as «no hay nada» when what happened is that nobody knows whether anybody looked
 * — the exact confusion this whole feature exists to prevent.
 *
 * Null when there is nothing to warn about: the status is known, or it is still
 * on its way and the heading already says «Cargando…».
 */
export function statusUnknownNotice(
  spec: DocumentarySectionSpec,
  input: { status: ResearchStatus | null; loading: boolean; error?: string | null },
): string | null {
  if (spec.statusField === null) return null
  if (input.loading || input.status !== null) return null
  const aside = input.error ? ` (${input.error})` : ''
  return (
    `No se ha podido leer si alguien ha investigado la procedencia${aside}, así que lo que se ve ` +
    'aquí no dice si la cadena está completa ni si alguien ha buscado. Vuelve a cargar la ficha.'
  )
}
