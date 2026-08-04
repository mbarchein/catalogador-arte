/**
 * The four states of the research on a block, as a chooser (RF-218).
 *
 * The states themselves and their words are already decided in `types.ts`
 * (`RESEARCH_STATUS_LABEL`, `RESEARCH_STATUS_DESCRIPTION`). What is decided here
 * is the one thing that depends on the block in front of you: whether
 * «Investigado, sin resultados» can be declared at all.
 *
 * The database refuses it over a block that holds rows, and says so in Spanish
 * (`tg_artwork_citation_status_coherent`). That refusal is the last word and it
 * is shown verbatim when it happens — but offering an option that is certain to
 * fail is not honesty, it is a wasted round trip in a warehouse with one bar of
 * signal. So the option is listed, disabled, saying WHY: hiding it would be
 * worse, because then the state nobody can reach is also a state nobody knows
 * exists.
 */

import {
  RESEARCH_STATUS_DESCRIPTION,
  RESEARCH_STATUS_LABEL,
  type ResearchStatus,
} from '../../../lib/types'

/** The four values, in the order they are offered: from «nobody looked» to «closed». */
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
  /** What the state means, or why it cannot be chosen here. Never empty. */
  hint: string
  /** False when choosing it would be refused by the database. */
  available: boolean
  /** True for the state the block is in right now. */
  current: boolean
}

/**
 * The states on offer for a block that holds `count` rows.
 *
 * `NONE_FOUND` is the only one that can be unavailable, and only when the block
 * is not empty. Everything else is always reachable, including going back to
 * «Sin revisar»: a research state is a statement somebody made, and taking a
 * statement back has to be as easy as making it.
 *
 * The current value is always marked, even when it is unavailable — that is the
 * contradiction `blockState` paints in red, and a chooser that shows no
 * selection over it would look like the block has no state at all.
 */
export function researchStatusOptions(
  current: ResearchStatus,
  count: number,
): ResearchStatusOption[] {
  return RESEARCH_STATUSES.map((value) => {
    const blocked = value === 'NONE_FOUND' && count > 0
    return {
      value,
      text: RESEARCH_STATUS_LABEL[value],
      hint: blocked
        ? 'No se puede declarar mientras el bloque tenga referencias: quítalas antes, o usa ' +
          '«Investigación completa» si lo das por cerrado con lo que hay.'
        : RESEARCH_STATUS_DESCRIPTION[value],
      available: !blocked,
      current: value === current,
    }
  })
}
