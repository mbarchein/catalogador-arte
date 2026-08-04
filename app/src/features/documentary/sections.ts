/**
 * The five documentary blocks of the record, described once.
 *
 * Procedencia, Bibliografía, Historial expositivo, Documentación relacionada and
 * Obras relacionadas are five different tables and five different screens, but
 * to the cataloger they are the same gesture five times: open a block, see how
 * many there are, see whether anybody has looked, add one. Everything they share
 * — the heading, the noun they count in, the column of `artworks` that carries
 * the state of the research, and above all the sentence an empty one shows —
 * lives here, and each section reads it instead of writing its own.
 *
 * This is not tidiness. «Sin revisar» no es «no» is the rule that decides more
 * screens than any other in this catalogue, and five sections writing it five
 * times would be five different redactions of it: one of them would end up
 * saying that an artwork has never been exhibited when nobody has yet looked.
 *
 * Pure data and pure functions: no React here, so the wording is verified by the
 * battery and not by reading a component.
 */

import type { ArtworkDocumentary } from '../../lib/types'

/** The four `artworks` columns that carry the state of a block's research (RF-218). */
export type ResearchStatusField =
  | 'provenance_status'
  | 'bibliography_status'
  | 'exhibition_history_status'
  | 'documentation_status'

export type DocumentarySectionId =
  | 'provenance'
  | 'bibliography'
  | 'exhibitions'
  | 'documents'
  | 'relationships'

export interface DocumentarySectionSpec {
  id: DocumentarySectionId
  /** Heading of the block on the record, as RF-303 names it. */
  title: string
  /** What the block holds, for the count: «1 exposición». */
  one: string
  /** «3 exposiciones». */
  many: string
  /**
   * What the count says when there are none, with the gender of the noun:
   * «Ninguna registrada» for an exposición, «Ninguno registrado» for a documento.
   * It says REGISTRADA and never «no hay»: that the block is empty is a fact
   * about the catalogue, not about the artwork.
   */
  none: string
  /**
   * The column of `artworks` that says how far the research on this block has
   * got, or null for the block that has none.
   *
   * Only four of the five have one, and it is not an oversight of the schema:
   * related artworks (RF-217) are a fact about the catalogue's own contents, not
   * a line of investigation with archives to visit and letters to write. The
   * consequence has to be visible on screen — see `blockState`.
   */
  statusField: ResearchStatusField | null
  /** Nobody has looked yet. The sentence has to make that different from «no hay». */
  unreviewedText: string
  /** Being looked into, nothing recorded yet. */
  inProgressText: string
  /** Looked into, nothing found. THIS is the datum, and it is said as one. */
  noneFoundText: string
  /** Research closed with nothing in the block. Rare and legitimate; it is not the same as NONE_FOUND. */
  completeText: string
  /** Empty, on the block that carries no research status of its own. */
  plainText: string
}

/**
 * The five blocks in the order the record stacks them (RF-303).
 *
 * Provenance heads the list because it is the block a catalogue raisonné is
 * judged by, and related artworks close it because it is the only one that talks
 * about the catalogue instead of about the world.
 */
