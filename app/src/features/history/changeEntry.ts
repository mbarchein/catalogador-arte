/**
 * A record's change history, turned into sentences that are read.
 *
 * The table stores **one row per changed field** (RF-1502), which is what makes
 * the real audit question answerable —«who touched this artwork's
 * measurements»— and what makes the history illegible if it is painted as is: saving
 * a record touching four fields produces four rows with the same time and the same
 * author, and on screen they look like four different actions.
 *
 * That is why `change_id` exists: it is the same for every row of a save.
 * Here it is grouped by it, so a save is **one line** naming the
 * fields it changed. Without that grouping, a day's work is two hundred lines
 * and nobody reads them, which is the easiest way of having a useless audit
 * log without anything failing.
 *
 * Nothing in this module touches the network or the DOM: it is the part that decides what is read,
 * and that is why it is separate from the screen and tested.
 */

/** The two things that are audited. */
export type AuditedEntity = 'ARTWORK' | 'IMAGE'

/** What was done to the row. */
export type ChangeOperation = 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'RESTORE'

/** One row of the log, just as the query returns it. */
export interface ChangeLogRow {
  readonly id: number
  readonly change_id: string
  readonly entity: AuditedEntity
  readonly row_key: string
  readonly operation: ChangeOperation
  readonly column_name: string | null
  readonly old_value: string | null
  readonly new_value: string | null
  readonly changed_at: string
  readonly changed_by: string | null
  /** The profile of whoever did it, embedded by the query. Null if the row does not carry it. */
  readonly author?: { readonly name: string | null; readonly email: string | null } | null
}

/**
 * Each field's name in Spanish, as whoever catalogues calls it.
 *
 * **This table is half the history's value.** «cambió `height_cm`» is read by
 * nobody; «cambió el alto» is. And it cannot come from a transformation of the
 * column's name —removing underscores and capitalising— because half
 * the names do not match what the user calls the thing:
 * `attributed_title` is «si el título es del artista», and `basic_updated_at` is
 * never noted.
 *
 * Only the columns the trigger records are here: it discards the trace marks
 * —who and when, which are the history itself— and the derived columns.
 */
