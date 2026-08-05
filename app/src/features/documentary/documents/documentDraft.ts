/**
 * La ficha de un documento de archivo mientras se escribe (RF-515, RF-408).
 *
 * Everything the form decides lives here and not in the component: what a
 * half-filled document is missing, what the database will refuse and why, and
 * what exactly gets sent. The battery runs in node and cannot open a form, so a
 * rule left inside JSX is a rule nobody checks.
 *
 * The refusals mirror the CHECK constraints of `archive_documents` one by one, and
 * that is a deliberate second copy: the database is the authority and its sentence
 * is shown verbatim when it speaks, but a form that only finds out on save makes
 * the cataloger fill it twice — standing up, in a warehouse, with the paper in her
 * other hand.
 *
 * **`describeDocumentRefusal` was measured, not imagined.** Every message it maps
 * was provoked against the running base with BEGIN/ROLLBACK and read; the ones
 * that arrive in English naming an index are translated, and the one a trigger
 * already wrote in Spanish for the cataloger is shown as it is.
 */

import type { ArtistFund } from '../../../lib/types'
import { structuredDateText } from '../documentaryFormat'

/**
 * Plausible years for a document, as the DATABASE checks them: 1000..2100
 * (`archive_documents_plausible_years`).
 *
 * Wider than the artworks' window on purpose and NOT narrowed here: an archive
 * holds context documents that are older than both artists — a nineteenth-century
 * deed, a facsimile of a mediaeval charter — and refusing them from the form would
 * refuse a document the catalogue accepts.
 */
export const DOCUMENT_MIN_YEAR = 1000
export const DOCUMENT_MAX_YEAR = 2100

/**
 * The document itself while it is being written. NOT a row: it has no `id`, no
 * `date_text` — generated — and no file columns, which `documentUpload.ts` builds
 * together from the picked file so that three of the four can never be sent.
 *
 * It is split from `NewDocumentDraft` because there are now TWO forms over these
 * same fields — registering a document and correcting one — and every rule about
 * them (what is missing, what the database will refuse, what travels) has to be one
 * copy. What the two forms do NOT share is `linkNote`, which is not a field of the
 * document at all.
 */
export interface DocumentFields {
  /** Signature of the folder («AR-ARCH-0001»). Optional, unique, editable later. */
  archiveCode: string
  /** Title or short description. The only thing the database demands. */
  title: string
  documentTypeId: string | null
  archiveSeriesId: string | null
  /** Null is «no es de un solo fondo», a legitimate answer and not a gap. */
  artistFund: ArtistFund | null
  startYear: number | null
  endYear: number | null
  approximate: boolean
  unconfirmed: boolean
  /** The date the structure could not hold: «finales de los setenta». It wins when printing (ADR-004). */
  dateNote: string
  /** Where the paper is, in the SAME tree as the artworks (ADR-006). */
  physicalPlaceId: string | null
  /** What the archive says about the document itself. */
  note: string
}

/**
 * A document being registered from an artwork's record: its own fields, plus what
 * it says about THAT artwork.
 *
 * `linkNote` travels to the bridge row (RF-516) and not to the document. They are
 * two different notes on purpose — one says what the cutting is, the other says why
 * it matters to THIS artwork — and the forms ask them separately because merging
 * them would put words in the cataloger's mouth for every other artwork the
 * document is linked to.
 */
export interface NewDocumentDraft extends DocumentFields {
  linkNote: string
}

/**
 * A blank document.
 *
 * Everything optional starts empty and nothing starts guessed. In particular
 * `artistFund` starts null and not at the fund of the artwork being catalogued,
 * which would be the tempting default and would be a fabricated datum: a cutting
 * about a joint show belongs to no single fund, and the column was made nullable
 * for exactly that case.
 */
export function emptyNewDocumentDraft(): NewDocumentDraft {
  return {
    archiveCode: '',
    title: '',
    documentTypeId: null,
    archiveSeriesId: null,
    artistFund: null,
    startYear: null,
    endYear: null,
    approximate: false,
    unconfirmed: false,
    dateNote: '',
    physicalPlaceId: null,
    note: '',
    linkNote: '',
  }
}

/** Where a refusal belongs, so the form can put it next to what caused it. */
export type DocumentDraftField = 'title' | 'code' | 'years' | 'flags'

