/**
 * El historial de cambios de una ficha, convertido en frases que se leen.
 *
 * La tabla guarda **una fila por campo cambiado** (RF-1502), que es lo que hace
 * respondible la pregunta de auditoría real —«quién tocó las medidas de esta
 * obra»— y lo que hace ilegible el historial si se pinta tal cual: guardar una
 * ficha tocando cuatro campos produce cuatro filas con la misma hora y el mismo
 * autor, y en pantalla parecen cuatro acciones distintas.
 *
 * Por eso existe `change_id`: es el mismo para todas las filas de un guardado.
 * Aquí se agrupa por él, así que un guardado es **una línea** que nombra los
 * campos que cambió. Sin ese agrupado, un día de trabajo son doscientas líneas
 * y nadie las lee, que es la forma más fácil de tener un registro de auditoría
 * inútil sin que nada falle.
 *
 * Nada de este módulo toca la red ni el DOM: es la parte que decide qué se lee,
 * y por eso está separada de la pantalla y probada.
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
 * El nombre de cada campo en español, tal como lo llama quien cataloga.
 *
 * **Esta tabla es la mitad del valor del historial.** «cambió `height_cm`» no lo
 * lee nadie; «cambió el alto» sí. Y no puede salir de una transformación del
 * nombre de la columna —quitar guiones bajos y capitalizar— porque la mitad de
 * los nombres no coinciden con lo que la usuaria llama a la cosa:
 * `attributed_title` es «si el título es del artista», y `basic_updated_at` no se
 * anota nunca.
 *
 * Solo están las columnas que el trigger registra: descarta las marcas de traza
 * —quién y cuándo, que ya son el propio historial— y las columnas derivadas.
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
  corrected_bytes: 'el tamaño de la copia corregida',
  corrected_pending: 'si falta preparar la copia corregida',
  original_width: 'el tamaño del original',
  original_height: 'el tamaño del original',
  file_photo_date: 'la fecha que trae el fichero',
  file_photo_date_exact: 'si la fecha del fichero es exacta',
}

/**
 * El nombre de un campo, y **nunca vacío**.
 *
 * Un campo que la tabla no conoce se nombra con su nombre técnico entre
 * paréntesis en vez de callarse. Es jerga, y es deliberado: el proyecto prohíbe
 * dejar un hueco, y aquí el hueco sería peor que la jerga —un cambio que no se
 * lista es un cambio que el historial niega—. Que salga un nombre técnico en
 * pantalla es además la señal visible de que esta tabla se ha quedado atrás.
 */
export function fieldLabel(column: string | null | undefined): string {
  if (!column || column.trim() === '') return 'un dato'
  return FIELD_LABEL[column] ?? `un dato (${column})`
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
 * Agrupa las filas del registro en guardados.
 *
 * Se conserva el orden de llegada de la consulta (más reciente primero) y, dentro
 * de un guardado, el orden en que se anotaron los campos. Los repetidos se
 * quitan: cambiar `start_year` y `end_year` es **una** cosa —la fecha de
 * ejecución— y decirlo dos veces en la misma línea es ruido.
 */
export function groupChanges(rows: readonly ChangeLogRow[]): readonly ChangeEntry[] {
  const byChange = new Map<string, { entry: ChangeEntry; fields: string[] }>()
  const order: string[] = []

  for (const row of rows) {
    const existing = byChange.get(row.change_id)
    if (!existing) {
      const fields = row.column_name ? [fieldLabel(row.column_name)] : []
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
    const label = row.column_name ? fieldLabel(row.column_name) : null
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
 * La frase de un guardado, sin la fecha: la pone la pantalla, que sabe si está
 * mostrando el día entero o solo la hora.
 *
 * Se nombra la entidad solo cuando hace falta distinguirla. El historial de una
 * ficha mezcla la obra y sus fotografías, y «cambió el giro» sin decir de qué
 * fotografía no sirve de nada.
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
 * El valor antes y después, para el detalle de una línea con un solo campo.
 *
 * Devuelve null cuando enseñarlo no aporta: en un alta no hay antes, y con varios
 * campos a la vez la comparación sería una tabla y no una frase. Los valores
 * largos se recortan, porque una nota de proceso de mil caracteres convierte el
 * historial en el texto de la nota.
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