const FIELD_LABEL: Readonly<Record<string, string>> = {
  // ── The artwork: identification ──────────────────────────
  artist: 'el artista',
  title: 'el título',
  attributed_title: 'si el título es del artista',
  artwork_type: 'el tipo de obra',
  artwork_type_id: 'el tipo de obra',
  technique: 'la técnica',
  support: 'el soporte',
  series: 'la serie',
  series_id: 'la serie',
  // ── Medidas y firma ──────────────────────────────────────
  height_cm: 'el alto',
  width_cm: 'el ancho',
  depth_cm: 'la profundidad',
  measurements_verified: 'si las medidas están verificadas',
  signed: 'si está firmada',
  signature_description: 'la descripción de la firma',
  dated_on_artwork: 'la fecha escrita en la obra',
  // ── Date of execution (ADR-004) ──────────────────────────
  start_year: 'la fecha de ejecución',
  end_year: 'la fecha de ejecución',
  approximate_date: 'la fecha de ejecución',
  unconfirmed_date: 'la fecha de ejecución',
  date_note: 'la nota de la fecha',
  execution_date: 'la fecha de ejecución',
  // ── Conservación, existencia y sitio ─────────────────────
  conservation_status: 'el estado de conservación',
  existence_status: 'si la obra existe',
  physical_place_id: 'la ubicación',
  physical_location: 'la ubicación',
  photographed: 'si está fotografiada',
  // ── State of the process ─────────────────────────────────
  inventory_phase_completed: 'si el inventario está terminado',
  documentation_phase_completed: 'si la documentación está terminada',
  catalog_record_complete: 'si la ficha está completa',
  inventory_process_notes: 'las notas del proceso',
  // ── The catalogue raisonné ───────────────────────────────
  provenance: 'la procedencia redactada',
  provenance_note: 'la nota de procedencia',
  rights_holder_party_id: 'quién tiene los derechos',
  rights_holder_note: 'la nota de derechos',
  provenance_status: 'el estado de la investigación de procedencia',
  bibliography_status: 'el estado de la investigación bibliográfica',
  exhibition_history_status: 'el estado de la investigación de exposiciones',
  documentation_status: 'el estado de la investigación documental',
  // ── The photograph ───────────────────────────────────────
  shot_type: 'el tipo de toma',
  photo_date: 'la fecha de la fotografía',
  photo_author: 'el autor de la fotografía',
  // RF-417's two, and they are two facts and not one: on an own photograph what is noted
  // is who took it, and on one that is not, where it came from. They were missing since
  // the provenance migration — the sweep in the test is what found them.
  photo_credit: 'quién hizo la fotografía',
  provenance_source: 'de dónde salió la fotografía',
  index_image: 'si es la fotografía principal',
  sort_order: 'el orden de las fotografías',
  rotation: 'el giro',
  crop_x: 'el recorte',
  crop_y: 'el recorte',
  crop_width: 'el recorte',
  crop_height: 'el recorte',
  crop_source: 'de dónde salió el encuadre',
  corner_nw_x: 'la corrección de perspectiva',
  corner_nw_y: 'la corrección de perspectiva',
  corner_ne_x: 'la corrección de perspectiva',
  corner_ne_y: 'la corrección de perspectiva',
  corner_se_x: 'la corrección de perspectiva',
  corner_se_y: 'la corrección de perspectiva',
  corner_sw_x: 'la corrección de perspectiva',
  corner_sw_y: 'la corrección de perspectiva',
  // ── The photograph's colour ──────────────────────────────
  color_temperature: 'la temperatura del color',
  color_tint: 'el matiz',
  color_exposure: 'la exposición',
  color_black: 'los negros',
  color_white: 'los blancos',
  color_gamma: 'los medios tonos',
  color_shoulder: 'las altas luces',
  color_gray: 'el blanco y negro',
  color_neutral_x: 'el gris de referencia',
  color_neutral_y: 'el gris de referencia',
  color_source: 'de dónde salió el ajuste de color',
  color_reference: 'la referencia de gris usada',
  color_light: 'el tipo de luz',
  color_inherited: 'si el color viene heredado',
  color_clipped_low: 'el detalle perdido en las sombras',
  color_clipped_high: 'el detalle perdido en las luces',
  // ── The photograph's files ───────────────────────────────
  master_path: 'el original de archivo',
  master_bytes: 'el tamaño del original',
  thumbnail_path: 'la miniatura',
  derivative_path: 'la copia de consulta',
  corrected_path: 'la copia corregida',
  // The weight and the pixels of the same file share a wording on purpose, exactly as
  // `master_bytes` does with `original_width`/`original_height`: for whoever reads the
  // history they are one thing —how big that copy is— and `groupChanges` collapses the
  // repeat, so a save that writes all three leaves one line instead of three.
  corrected_bytes: 'el tamaño de la copia corregida',
  corrected_width: 'el tamaño de la copia corregida',
  corrected_height: 'el tamaño de la copia corregida',
  corrected_pending: 'si falta preparar la copia corregida',
  original_width: 'el tamaño del original',
  original_height: 'el tamaño del original',
  file_photo_date: 'la fecha que trae el fichero',
  file_photo_date_exact: 'si la fecha del fichero es exacta',
}

/**
 * The names that mean **different things** on an artwork and on a photograph.
 *
 * `provenance` is the one that exists today and the reason this table exists: on an
 * artwork it is the written account of who owned it (RF-510), and on a photograph it is
 * where the shot came from (RF-417). Two facts with nothing to do with each other and one
 * column name, so a table keyed by name alone cannot help but be wrong about one of them.
 *
 * Measured rather than guessed: `artworks` and `images` share seven column names, and the
 * other six are the trace stamps —`created_at`, `deactivated_by`…— which the log discards,
 * plus `catalog_id`, which is immutable, and `active`, whose change is read as the verb of
 * the line. `provenance` is the only one that reaches a field's name, and this is where the
 * next one goes when it arrives.
 */
const FIELD_LABEL_BY_ENTITY: Record<AuditedEntity, Record<string, string>> = {
  ARTWORK: {},
  IMAGE: {
    provenance: 'la procedencia de la fotografía',
  },
}

/**
 * A field's name, and **never empty**.
 *
 * A field the table does not know is named with its technical name in
 * brackets instead of kept quiet. It is jargon, and it is deliberate: the project forbids
 * leaving a gap, and here the gap would be worse than the jargon —a change that is not
 * listed is a change the history denies—. A technical name appearing on
 * screen is besides the visible sign that this table has fallen behind.
 */
export function fieldLabel(column: string | null | undefined, entity?: AuditedEntity): string {
  if (!column || column.trim() === '') return 'un dato'
  const byEntity = entity ? FIELD_LABEL_BY_ENTITY[entity][column] : undefined
  return byEntity ?? FIELD_LABEL[column] ?? `un dato (${column})`
}

/** Who made the change, as it is signed on screen. */
export function authorName(row: ChangeLogRow): string {
  const name = row.author?.name?.trim()
  if (name) return name
  const email = row.author?.email?.trim()
  if (email) return email
  // With no author is what a migration or a trigger writes, not an oversight: it is
  // said, because «somebody» would suggest the datum has been lost.
  return 'El sistema'
}