export interface DocumentDraftProblem {
  field: DocumentDraftField
  text: string
}

/**
 * What stops this document from being saved, in the order the form reads.
 *
 * Empty means the database will accept it. Each entry mirrors one constraint, and
 * all four were provoked and read:
 *
 *   · `archive_documents_title_not_blank` — a document with nothing to name it
 *     cannot be found again, which is why it is the only required field.
 *   · `archive_documents_code_shape` — a signature is trimmed and non-empty. A
 *     string of spaces would pass for a code and become a hole with a unique
 *     index on it.
 *   · `archive_documents_coherent_range` — `>=`, not `>`: a correspondence folder
 *     opened and closed in 1985 is a real range and «1985-1985» is what gets
 *     stored. And an end with no beginning is half a date.
 *   · `archive_documents_flags_require_year` — «c.» and «[?]» talk about a year.
 *   · `archive_documents_plausible_years` — outside 1000..2100 it is a typo.
 */
export function documentDraftProblems(draft: DocumentFields): DocumentDraftProblem[] {
  const problems: DocumentDraftProblem[] = []

  if (draft.title.trim() === '') {
    problems.push({
      field: 'title',
      text:
        'Ponle un título o una descripción corta: es lo único imprescindible, porque un documento ' +
        'sin nada que lo nombre no se vuelve a encontrar («Carta de la galería sobre la muestra ' +
        'de 1985»).',
    })
  }

  // Only the shape is checked, and NOT whether the signature is already taken:
  // that is a unique index over `place_key(archive_code)` and the form has no
  // list of the archive's codes to compare against. The database answers it, and
  // `describeDocumentRefusal` translates the answer.
  const code = draft.archiveCode
  if (code !== '' && code.trim() === '') {
    problems.push({
      field: 'code',
      text: 'La signatura no puede ser solo espacios. Déjala vacía si el documento no tiene todavía.',
    })
  }

  if (draft.endYear !== null && draft.startYear === null) {
    problems.push({
      field: 'years',
      text: 'Hay año final y no hay año inicial: una fecha tiene que empezar en algún sitio.',
    })
  }

  if (draft.startYear !== null && draft.endYear !== null && draft.endYear < draft.startYear) {
    problems.push({
      field: 'years',
      text: `El año final (${draft.endYear}) es anterior al inicial (${draft.startYear}).`,
    })
  }

  for (const [year, which] of [
    [draft.startYear, 'inicial'],
    [draft.endYear, 'final'],
  ] as const) {
    if (year !== null && (year < DOCUMENT_MIN_YEAR || year > DOCUMENT_MAX_YEAR)) {
      problems.push({
        field: 'years',
        text: `El año ${which} (${year}) está fuera de ${DOCUMENT_MIN_YEAR}-${DOCUMENT_MAX_YEAR}: es una errata, no una fecha.`,
      })
    }
  }

  if (draft.startYear === null && (draft.approximate || draft.unconfirmed)) {
    problems.push({
      field: 'flags',
      text:
        '«Aproximada» y «sin confirmar» hablan de un año, y este documento no lo tiene: sin año no ' +
        'hay nada que aproximar ni que poner en duda.',
    })
  }

  return problems
}

/** Whether the document can be sent. */
export function documentDraftIsSaveable(draft: DocumentFields): boolean {
  return documentDraftProblems(draft).length === 0
}

/** The refusals that belong beside one field of the form. */
export function problemsOf(
  problems: readonly DocumentDraftProblem[],
  field: DocumentDraftField,
): DocumentDraftProblem[] {
  return problems.filter((problem) => problem.field === field)
}

/**
 * The date as the database will store it, for the preview under the fields.
 *
 * It goes through `structuredDateText` — the mirror of the generated column of
 * THESE tables — and not through `composeDate`, which trims a range whose end
 * equals its start. Here «1985-1985» is what gets stored, and a preview that
 * disagrees with the stored value is worse than no preview.
 */
export function documentDatePreview(draft: DocumentFields): string {
  return structuredDateText({
    start_year: draft.startYear,
    end_year: draft.endYear,
    approximate_date: draft.approximate,
    unconfirmed_date: draft.unconfirmed,
    date_note: draft.dateNote,
  })
}