export const DOCUMENTARY_SECTIONS: readonly DocumentarySectionSpec[] = [
  {
    id: 'provenance',
    title: 'Procedencia',
    one: 'eslabón',
    many: 'eslabones',
    none: 'Ninguno registrado',
    statusField: 'provenance_status',
    unreviewedText:
      'Sin revisar: nadie ha buscado todavía por qué manos ha pasado esta obra. Que el bloque ' +
      'esté vacío no dice que no tenga procedencia, dice que aún no se ha investigado.',
    inProgressText:
      'Se está reconstruyendo la procedencia y todavía no hay ningún eslabón documentado.',
    noneFoundText:
      'Se ha investigado y no consta ningún propietario, depósito ni préstamo anterior: la obra ' +
      'no tiene procedencia documentada.',
    completeText:
      'La investigación de la procedencia se da por cerrada sin ningún eslabón que registrar.',
    plainText: 'Sin eslabones de procedencia registrados.',
  },
  {
    id: 'bibliography',
    title: 'Bibliografía',
    one: 'referencia',
    many: 'referencias',
    none: 'Ninguna registrada',
    statusField: 'bibliography_status',
    unreviewedText:
      'Sin revisar: nadie ha buscado todavía si esta obra está publicada en algún sitio. Que el ' +
      'bloque esté vacío no dice que sea inédita.',
    inProgressText:
      'Se está buscando bibliografía y todavía no se ha registrado ninguna referencia.',
    noneFoundText:
      'Se ha investigado y no consta que esta obra esté citada en ninguna publicación.',
    completeText:
      'La investigación bibliográfica se da por cerrada sin ninguna referencia que registrar.',
    plainText: 'Sin referencias bibliográficas registradas.',
  },
  {
    id: 'exhibitions',
    title: 'Historial expositivo',
    one: 'exposición',
    many: 'exposiciones',
    none: 'Ninguna registrada',
    statusField: 'exhibition_history_status',
    unreviewedText:
      'Sin revisar: nadie ha buscado todavía si esta obra se ha expuesto. Una obra sin ' +
      'exposiciones registradas no es una obra que no se haya expuesto.',
    inProgressText:
      'Se está reconstruyendo el historial expositivo y todavía no se ha registrado ninguna ' +
      'exposición.',
    noneFoundText: 'Se ha investigado y no consta que esta obra se haya expuesto nunca.',
    completeText:
      'El historial expositivo se da por cerrado sin ninguna exposición que registrar.',
    plainText: 'Sin exposiciones registradas.',
  },
  {
    id: 'documents',
    title: 'Documentación relacionada',
    one: 'documento',
    many: 'documentos',
    none: 'Ninguno registrado',
    statusField: 'documentation_status',
    unreviewedText:
      'Sin revisar: nadie ha buscado todavía cartas, recortes de prensa, carteles ni fotografías ' +
      'de archivo sobre esta obra.',
    inProgressText:
      'Se está vaciando el archivo y todavía no se ha enlazado ningún documento con esta obra.',
    noneFoundText:
      'Se ha buscado en el archivo y no consta ningún documento relacionado con esta obra.',
    completeText:
      'El vaciado del archivo se da por cerrado sin ningún documento que registrar.',
    plainText: 'Sin documentos de archivo relacionados.',
  },
  {
    id: 'relationships',
    title: 'Obras relacionadas',
    one: 'obra relacionada',
    many: 'obras relacionadas',
    none: 'Ninguna registrada',
    // The only block without a research status, and the empty text has to carry
    // that by itself: here nobody can declare «investigado, sin resultados».
    statusField: null,
    unreviewedText: '',
    inProgressText: '',
    noneFoundText: '',
    completeText: '',
    plainText:
      'Sin obras relacionadas registradas. Este bloque no lleva estado de investigación: que ' +
      'esté vacío no dice si se ha buscado o no.',
  },
]

/** The specification of a block by its identifier. */
export function sectionSpec(id: DocumentarySectionId): DocumentarySectionSpec {
  const found = DOCUMENTARY_SECTIONS.find((section) => section.id === id)
  // Unreachable through the type, and cheaper to narrow than to assert.
  if (!found) throw new Error(`Bloque documental desconocido: ${id}`)
  return found
}

/**
 * `3 exposiciones`, `1 exposición`, `Ninguna registrada`.
 *
 * The count is on the heading of a collapsed block, so it is the ONLY thing the
 * cataloger reads before deciding whether to open it, and the empty case has to
 * be a sentence and not a zero: «0 exposiciones» reads as an answer about the
 * artwork, and it is not one.
 */
export function countText(spec: DocumentarySectionSpec, count: number): string {
  if (count <= 0) return spec.none
  return `${count} ${count === 1 ? spec.one : spec.many}`
}

/** The research status of a block, out of the documentary columns of the artwork. */
export function statusOf(
  spec: DocumentarySectionSpec,
  documentary: Pick<ArtworkDocumentary, ResearchStatusField> | null | undefined,
) {
  if (spec.statusField === null || !documentary) return null
  return documentary[spec.statusField]
}

/**
 * Whether a documentary block may offer to change data.
 *
 * **Two conditions, not one, and that is the whole point of this function
 * existing instead of an inline `&&`.** The blocks were first written gated on the
 * permission alone, so a cataloger reading a record found buttons that wrote to the
 * catalogue in the middle of a page meant for reading. RF-308 says the record
 * enters edit mode as a whole; reading it changes nothing.
 *
 * - `writable` is the MODE: true only inside the edit zone.
 * - `canEdit` is the PERMISSION: someone who only consults never writes, and that
 *   is not negotiable by any mode.
 *
 * Neither implies the other, and a block that checks only one is a block that
 * either leaks a write button into the view or offers one to a Reader. Both have
 * happened, which is why the rule is named, tested, and imported instead of
 * retyped in five files.
 */
export function canWriteBlock(writable: boolean, canEdit: boolean): boolean {
  return writable && canEdit
}
