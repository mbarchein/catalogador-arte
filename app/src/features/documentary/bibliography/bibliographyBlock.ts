/**
 * What the bibliography block shows while its TWO queries settle, and what it
 * refuses before asking the database (RF-218, RF-304, RF-504).
 *
 * The block reads two independent things: the citations of the artwork, and the
 * column of `artworks` that says whether anybody has looked for them. They arrive
 * separately — one query per block, plus the single documentary row the record
 * loads once for the five — and the awkward combination is the one that needs
 * deciding here: the citations loaded and the research state did not.
 *
 * Painting «Ninguna registrada» in that state would publish the exact sentence
 * this whole feature exists to prevent. With no research state the block cannot
 * tell «nadie ha buscado» from «se ha buscado y esta obra es inédita», so it says
 * out loud that it cannot tell, instead of letting an empty list be read as an
 * answer about the artwork.
 *
 * Pure, and separate from the component, because the battery runs in node: what
 * gets verified is the sentence and the rule, not a rendered block.
 */

import type { ResearchStatus } from '../../../lib/types'
import type { BlockState } from '../researchState'

export interface BibliographyLoadInput {
  /** The citations query is in flight. */
  rowsLoading: boolean
  /** The citations query failed. Its message, verbatim from the database. */
  rowsError: string | null
  /** The research state of the block, null while unread or unreadable. */
  status: ResearchStatus | null
  /** The documentary row of the artwork is in flight. */
  statusLoading: boolean
  /** The documentary row failed. */
  statusError?: string | null
}

export interface BibliographyLoadState {
  /** The heading says «Cargando…» and claims no count. */
  loading: boolean
  /** Nothing is shown at all. Only a failure of the CITATIONS gets here. */
  error: string | null
  /**
   * The research state could not be read, and the block has to admit it. Null on
   * every ordinary render.
   */
  statusUnknownNotice: string | null
}

/**
 * The three things the block needs to know before painting anything.
 *
 * A failure of the citations themselves wins over everything and blanks the
 * block: a bibliography missing one row is worse than no bibliography, because
 * nothing on screen would say which citation is not there.
 *
 * A failure of the research state does NOT blank it. The citations are real and
 * readable, and hiding them because a second query failed would lose data that
 * arrived perfectly well. What it does is add the notice: the rows are shown, and
 * the block stops claiming to know whether they are all there are.
 */
export function bibliographyLoadState(input: BibliographyLoadInput): BibliographyLoadState {
  if (input.rowsError !== null) {
    return { loading: false, error: input.rowsError, statusUnknownNotice: null }
  }
  if (input.rowsLoading || input.statusLoading) {
    return { loading: true, error: null, statusUnknownNotice: null }
  }
  if (input.status === null) {
    const message = (input.statusError ?? '').trim()
    return {
      loading: false,
      error: null,
      statusUnknownNotice:
        'No se ha podido leer si alguien ha buscado la bibliografía de esta obra: que aquí no ' +
        'aparezca ninguna referencia no significa que la obra sea inédita.' +
        (message === '' ? '' : ` (${message})`),
    }
  }
  return { loading: false, error: null, statusUnknownNotice: null }
}

/**
 * The block's state with that notice put where it will actually be read.
 *
 * It cannot simply be painted among the rows, and that is the whole reason this
 * function exists: `DocumentarySection` renders its children only when the block
 * HAS rows, so on an empty block — precisely the case where the missing research
 * state decides how the emptiness is read — a notice among the children would
 * never appear at all.
 *
 * So it is appended to the empty sentence when the block is empty, and rides
 * above the rows when it is not. Appended and not substituted: «Sin referencias
 * bibliográficas registradas» is still true and still worth reading, and what the
 * notice adds is that nobody can say what that emptiness means.
 *
 * With no notice the state comes back untouched, which is every ordinary render.
 */
export function bibliographyBlockState(state: BlockState, notice: string | null): BlockState {
  if (notice === null) return state
  return {
    ...state,
    emptyText: state.emptyText === null ? null : `${state.emptyText} ${notice}`,
    partialText: state.partialText === null ? notice : `${state.partialText} ${notice}`,
  }
}

/**
 * Why a citation cannot be added right now, before asking the database, or null
 * when it can.
 *
 * The database refuses to add a citation to a block declared «Investigado, sin
 * resultados» (`tg_artwork_citation_status_coherent`) and says so in Spanish, and
 * that refusal is shown verbatim when it arrives — another session may declare
 * the state between this render and the tap. But a control that is certain to be
 * refused has to say so BEFORE it is pressed: the cataloger is standing in a
 * warehouse with one bar of signal, and a round trip to be told no is worse than
 * a disabled button that explains itself.
 *
 * The wording follows the database's own hint instead of writing a second version
 * of the rule: change the state of the research first.
 */
export function citeBlockedReason(status: ResearchStatus | null): string | null {
  if (status !== 'NONE_FOUND') return null
  return (
    'La bibliografía consta «Investigado, sin resultados»: ponla en «Investigación en curso» o «Investigación completa».'
  )
}