/**
 * What travels to `archive_documents` on the insert.
 *
 * `date_text` is NOT here and that is the point of building the payload apart from
 * the draft: it is a stored generated column and any value sent for it is an
 * error. The four file columns are not here either — `documentUpload.ts` adds them
 * as a block, because `archive_documents_file_all_or_nothing` demands all four or
 * none and a payload that can carry three of them is a bug waiting for a form to
 * make it.
 *
 * An empty signature goes as NULL and not as an empty string: the column allows
 * null for a cutting nobody has filed yet, and `archive_documents_code_shape`
 * refuses «». The flags are normalised against the year instead of being trusted,
 * so dropping the year of a document marked «c.» cannot send a combination the
 * database refuses.
 */
export function documentDraftPayload(
  draft: DocumentFields,
): Record<string, unknown> & { title: string; archive_code: string | null } {
  const dated = draft.startYear !== null
  const code = draft.archiveCode.trim()
  return {
    archive_code: code === '' ? null : code,
    artist_fund: draft.artistFund,
    document_type_id: draft.documentTypeId,
    title: draft.title.trim(),
    archive_series_id: draft.archiveSeriesId,
    start_year: draft.startYear,
    end_year: dated ? draft.endYear : null,
    approximate_date: dated && draft.approximate,
    unconfirmed_date: dated && draft.unconfirmed,
    date_note: draft.dateNote.trim(),
    physical_place_id: draft.physicalPlaceId,
    note: draft.note.trim(),
  }
}

// ── Cuando la base dice no ────────────────────────────────────

/** What this block can be refused for. */
export type DocumentAction =
  | 'create'
  | 'link'
  | 'retire'
  | 'editNote'
  | 'load'
  /** Correcting the document's own data — shared with every artwork linked to it. */
  | 'edit'
  /** Giving a document that was registered «sin digitalizar» its scan. */
  | 'addFile'

/**
 * A refusal as PostgREST sends it: the SQLSTATE, the message and the hint, in
 * three separate fields.
 *
 * Declared here instead of importing `PostgrestError` so this module stays free of
 * the client, and because only these three are read. A `PostgrestError` fits.
 */
export interface DatabaseRefusal {
  code?: string | null
  message: string
  hint?: string | null
}

const VERB: Record<DocumentAction, string> = {
  create: 'registrar el documento',
  link: 'enlazar el documento con esta obra',
  retire: 'quitar el documento de la ficha',
  editNote: 'guardar lo que este documento dice de la obra',
  load: 'cargar el archivo',
  edit: 'corregir los datos del documento',
  addFile: 'añadir el escaneo al documento',
}

/**
 * The sentence the screen shows when the database says no.
 *
 * **Every case below was provoked against the local base and read**, with
 * BEGIN/ROLLBACK over the real schema:
 *
 *  - `23505` on `archive_documents_code_unique`: «duplicate key value violates
 *    unique constraint "archive_documents_code_unique"», with the detail
 *    «Key (place_key(archive_code))=(ar-arch-0001) already exists». The index is
 *    over `place_key`, so capitals and accents do not tell two signatures apart —
 *    which is the half of the rule the raw message never says.
 *  - `23514` three ways, and they are three different mistakes: the blank title,
 *    the four file columns arriving half filled, and a file of zero bytes. The
 *    message names the constraint and nothing else, so the name is the only thing
 *    that distinguishes them.
 *  - `P0001` for the trigger of RF-218: «La documentación de la obra AR-0001
 *    consta investigada sin resultado y este vínculo la contradice», hint «Cambia
 *    antes el estado de la documentación a «En curso» o «Completa».» **Already in
 *    Spanish and written for the cataloger**, so it is shown as it is, with the
 *    hint joined — rewriting it would be a second copy of a rule that lives next
 *    to the data. `document_artwork` raises here too when the session may not
 *    write («No tienes permiso para vincular un documento con una obra»).
 *  - `23503` on `artwork_documents_catalog_id_fkey`: the artwork is not there.
 *    Cannot happen from a record that is open, and one mapped code costs a line.
 *  - `42501` when the session may no longer write at all.
 *  - no code, which is the network: the request never reached the catalogue, and
 *    saying so also says that nothing was half written.
 *
 * `null` is the quiet failure and the one worth the most: an update the policies
 * deny comes back 204 — or 200 with an empty list — and NO error. Without counting
 * the affected rows the screen would report «guardado» and change nothing.
 */