/** One save: every row sharing a `change_id`. */
export interface ChangeEntry {
  readonly changeId: string
  readonly entity: AuditedEntity
  readonly rowKey: string
  readonly operation: ChangeOperation
  readonly changedAt: string
  readonly author: string
  /** The fields it changed, in Spanish, without repeats and in the order they arrived. */
  readonly fields: readonly string[]
  /** The row with the highest `id` of the group, for sorting and for React's key. */
  readonly lastId: number
}

/**
 * Groups the log's rows into saves.
 *
 * The query's arrival order is kept (most recent first) and, within
 * a save, the order in which the fields were noted. Repeats are
 * removed: changing `start_year` and `end_year` is **one** thing —the date of
 * execution— and saying it twice in the same line is noise.
 */
export function groupChanges(rows: readonly ChangeLogRow[]): readonly ChangeEntry[] {
  const byChange = new Map<string, { entry: ChangeEntry; fields: string[] }>()
  const order: string[] = []

  for (const row of rows) {
    const existing = byChange.get(row.change_id)
    if (!existing) {
      const fields = row.column_name ? [fieldLabel(row.column_name, row.entity)] : []
      byChange.set(row.change_id, {
        fields,
        entry: {
          changeId: row.change_id,
          entity: row.entity,
          rowKey: row.row_key,
          operation: row.operation,
          changedAt: row.changed_at,
          author: authorName(row),
          fields,
          lastId: row.id,
        },
      })
      order.push(row.change_id)
      continue
    }
    const label = row.column_name ? fieldLabel(row.column_name, row.entity) : null
    if (label && !existing.fields.includes(label)) existing.fields.push(label)
    if (row.id > existing.entry.lastId) {
      byChange.set(row.change_id, {
        fields: existing.fields,
        entry: { ...existing.entry, lastId: row.id, fields: existing.fields },
      })
    }
  }

  return order.map((id) => byChange.get(id)!.entry)
}

/** Joins the fields into a Spanish enumeration: «el alto, el ancho y la técnica». */
export function joinFields(fields: readonly string[]): string {
  const last = fields[fields.length - 1]
  if (last === undefined) return ''
  if (fields.length === 1) return last
  return `${fields.slice(0, -1).join(', ')} y ${last}`
}

/**
 * A save's sentence, without the date: the screen puts that, which knows whether it is
 * showing the whole day or only the time.
 *
 * The entity is named only when it needs distinguishing. A record's history
 * mixes the artwork and its photographs, and «cambió el giro» without saying of which
 * photograph is of no use.
 */
export function changeSentence(entry: ChangeEntry): string {
  const quien = entry.author
  const esFoto = entry.entity === 'IMAGE'

  switch (entry.operation) {
    case 'CREATE':
      return esFoto ? `${quien} añadió una fotografía` : `${quien} creó la ficha`
    case 'DEACTIVATE':
      return esFoto ? `${quien} retiró una fotografía` : `${quien} dio de baja la ficha`
    case 'RESTORE':
      return esFoto ? `${quien} recuperó una fotografía` : `${quien} recuperó la ficha`
    case 'UPDATE': {
      const que = joinFields(entry.fields)
      // A change with no fields noted should not exist —the base prevents it— but
      // if one arrived, it is said that there was a change instead of half a sentence.
      if (que === '') return esFoto ? `${quien} cambió una fotografía` : `${quien} cambió la ficha`
      return esFoto ? `${quien} cambió ${que} de una fotografía` : `${quien} cambió ${que}`
    }
  }
}

/**
 * The value before and after, for the detail of a line with a single field.
 *
 * It returns null when showing it adds nothing: in a creation there is no before, and with several
 * fields at once the comparison would be a table and not a sentence. Long
 * values are trimmed, because a thousand-character process note turns the
 * history into the note's text.
 */
export function changeDetail(
  rows: readonly ChangeLogRow[],
  entry: ChangeEntry,
  limit = 120,
): { before: string; after: string } | null {
  if (entry.operation !== 'UPDATE') return null
  const own = rows.filter((r) => r.change_id === entry.changeId && r.column_name !== null)
  const row = own[0]
  if (own.length !== 1 || row === undefined) return null
  const show = (value: string | null) => {
    if (value === null) return 'sin dato'
    const text = value.trim()
    if (text === '') return 'sin dato'
    return text.length > limit ? `${text.slice(0, limit)}…` : text
  }
  return { before: show(row.old_value), after: show(row.new_value) }
}
