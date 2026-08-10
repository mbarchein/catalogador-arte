/**
 * La papelera: qué clases de cosa hay dentro, y de qué depende cada una para volver.
 *
 * La baja lógica está en el esquema desde el principio —**nunca un borrado real**,
 * RF-901— y por eso hay veintiuna tablas con `active`, `deactivated_at` y
 * `deactivated_by`. Veintiuna pantallas serían veintiuna redacciones distintas de
 * la misma frase, así que aquí se describe cada clase UNA vez —cómo se llama, con
 * qué género, qué columnas hacen legible su línea y de qué cuelga— y la pantalla
 * lee esta tabla en vez de escribir su propio caso.
 *
 * Es el mismo reparto que `DOCUMENTARY_SECTIONS` hace con los cinco bloques de la
 * ficha, y por el mismo motivo: el género del participio («retirada» / «retirado»)
 * y el nombre de la cosa son datos, no ramas de código, y así se prueban.
 *
 * ── LO QUE SE MIDIÓ CONTRA LA BASE, Y NO SE SUPUSO ───────────────
 *
 * 1. **Quién ve la papelera.** Dieciocho de las veintiuna tablas tienen la política
 *    `(active and can_read()) or can_edit()`: quien solo consulta no ve ni una fila
 *    retirada. Comprobado con el token del lector: `images?active=eq.false`
 *    devuelve `[]`. Tres tablas se salen de ese patrón y su `select` es `can_read()`
 *    a secas —`artwork_types`, `series` y `physical_places`—, así que un lector SÍ
 *    ve sus filas retiradas. No se arregla desde aquí (el esquema no se toca), pero
 *    la pantalla entera está cerrada a quien no cataloga, que es lo que sí puede
 *    hacer este lado.
 *
 * 2. **Recuperar bajo un padre retirado NO falla.** Medido: se retira una obra, se
 *    restaura un eslabón suyo, y la base lo acepta —`update` afecta a 1 fila—. La
 *    fila vuelve a estar activa y sigue sin verse, porque lo que no se ve es su
 *    obra. Un botón que «funciona» y no cambia nada de lo que la usuaria mira es
 *    peor que uno que se niega explicando, así que ese caso se detiene ANTES de
 *    escribir. Ver `restoreBlock`.
 *
 * 3. **El nombre de una fila retirada no se libera.** Los índices únicos de las
 *    maestras —`parties_name_unique`, `document_types_name_unique`…— NO son
 *    parciales sobre `active`, así que mientras algo está en la papelera su nombre
 *    sigue reservado y nadie puede volver a usarlo. Consecuencia: recuperar una
 *    maestra no puede chocar por el nombre. La única tabla donde el hueco SÍ se
 *    libera es `external_links`, cuyos índices son `where ... and active`.
 */

import { displayTitle } from '../../lib/title'
import {
  EXHIBITION_TYPE_LABEL,
  PARTY_TYPE_LABEL,
  SHOT_TYPE_LABEL,
  type ExhibitionTypeValue,
  type PartyType,
  type ShotTypeValue,
} from '../../lib/types'

/** A row just as it arrives from PostgREST, with its embedded rows. */
export type TrashRow = Readonly<Record<string, unknown>>