export function describeDocumentRefusal(
  action: DocumentAction,
  refusal: DatabaseRefusal | null,
): string {
  if (refusal === null) {
    // El silencio de `addFile` tiene una causa MÁS y es la primera que hay que
    // nombrar: la actualización solo toca la fila si sigue sin fichero, así que
    // «cero filas» es sobre todo que alguien se ha adelantado. Sin decirlo, la
    // catalogadora vuelve a subir el mismo escaneo contra un documento que ya tiene
    // uno, y lo que consigue son dos ficheros de los que solo uno consta.
    if (action === 'addFile') {
      return (
        'No se ha añadido el escaneo. Lo más probable es que el documento ya tenga uno, subido ' +
        'desde otra ficha o desde otro teléfono: vuelve a cargar la ficha y míralo antes de ' +
        'repetirlo. Y si sigue sin fichero, puede que tu sesión ya no tenga permiso para escribir. ' +
        'El fichero que acabas de subir se queda suelto en el almacén, que no estorba a nadie.'
      )
    }
    return (
      'No se ha guardado nada. Puede que tu sesión ya no tenga permiso para escribir en el ' +
      'catálogo, o que el documento ya no esté: vuelve a entrar y comprueba si el cambio está.'
    )
  }

  const message = refusal.message.trim()

  if (refusal.code === '23505') {
    return (
      'Ya hay otro documento en el archivo con esa signatura. Las mayúsculas y las tildes no ' +
      'cuentan para distinguirlas. Cambia la signatura, o mira si el documento que ya está es el ' +
      'que ibas a subir: si lo es, enlázalo con esta obra en vez de subirlo otra vez.'
    )
  }

  if (refusal.code === '23514') {
    if (message.includes('archive_documents_title_not_blank')) {
      return 'El título no puede quedar vacío: es lo único que permite volver a encontrar el documento.'
    }
    if (message.includes('archive_documents_file_size_positive')) {
      return 'El fichero que se ha subido no tiene contenido (0 bytes). Vuelve a generar el escaneo.'
    }
    if (message.includes('archive_documents_file_all_or_nothing')) {
      return (
        'El fichero se ha registrado a medias, así que la base lo ha rechazado entero y no se ha ' +
        'guardado nada. Vuelve a intentarlo; si vuelve a pasar, registra el documento sin fichero.'
      )
    }
    if (message.includes('archive_documents_coherent_range')) {
      return 'El año final es anterior al inicial, o hay final sin inicial: revisa la fecha.'
    }
    if (message.includes('archive_documents_flags_require_year')) {
      return '«Aproximada» y «sin confirmar» hablan de un año, y este documento no tiene ninguno.'
    }
    if (message.includes('archive_documents_plausible_years')) {
      return `Un año fuera de ${DOCUMENT_MIN_YEAR}-${DOCUMENT_MAX_YEAR} es una errata, no una fecha.`
    }
    if (message.includes('archive_documents_code_shape')) {
      return 'La signatura no puede ser solo espacios. Déjala vacía si el documento no tiene todavía.'
    }
    return `No se ha podido ${VERB[action]}: la base ha rechazado uno de los datos. ${message}`
  }

  if (refusal.code === 'P0001') {
    // The trigger and the linking function write for the cataloger, in Spanish.
    // What they say is shown, and the hint with it: joined with a full stop,
    // without doubling the one the message may already end with.
    const hint = refusal.hint?.trim() ?? ''
    const head = message.replace(/[.\s]+$/, '')
    return hint === '' ? `${head}.` : `${head}. ${hint}`
  }

  if (refusal.code === '23503') {
    return (
      'La obra o el documento que se iba a enlazar ya no está en el catálogo. Vuelve a cargar la ' +
      'ficha y repítelo.'
    )
  }

  if (refusal.code === '42501') {
    return (
      'Tu sesión no tiene permiso para escribir en el archivo. Vuelve a entrar en la aplicación; ' +
      'si sigue igual, es que tu cuenta ya no es de catalogación.'
    )
  }

  if (message === '' || /failed to fetch|networkerror|network error|load failed/i.test(message)) {
    return (
      `No se ha podido ${VERB[action]}: la aplicación no ha podido hablar con el catálogo. ` +
      'Comprueba la conexión y vuelve a intentarlo; no se ha guardado nada a medias.'
    )
  }

  return `No se ha podido ${VERB[action]}: ${message}`
}
