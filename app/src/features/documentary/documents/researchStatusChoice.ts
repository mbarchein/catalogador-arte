/**
 * Declaring how far the research on a documentary block has got (RF-218).
 *
 * This is the other half of `blockState`: that one decides what an empty block
 * READS as, this one decides what the cataloger may DECLARE about it. Both exist
 * because «sin revisar» no es «no», and the value only means something if somebody
 * can actually change it from the record — a status that nobody can set is a
 * status that stays `UNREVIEWED` forever and teaches the reader to ignore it.
 *
 * ── Por qué una opción puede estar apagada ──
 * The database refuses to declare «Investigado, sin resultados» over a block that
 * already holds rows, and refuses to add rows to a block declared that way. That
 * rule lives next to the data and is NOT reimplemented here: what is done here is
 * to stop offering an option that is going to be refused, and to say why in the
 * same place the option is. Offering it and showing the refusal afterwards would
 * be a screen that lets you press a button in order to be told no.
 *
 * The refusal still arrives from the database whenever the two disagree — another
 * session may add a citation between the render and the tap — and it is shown
 * verbatim. This is the courtesy, not the perimeter.
 *
 * Pure and generic: it takes the specification of ANY of the four blocks that
 * carry a status, so the day the second one is built this moves up a folder
 * unchanged.
 */

import {
  RESEARCH_STATUS_DESCRIPTION,
  RESEARCH_STATUS_LABEL,
  type ResearchStatus,
} from '../../../lib/types'
import type { BlockState } from '../researchState'
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
  /** True when the database would refuse it: it is shown, greyed, with its reason. */
  disabled: boolean
}

/**
 * The four states to choose from, with the one the database would refuse turned
 * off and explaining itself.
 *
 * The refused one is SHOWN and not hidden: a menu that is missing an option looks
 * like an application that does not have it, and «Investigado, sin resultados» is
 * precisely the value a cataloger goes looking for after an afternoon in an
 * archive. Seeing it greyed, with the reason next to it, is what tells her the
 * value exists and what stands between her and it.
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
          'en el bloque. Sería decir que no hay nada justo encima de lo que hay.'
        : RESEARCH_STATUS_DESCRIPTION[value],
      disabled: blocked,
    }
  })
}

/**
 * What the block says when the state of its research could not be read (RF-304).
 *
 * The rows may have loaded perfectly while the artwork's own row did not, and then
 * the heading has a count and no badge. Left like that, an empty block would read
 * as «no hay nada» when what happened is that nobody knows whether anybody looked
 * — which is the one confusion this whole feature exists to prevent.
 *
 * Null when there is nothing to warn about: the status is known, or it is still on
 * its way and the heading already says «Cargando…».
 */
export function statusUnknownNotice(
  spec: DocumentarySectionSpec,
  input: { status: ResearchStatus | null; loading: boolean; error?: string | null },
): string | null {
  if (spec.statusField === null) return null
  if (input.loading || input.status !== null) return null
  const aside = input.error ? ` (${input.error})` : ''
  return (
    `No se ha podido leer si alguien ha investigado este bloque${aside}, así que lo que se ve ` +
    'aquí no dice si está completo ni si alguien ha buscado. Vuelve a cargar la ficha.'
  )
}

/**
 * The warning, put where it will actually be read.
 *
 * A block whose status could not be read AND holds no rows is the dangerous
 * combination, and it is also the one where the warning is hardest to place:
 * `DocumentarySection` paints the empty sentence INSTEAD of the body, so a notice
 * rendered among the rows would be invisible in exactly that case. So it goes into
 * the state — appended to the empty sentence when the block is empty, above the
 * rows when it is not — and the section keeps having one place where each thing is
 * said.
 *
 * The state is returned untouched when there is nothing to warn about, which is
 * every ordinary render.
 */
export function withStatusUnknown(state: BlockState, notice: string | null): BlockState {
  if (notice === null) return state
  return {
    ...state,
    emptyText: state.emptyText === null ? null : `${state.emptyText} ${notice}`,
    partialText: state.partialText === null ? notice : `${state.partialText} ${notice}`,
  }
}
