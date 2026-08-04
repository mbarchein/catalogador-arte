/**
 * Declaring how far the research on a documentary block has got (RF-218).
 *
 * This is the control that makes «sin revisar» no es «no» something the
 * cataloger can actually assert: without it every block of every artwork stays
 * in the state it was born in, and the distinction the whole schema pays for is
 * never used.
 *
 * The logic is here and the four options are built here — not inside the sheet —
 * because ONE of them can be refused, and the refusal has to be readable before
 * the button is pressed. The database enforces it (`tg_artwork_research_status_coherent`)
 * and answers in Spanish; this only avoids the round trip and the disappointment.
 *
 * NOTE FOR WHOEVER MOUNTS THE OTHER FOUR BLOCKS: nothing in this module is about
 * exhibitions. It lives in this folder because the exhibition history was the
 * first block built and no block owns it; it takes a `DocumentarySectionSpec` and
 * serves the four blocks that carry a research status. Moving it up to
 * `features/documentary/` is a rename and no more, and it should happen the day a
 * second block needs it — before it gets copied.
 */

import { RESEARCH_STATUS_DESCRIPTION, RESEARCH_STATUS_LABEL, type ResearchStatus } from '../../../lib/types'
import { countText, type DocumentarySectionSpec } from '../sections'

/** The four states, in the order they are offered. */
export const RESEARCH_STATUSES: readonly ResearchStatus[] = [
  'UNREVIEWED',
  'IN_PROGRESS',
  'NONE_FOUND',
  'COMPLETE',
]

export interface ResearchStatusOption {
  value: ResearchStatus
  /** «Investigado, sin resultados». */
  text: string
  /** What choosing it means, under the label. Carries the refusal when there is one. */
  hint: string
  /** Why it cannot be chosen right now, or null when it can. */
  blocked: string | null
}

/**
 * Why declaring `value` would be refused with `count` rows in the block, or null.
 *
 * Only one combination is impossible, and it is impossible in both directions:
 * «Investigado, sin resultados» is a statement that the block is empty, so it
 * cannot be made over a block that is not. Reading it under three exhibitions
 * would be the record lying about the artwork, which is the one failure a
 * catalogue raisonné cannot afford.
 *
 * The sentence is gender-free on purpose («retira antes lo que hay»): it serves
 * eslabones, referencias, exposiciones and documentos out of one string.
 */
export function statusChangeBlocked(
  spec: DocumentarySectionSpec,
  value: ResearchStatus,
  count: number,
): string | null {
  if (value !== 'NONE_FOUND' || count <= 0) return null
  return (
    `No se puede declarar «${RESEARCH_STATUS_LABEL.NONE_FOUND}»: este bloque tiene ` +
    `${countText(spec, count).toLowerCase()}. Retira antes lo que hay, o usa ` +
    `«${RESEARCH_STATUS_LABEL.IN_PROGRESS}» o «${RESEARCH_STATUS_LABEL.COMPLETE}».`
  )
}

/**
 * The four states as the sheet offers them, with the impossible one carrying its
 * own refusal instead of being hidden.
 *
 * Hidden would be worse and it is the tempting shortcut: a cataloger who does not
 * see «Investigado, sin resultados» concludes the catalogue cannot express it,
 * and writes «no se ha expuesto» in a note field where nothing can ever query it.
 */
export function researchStatusOptions(
  spec: DocumentarySectionSpec,
  count: number,
): ResearchStatusOption[] {
  return RESEARCH_STATUSES.map((value) => {
    const blocked = statusChangeBlocked(spec, value, count)
    return {
      value,
      text: RESEARCH_STATUS_LABEL[value],
      hint: blocked ?? RESEARCH_STATUS_DESCRIPTION[value],
      blocked,
    }
  })
}

/**
 * What the button that opens the chooser says.
 *
 * It carries the current state and not just «Estado de la investigación»,
 * because the state is the datum: on a closed block the badge says it, and with
 * the block open under her thumb the cataloger has to be able to read it without
 * scrolling back up to the heading.
 */
export function researchStatusButtonText(status: ResearchStatus | null): string {
  if (status === null) return 'Estado de la investigación: sin leer'
  return `Estado de la investigación: ${RESEARCH_STATUS_LABEL[status].toLowerCase()}`
}
