/**
 * «Sin revisar» no es «no», resolved once.
 *
 * Three situations that look identical on a screen and mean opposite things:
 *
 *   · NOBODY HAS LOOKED. The block is empty and says nothing at all about the
 *     artwork. This is the state every artwork starts in and the one that must
 *     never be read as an answer.
 *   · LOOKED INTO, NOTHING FOUND. The block is empty and that emptiness IS the
 *     datum, paid for with somebody's afternoon in an archive.
 *   · THERE IS DATA. And even then the block may not be finished, which is a
 *     third thing the reader has to be told before quoting it.
 *
 * The database keeps the three apart with `ResearchStatus` (RF-218) and refuses
 * to let the value contradict what is underneath it: `NONE_FOUND` cannot be set
 * on a block that has rows, and rows cannot be added to a block declared
 * `NONE_FOUND`. What is decided here is the other half — what the cataloger
 * READS in each combination — and it is decided in one place because five
 * sections writing it separately is five chances to say «no se ha expuesto» over
 * an artwork nobody has looked up.
 *
 * Pure: takes a specification, a status and a count, and answers text. No React,
 * no query, no DOM.
 */

import { RESEARCH_STATUS_LABEL, type ResearchStatus } from '../../lib/types'
import { countText, type DocumentarySectionSpec } from './sections'

/**
 * How the block should look, not what it says. The component maps these to
 * colours; keeping them as names means the wording and the palette can move
 * independently.
 */
export type BlockTone =
  /** Nobody has looked. Asks for attention without claiming anything is wrong. */
  | 'unreviewed'
  /** Being looked into. */
  | 'progress'
  /** Looked into and settled, with or without findings. */
  | 'settled'
  /** The block carries no research status of its own (related artworks). */
  | 'plain'
  /** The status contradicts the rows. Should be impossible; said out loud if it happens. */
  | 'conflict'

export interface BlockState {
  /** How many rows the block holds right now. */
  count: number
  /** `3 exposiciones` / `Ninguna registrada`. Always something (RF-304). */
  countText: string
  /** The research status, or null on the block that has none. */
  status: ResearchStatus | null
  /** «Investigado, sin resultados». Null when there is no status to show. */
  statusLabel: string | null
  tone: BlockTone
  /**
   * What goes where the rows would go, when there are none. Null when there are
   * rows. Never null-and-empty: an empty block always explains itself.
   */
  emptyText: string | null
  /**
   * What goes ABOVE the rows when what is listed is not necessarily everything.
   * Null when the block is closed or empty.
   */
  partialText: string | null
}

/**
 * What a documentary block says about itself, given its research status and how
 * many rows it holds.
 *
 * The four statuses crossed with empty/non-empty give eight combinations and all
 * eight are answered, including the two the database forbids: a `NONE_FOUND`
 * block with rows in it is a contradiction that can only arrive if a trigger was
 * dropped or a row was restored around it, and the screen says so rather than
 * quietly showing citations under a heading that claims there are none.
 */
export function blockState(
  spec: DocumentarySectionSpec,
  status: ResearchStatus | null,
  count: number,
): BlockState {
  const rows = Math.max(0, Math.trunc(count))
  const common = {
    count: rows,
    countText: countText(spec, rows),
    status,
    statusLabel: status === null ? null : RESEARCH_STATUS_LABEL[status],
  }

  // The block without a research status of its own: it can say what it holds and
  // nothing about whether anybody looked, and that limit is stated instead of
  // being left for the reader to assume the wrong way round.
  if (status === null) {
    return {
      ...common,
      tone: 'plain',
      emptyText: rows === 0 ? spec.plainText : null,
      partialText: null,
    }
  }

  if (rows === 0) {
    return {
      ...common,
      tone: status === 'UNREVIEWED' ? 'unreviewed' : status === 'IN_PROGRESS' ? 'progress' : 'settled',
      emptyText:
        status === 'UNREVIEWED'
          ? spec.unreviewedText
          : status === 'IN_PROGRESS'
            ? spec.inProgressText
            : status === 'NONE_FOUND'
              ? spec.noneFoundText
              : spec.completeText,
      partialText: null,
    }
  }

  if (status === 'NONE_FOUND') {
    return {
      ...common,
      tone: 'conflict',
      emptyText: null,
      partialText:
        `Este bloque está marcado como «${RESEARCH_STATUS_LABEL.NONE_FOUND}» y sin embargo ` +
        `contiene ${common.countText.toLowerCase()}. Es una contradicción que la base no debería ` +
        'permitir: avisa al equipo antes de citar nada de aquí.',
    }
  }

  return {
    ...common,
    tone: status === 'UNREVIEWED' ? 'unreviewed' : status === 'IN_PROGRESS' ? 'progress' : 'settled',
    emptyText: null,
    partialText:
      status === 'UNREVIEWED'
        ? 'Hay datos, pero el bloque sigue marcado como «Sin revisar»: nadie ha declarado que ' +
          'esto sea todo lo que hay.'
        : status === 'IN_PROGRESS'
          ? 'La investigación de este bloque sigue en curso: puede faltar algo por registrar.'
          : null,
  }
}

/**
 * Whether the block should already be open when the record paints.
 *
 * Closed, as a rule: five blocks open at once turn a record read with one thumb
 * into a scroll, and the heading of a closed block already carries the count and
 * the state of its research, which is what one comes to check.
 *
 * The exception is the contradiction. A block whose declared status disagrees
 * with what it contains is the one thing that must not be behind a fold: it is
 * the case where reading the heading alone would mislead.
 */
export function opensByDefault(state: BlockState): boolean {
  return state.tone === 'conflict'
}