/** A column's text, already trimmed and **never** `undefined`. */
export function cell(row: TrashRow, key: string): string {
  const value = row[key]
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

/**
 * Un incrustado de PostgREST.
 *
 * Se acepta que llegue como objeto o como lista de uno. Todos los de esta pantalla
 * son «uno a uno» —la clave ajena está en la propia fila— y llegan como objeto;
 * aceptar la lista es barato y evita que un cambio de forma del cliente deje las
 * líneas sin contexto en silencio.
 */
export function embedded(row: TrashRow, key: string): TrashRow | null {
  const value = row[key]
  if (Array.isArray(value)) return (value[0] as TrashRow | undefined) ?? null
  if (value !== null && typeof value === 'object') return value as TrashRow
  return null
}

/**
 * Si la cosa incrustada está retirada, o `null` cuando no se sabe.
 *
 * `null` y `false` no son lo mismo y la diferencia decide si se bloquea: un padre
 * opcional que la fila no tiene —un documento sin serie de archivo— llega como
 * incrustado nulo, y eso NO es un padre retirado. Devolver `false` ahí sería
 * correcto por casualidad; devolver `null` dice la verdad, que es que no hay padre.
 */
export function embeddedRetired(row: TrashRow, key: string): boolean | null {
  const parent = embedded(row, key)
  if (parent === null) return null
  const active = parent['active']
  return typeof active === 'boolean' ? !active : null
}

/** Joins a line's pieces discarding the empty ones, so as not to leave a stray « · ». */
export function joinParts(parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(' · ')
}

/**
 * De qué depende una cosa para que recuperarla sirva de algo.
 *
 * Dos formas de saberlo, y las dos son necesarias porque **PostgREST no incrusta
 * una tabla en sí misma**: medido, `physical_places?select=parent:physical_places!
 * physical_places_parent_id_fkey(...)` contesta `PGRST200`, «could not find a
 * relationship». Las dos tablas anidadas sobre sí mismas —ubicaciones y
 * clasificación del archivo— se resuelven con la única cosa que ya se tiene sin
 * pedir nada: el conjunto de claves retiradas de su propia tabla.
 */
export type TrashParent =
  /** The parent travels embedded in the row, with its `active`. */
  | {
      readonly via: 'embed'
      /** How the parent's class is named: «la obra», «la exposición». */
      readonly what: string
      /** The embedded row's key inside the row. */
      readonly key: string
      /** How that particular parent is named for the sentence. */
      readonly name: (row: TrashRow) => string
    }
  /** The parent is in the same table, and is known through the set of withdrawn ones. */
  | {
      readonly via: 'self'
      readonly what: string
      /** The column with the parent's key. */
      readonly column: string
      readonly name: (row: TrashRow) => string
    }

export type TrashGroupId = 'catalog' | 'record' | 'archive' | 'lists'

export type TrashKindId =
  | 'artworks'
  | 'images'
  | 'provenance_events'
  | 'artwork_bibliography'
  | 'artwork_exhibitions'
  | 'artwork_documents'
  | 'artwork_relationships'
  | 'external_links'
  | 'archive_documents'
  | 'bibliography'
  | 'exhibitions'
  | 'exhibition_documents'
  | 'parties'
  | 'exhibition_venues'
  | 'artwork_types'
  | 'series'
  | 'physical_places'
  | 'archive_series'
  | 'document_types'
  | 'publication_types'
  | 'artwork_relationship_types'

export interface TrashKindSpec {
  readonly id: TrashKindId
  readonly group: TrashGroupId
  /** The table, as PostgREST names it. */
  readonly table: string
  /** The column identifying the row, for the recovery's `update`. */
  readonly key: string
  /** «una obra». */
  readonly one: string
  /** «tres obras». */
  readonly many: string
  /**
   * El participio con el género de la cosa.
   *
   * Es un dato y no una regla de código porque el español no perdona: «la
   * fotografía retirado» y «el eslabón retirada» son las dos frases que salen de
   * intentar deducirlo de la terminación del nombre.
   */
  readonly retired: 'retirada' | 'retirado'
  /** PostgREST's `select`, with the embedded rows that make the line readable. */
  readonly columns: string
  /** What is read on the line. **Never empty.** */
  readonly label: (row: TrashRow) => string
  /** The second line: what it hangs from, so a decision can be made. Empty if it adds nothing. */
  readonly context: (row: TrashRow) => string
  /** What it depends on for recovering it to be visible. */
  readonly parents: readonly TrashParent[]
  /**
   * La pantalla propia desde la que esta clase TAMBIÉN se recupera, si existe.
   *
   * Las nueve maestras ya tienen la suya, y ahí es donde se ve la lista entera con
   * sus reglas de nombre. Se enlaza en vez de callarlo: la papelera es un sitio
   * desde el que mirarlo todo junto, no la única puerta.
   *
   * Sin pantalla propia están las obras, las fotografías, las referencias, las
   * exposiciones y los documentos del archivo: **para esas, esta es la única
   * salida**, que es exactamente el pendiente que la papelera cierra.
   */
  readonly ownScreen?: string
  /**
   * Lo que se cuenta si la base contesta `23505` al recuperar.
   *
   * Solo `external_links` lo necesita de verdad —ver la nota 3 de la cabecera—, y
   * por eso es opcional en vez de una frase genérica repetida veintiuna veces.
   */
  readonly duplicateText?: string
}

/** A group of the wastebasket: why it is together and what it says about itself. */
export interface TrashGroupSpec {
  readonly id: TrashGroupId
  readonly title: string
  readonly hint: string
}

/**
 * Los cuatro grupos, en el orden en que se busca dentro de una papelera.
 *
 * Primero lo que se retira por error y se echa en falta el mismo día —una obra, una
 * fotografía—, y al final las listas, que se retiran a propósito y casi nunca se
 * quieren de vuelta. No es alfabético: alfabético pone «Las listas del catálogo»
 * antes que las obras, que es lo que menos se busca delante de lo que más.
 */
export const TRASH_GROUPS: readonly TrashGroupSpec[] = [
  {
    id: 'catalog',
    title: 'Obras y fotografías',
    hint: 'Lo que se retiró del catálogo. Esta es la única pantalla desde la que vuelven.',
  },
  {
    id: 'record',
    title: 'Lo que cuelga de una ficha',
    hint:
      'Eslabones de procedencia, citas, participaciones, vínculos, relaciones y enlaces.',
  },
  {
    id: 'archive',
    title: 'El archivo, la bibliografía y las exposiciones',
    hint: 'Las fichas propias, no su vínculo con una obra.',
  },
  {
    id: 'lists',
    title: 'Las listas del catálogo',
    hint: 'Las nueve maestras. Cada una tiene además su propia pantalla.',
  },
]

/** A group's specification by its identifier. */
export function groupSpec(id: TrashGroupId): TrashGroupSpec {
  const found = TRASH_GROUPS.find((group) => group.id === id)
  // Unreachable by the type, and cheaper to narrow than to assert.
  if (!found) throw new Error(`Grupo de la papelera desconocido: ${id}`)
  return found
}

/** «la obra AR-0012», for the sentences that name a parent. */
function artworkName(row: TrashRow, column = 'catalog_id'): string {
  const code = cell(row, column)
  return code === '' ? 'la obra de la que cuelga' : code
}

/** An embedded row's name, with a fallback when it arrives empty or does not arrive. */
function embeddedName(row: TrashRow, key: string, column: string, fallback: string): string {
  const parent = embedded(row, key)
  if (parent === null) return fallback
  const name = cell(parent, column)
  return name === '' ? fallback : name
}

/** The kind of shot in Spanish, and not the enum's value. */
function shotLabel(row: TrashRow): string {
  const value = cell(row, 'shot_type') as ShotTypeValue
  return SHOT_TYPE_LABEL[value] ?? 'Toma sin clasificar'
}

/**
 * Las veintiuna clases de cosa que la papelera puede contener.
 *
 * El orden dentro de cada grupo es el de importancia para quien busca, no el
 * alfabético ni el de las migraciones.
 */
export const TRASH_KINDS: readonly TrashKindSpec[] = [
  // ── Obras y fotografías ──────────────────────────────────────
  {
    id: 'artworks',
    group: 'catalog',
    table: 'artworks',
    key: 'catalog_id',
    one: 'obra',
    many: 'obras',
    retired: 'retirada',
    columns:
      'catalog_id, title, artwork_type, execution_date, deactivated_at, deactivated_by',
    // The cataloguing identifier goes first because it is the label stuck to the
    // real painting: it is what is in hand when looking for a missing artwork.
    label: (row) => joinParts([cell(row, 'catalog_id'), displayTitle(cell(row, 'title'))]),
    context: (row) => joinParts([cell(row, 'artwork_type'), cell(row, 'execution_date')]),
    // Una obra no cuelga de nada: es la raíz. Su tipo, su serie y su ubicación
    // pueden estar retirados, pero eso no la hace invisible —y el esquema deja
    // recuperarla igual—, así que no se bloquea por ellos.
    parents: [],
  },
  {
    id: 'images',
    group: 'catalog',
    table: 'images',
    key: 'image_id',
    one: 'fotografía',
    many: 'fotografías',
    retired: 'retirada',
    columns:
      'image_id, catalog_id, shot_type, photo_date, deactivated_at, deactivated_by, ' +
      'artworks(title, active)',
    label: (row) => joinParts([cell(row, 'image_id'), shotLabel(row)]),
    context: (row) =>
      joinParts([
        `De ${artworkName(row)}`,
        displayTitle(cell(embedded(row, 'artworks') ?? {}, 'title')),
        cell(row, 'photo_date'),
      ]),
    parents: [{ via: 'embed', what: 'la obra', key: 'artworks', name: (row) => artworkName(row) }],
  },

  // ── What hangs from a record ─────────────────────────────────
  {
    id: 'provenance_events',
    group: 'record',
    table: 'provenance_events',
    key: 'id',
    one: 'eslabón de procedencia',
    many: 'eslabones de procedencia',
    retired: 'retirado',
    columns:
      'id, catalog_id, party_note, date_text, deactivated_at, deactivated_by, ' +
      'artworks(title, active), parties(name, active)',
    // A link has a party or a note, never both empty:
    // `provenance_events_link_has_an_end` guarantees it. So the label cannot fall mute.
    label: (row) => {
      const party = embeddedName(row, 'parties', 'name', '')
      const note = cell(row, 'party_note')
      return party !== '' ? party : note !== '' ? note : 'Eslabón sin parte anotada'
    },
    context: (row) => joinParts([`Procedencia de ${artworkName(row)}`, cell(row, 'date_text')]),
    parents: [
      { via: 'embed', what: 'la obra', key: 'artworks', name: (row) => artworkName(row) },
      // La parte puede estar retirada con este eslabón dentro: el disparador
      // `tg_party_deactivation` solo mira los eslabones ACTIVOS, así que retirar la
      // parte fue legal mientras el eslabón estaba aquí.
      {
        via: 'embed',
        what: 'la persona o institución',
        key: 'parties',
        name: (row) => embeddedName(row, 'parties', 'name', 'la parte del eslabón'),
      },
    ],
  },
  {
    id: 'artwork_bibliography',
    group: 'record',
    table: 'artwork_bibliography',
    key: 'id',
    one: 'cita bibliográfica',
    many: 'citas bibliográficas',
    retired: 'retirada',
    columns:
      'id, catalog_id, pages, deactivated_at, deactivated_by, ' +
      'artworks(title, active), bibliography(title, active)',
    label: (row) => embeddedName(row, 'bibliography', 'title', 'Referencia sin título'),
    context: (row) => {
      const pages = cell(row, 'pages')
      return joinParts([`Citada en ${artworkName(row)}`, pages === '' ? '' : `p. ${pages}`])
    },
    parents: [
      { via: 'embed', what: 'la obra', key: 'artworks', name: (row) => artworkName(row) },
      {
        via: 'embed',
        what: 'la referencia',
        key: 'bibliography',
        name: (row) => embeddedName(row, 'bibliography', 'title', 'la referencia citada'),
      },
    ],
  },
  {
    id: 'artwork_exhibitions',
    group: 'record',
    table: 'artwork_exhibitions',
    key: 'id',
    one: 'participación en una exposición',
    many: 'participaciones en exposiciones',
    retired: 'retirada',
    columns:
      'id, catalog_id, catalogue_number, deactivated_at, deactivated_by, ' +
      'artworks(title, active), exhibitions(title, active)',
    label: (row) => embeddedName(row, 'exhibitions', 'title', 'Exposición sin título'),
    context: (row) => {
      const number = cell(row, 'catalogue_number')
      return joinParts([`${artworkName(row)} en la muestra`, number === '' ? '' : `cat. ${number}`])
    },
    parents: [
      { via: 'embed', what: 'la obra', key: 'artworks', name: (row) => artworkName(row) },
      {
        via: 'embed',
        what: 'la exposición',
        key: 'exhibitions',
        name: (row) => embeddedName(row, 'exhibitions', 'title', 'la exposición'),
      },
    ],
  },
  {
    id: 'artwork_documents',
    group: 'record',
    table: 'artwork_documents',
    key: 'id',
    one: 'vínculo con un documento',
    many: 'vínculos con documentos',
    retired: 'retirado',
    columns:
      'id, catalog_id, deactivated_at, deactivated_by, ' +
      'artworks(title, active), archive_documents(archive_code, title, active)',
    label: (row) => {
      const document = embedded(row, 'archive_documents')
      const code = document === null ? '' : cell(document, 'archive_code')
      const title = document === null ? '' : cell(document, 'title')
      if (code === '' && title === '') return 'Documento sin signatura ni título'
      return joinParts([code, title])
    },
    context: (row) => `Vinculado a ${artworkName(row)}`,
    parents: [
      { via: 'embed', what: 'la obra', key: 'artworks', name: (row) => artworkName(row) },
      {
        via: 'embed',
        what: 'el documento',
        key: 'archive_documents',
        name: (row) => embeddedName(row, 'archive_documents', 'archive_code', 'el documento'),
      },
    ],
  },
  {
    id: 'artwork_relationships',
    group: 'record',
    table: 'artwork_relationships',
    key: 'id',
    one: 'relación entre dos obras',
    many: 'relaciones entre obras',
    retired: 'retirada',
    // Two embedded rows from the SAME table, so PostgREST has to be told which
    // foreign key each one enters by. Verified that it resolves both.
    columns:
      'id, from_catalog_id, to_catalog_id, deactivated_at, deactivated_by, ' +
      'from_artwork:artworks!artwork_relationships_from_catalog_id_fkey(title, active), ' +
      'to_artwork:artworks!artwork_relationships_to_catalog_id_fkey(title, active), ' +
      'artwork_relationship_types(name, active)',
    label: (row) => {
      const type = embeddedName(row, 'artwork_relationship_types', 'name', 'Relación')
      const from = cell(row, 'from_catalog_id')
      const to = cell(row, 'to_catalog_id')
      // The arrow is painted only if there are two ends to join: «→ Pareja de» would be a
      // line promising a relationship and not saying between what.
      const ends = from !== '' && to !== '' ? `${from} → ${to}` : joinParts([from, to])
      return joinParts([ends, type])
    },
    context: (row) =>
      joinParts([
        displayTitle(cell(embedded(row, 'from_artwork') ?? {}, 'title')),
        displayTitle(cell(embedded(row, 'to_artwork') ?? {}, 'title')),
      ]),
    parents: [
      {
        via: 'embed',
        what: 'la obra',
        key: 'from_artwork',
        name: (row) => artworkName(row, 'from_catalog_id'),
      },
      {
        via: 'embed',
        what: 'la obra',
        key: 'to_artwork',
        name: (row) => artworkName(row, 'to_catalog_id'),
      },
      {
        via: 'embed',
        what: 'el tipo de relación',
        key: 'artwork_relationship_types',
        name: (row) => embeddedName(row, 'artwork_relationship_types', 'name', 'el tipo'),
      },
    ],
  },
  {
    id: 'external_links',
    group: 'record',
    table: 'external_links',
    key: 'id',
    one: 'enlace externo',
    many: 'enlaces externos',
    retired: 'retirado',
    columns:
      'id, artwork_id, image_id, url, title, deactivated_at, deactivated_by, ' +
      'artworks(active), images(active)',
    // Un enlace sin título se nombra por su dirección, y sin ninguna de las dos —que
    // el `check` de la base no permite, pero que no cuesta nada sostener— se dice qué
    // le falta en vez de dejar la línea muda y sin botón que la recupere.
    label: (row) => {
      const title = cell(row, 'title')
      if (title !== '') return title
      const url = cell(row, 'url')
      return url === '' ? 'Enlace sin dirección' : url
    },
    context: (row) => {
      const image = cell(row, 'image_id')
      const owner = image !== '' ? `la fotografía ${image}` : artworkName(row, 'artwork_id')
      return joinParts([`De ${owner}`, cell(row, 'url')])
    },
    // Exactamente uno de los dos dueños está puesto —lo obliga
    // `external_links_exactly_one_owner`— y el incrustado del otro llega nulo, que
    // `embeddedRetired` traduce a «no hay padre» y no a «padre retirado».
    parents: [
      {
        via: 'embed',
        what: 'la obra',
        key: 'artworks',
        name: (row) => artworkName(row, 'artwork_id'),
      },
      {
        via: 'embed',
        what: 'la fotografía',
        key: 'images',
        name: (row) => {
          const id = cell(row, 'image_id')
          return id === '' ? 'la fotografía de la que cuelga' : id
        },
      },
    ],
    duplicateText:
      'Ya hay otro enlace activo con la misma dirección en el mismo sitio. Si el bueno es este, retira antes el otro.',
  },

  // ── The archive, the bibliography and the exhibitions ────────
  {
    id: 'archive_documents',
    group: 'archive',
    table: 'archive_documents',
    key: 'id',
    one: 'documento de archivo',
    many: 'documentos de archivo',
    retired: 'retirado',
    columns:
      'id, archive_code, title, date_text, deactivated_at, deactivated_by, ' +
      'document_types(name, active), archive_series(name, active)',
    label: (row) => {
      const parts = joinParts([cell(row, 'archive_code'), cell(row, 'title')])
      return parts === '' ? 'Documento sin signatura ni título' : parts
    },
    context: (row) =>
      joinParts([
        embeddedName(row, 'document_types', 'name', ''),
        embeddedName(row, 'archive_series', 'name', ''),
        cell(row, 'date_text'),
      ]),
    parents: [
      {
        via: 'embed',
        what: 'el tipo de documento',
        key: 'document_types',
        name: (row) => embeddedName(row, 'document_types', 'name', 'su tipo'),
      },
      {
        via: 'embed',
        what: 'la serie del archivo',
        key: 'archive_series',
        name: (row) => embeddedName(row, 'archive_series', 'name', 'su serie'),
      },
    ],
  },
  {
    id: 'bibliography',
    group: 'archive',
    table: 'bibliography',
    key: 'id',
    one: 'referencia bibliográfica',
    many: 'referencias bibliográficas',
    retired: 'retirada',
    columns:
      'id, bibtex_key, title, authors, year, deactivated_at, deactivated_by, ' +
      'publication_types(name, active)',
    label: (row) => {
      const title = cell(row, 'title')
      if (title !== '') return title
      const key = cell(row, 'bibtex_key')
      return key === '' ? 'Referencia sin título' : key
    },
    context: (row) =>
      joinParts([
        cell(row, 'authors'),
        cell(row, 'year'),
        embeddedName(row, 'publication_types', 'name', ''),
      ]),
    parents: [
      {
        via: 'embed',
        what: 'el tipo de publicación',
        key: 'publication_types',
        name: (row) => embeddedName(row, 'publication_types', 'name', 'su tipo'),
      },
    ],
  },
  {
    id: 'exhibitions',
    group: 'archive',
    table: 'exhibitions',
    key: 'id',
    one: 'exposición',
    many: 'exposiciones',
    retired: 'retirada',
    // Desde el 5 de agosto de 2026 una exposición SÍ tiene ficha propia, y la
    // papelera enlaza a ella. Es la única de las cinco clases que solo se
    // recuperaban aquí que ha dejado de estarlo, y por eso este campo se anota
    // ahora: sin él, la papelera sería el único sitio donde ver una exposición
    // retirada aunque exista una pantalla que la muestra mejor.
    ownScreen: '/exhibitions',
    columns:
      'id, title, exhibition_type, year, deactivated_at, deactivated_by, ' +
      'exhibition_venues(name, active)',
    label: (row) => {
      const title = cell(row, 'title')
      return title === '' ? 'Exposición sin título' : title
    },
    context: (row) => {
      const type = cell(row, 'exhibition_type') as ExhibitionTypeValue
      return joinParts([
        EXHIBITION_TYPE_LABEL[type] ?? '',
        embeddedName(row, 'exhibition_venues', 'name', ''),
        cell(row, 'year'),
      ])
    },
    parents: [
      {
        via: 'embed',
        what: 'la sede',
        key: 'exhibition_venues',
        name: (row) => embeddedName(row, 'exhibition_venues', 'name', 'su sede'),
      },
    ],
  },
  {
    id: 'exhibition_documents',
    group: 'archive',
    table: 'exhibition_documents',
    key: 'id',
    one: 'documento de una exposición',
    many: 'documentos de exposiciones',
    retired: 'retirado',
    columns:
      'id, deactivated_at, deactivated_by, ' +
      'exhibitions(title, active), archive_documents(archive_code, title, active)',
    label: (row) => {
      const document = embedded(row, 'archive_documents')
      const parts =
        document === null
          ? ''
          : joinParts([cell(document, 'archive_code'), cell(document, 'title')])
      return parts === '' ? 'Documento sin signatura ni título' : parts
    },
    context: (row) => `De ${embeddedName(row, 'exhibitions', 'title', 'una exposición')}`,
    parents: [
      {
        via: 'embed',
        what: 'la exposición',
        key: 'exhibitions',
        name: (row) => embeddedName(row, 'exhibitions', 'title', 'la exposición'),
      },
      {
        via: 'embed',
        what: 'el documento',
        key: 'archive_documents',
        name: (row) => embeddedName(row, 'archive_documents', 'archive_code', 'el documento'),
      },
    ],
  },

  // ── The catalogue's lists ────────────────────────────────────
  {
    id: 'parties',
    group: 'lists',
    table: 'parties',
    key: 'id',
    one: 'persona o institución',
    many: 'personas e instituciones',
    retired: 'retirada',
    columns: 'id, name, party_type, locality, deactivated_at, deactivated_by',
    label: (row) => {
      const name = cell(row, 'name')
      return name === '' ? 'Sin nombre' : name
    },
    context: (row) => {
      const type = cell(row, 'party_type') as PartyType
      return joinParts([PARTY_TYPE_LABEL[type] ?? '', cell(row, 'locality')])
    },
    parents: [],
    ownScreen: '/parties',
  },
  {
    id: 'exhibition_venues',
    group: 'lists',
    table: 'exhibition_venues',
    key: 'id',
    one: 'sede de exposición',
    many: 'sedes de exposición',
    retired: 'retirada',
    columns:
      'id, name, locality, country, deactivated_at, deactivated_by, parties(name, active)',
    label: (row) => {
      const name = cell(row, 'name')
      return name === '' ? 'Sede sin nombre' : name
    },
    context: (row) => joinParts([cell(row, 'locality'), cell(row, 'country')]),
    parents: [
      {
        via: 'embed',
        what: 'la institución',
        key: 'parties',
        name: (row) => embeddedName(row, 'parties', 'name', 'su institución'),
      },
    ],
    ownScreen: '/exhibition-venues',
  },
  {
    id: 'artwork_types',
    group: 'lists',
    table: 'artwork_types',
    key: 'id',
    one: 'tipo de obra',
    many: 'tipos de obra',
    retired: 'retirado',
    columns: 'id, name, deactivated_at, deactivated_by',
    label: (row) => {
      const name = cell(row, 'name')
      return name === '' ? 'Sin nombre' : name
    },
    context: () => '',
    parents: [],
    ownScreen: '/artwork-types',
  },
  {
    id: 'series',
    group: 'lists',
    table: 'series',
    key: 'id',
    one: 'serie',
    many: 'series',
    retired: 'retirada',
    columns: 'id, name, artist, deactivated_at, deactivated_by',
    label: (row) => {
      const name = cell(row, 'name')
      return name === '' ? 'Sin nombre' : name
    },
    // The fund is said because each one has its own series and two funds can
    // have a series with the same name: without it, two identical lines.
    context: (row) => `Fondo ${cell(row, 'artist')}`,
    parents: [],
    ownScreen: '/series',
  },
  {
    id: 'physical_places',
    group: 'lists',
    table: 'physical_places',
    key: 'id',
    one: 'ubicación',
    many: 'ubicaciones',
    retired: 'retirada',
    columns: 'id, name, parent_id, deactivated_at, deactivated_by',
    label: (row) => {
      const name = cell(row, 'name')
      return name === '' ? 'Sin nombre' : name
    },
    context: () => '',
    // Nested on itself: PostgREST does not embed it, so the parent is
    // recognised through the set of withdrawn keys of this same table.
    parents: [
      { via: 'self', what: 'la ubicación que la contiene', column: 'parent_id', name: () => 'la de dentro' },
    ],
    ownScreen: '/places',
  },
  {
    id: 'archive_series',
    group: 'lists',
    table: 'archive_series',
    key: 'id',
    one: 'serie del archivo',
    many: 'series del archivo',
    retired: 'retirada',
    columns: 'id, name, parent_id, deactivated_at, deactivated_by',
    label: (row) => {
      const name = cell(row, 'name')
      return name === '' ? 'Sin nombre' : name
    },
    context: () => '',
    parents: [
      { via: 'self', what: 'la serie que la contiene', column: 'parent_id', name: () => 'la de dentro' },
    ],
    ownScreen: '/archive-series',
  },
  {
    id: 'document_types',
    group: 'lists',
    table: 'document_types',
    key: 'id',
    one: 'tipo de documento',
    many: 'tipos de documento',
    retired: 'retirado',
    columns: 'id, name, deactivated_at, deactivated_by',
    label: (row) => {
      const name = cell(row, 'name')
      return name === '' ? 'Sin nombre' : name
    },
    context: () => '',
    parents: [],
    ownScreen: '/document-types',
  },
  {
    id: 'publication_types',
    group: 'lists',
    table: 'publication_types',
    key: 'id',
    one: 'tipo de publicación',
    many: 'tipos de publicación',
    retired: 'retirado',
    columns: 'id, name, deactivated_at, deactivated_by',
    label: (row) => {
      const name = cell(row, 'name')
      return name === '' ? 'Sin nombre' : name
    },
    context: () => '',
    parents: [],
    ownScreen: '/publication-types',
  },
  {
    id: 'artwork_relationship_types',
    group: 'lists',
    table: 'artwork_relationship_types',
    key: 'id',
    one: 'tipo de relación',
    many: 'tipos de relación',
    retired: 'retirado',
    columns: 'id, name, inverse_name, deactivated_at, deactivated_by',
    label: (row) => {
      const name = cell(row, 'name')
      return name === '' ? 'Sin nombre' : name
    },
    context: (row) => {
      const inverse = cell(row, 'inverse_name')
      return inverse === '' ? '' : `Al revés se lee «${inverse}»`
    },
    parents: [],
    ownScreen: '/relationship-types',
  },
]

/** A class's specification by its identifier. */
export function kindSpec(id: TrashKindId): TrashKindSpec {
  const found = TRASH_KINDS.find((kind) => kind.id === id)
  // Unreachable by the type, and cheaper to narrow than to assert.
  if (!found) throw new Error(`Clase de la papelera desconocida: ${id}`)
  return found
}

/** A group's classes, in the register's order. */
export function kindsOfGroup(group: TrashGroupId): readonly TrashKindSpec[] {
  return TRASH_KINDS.filter((kind) => kind.group === group)
}
