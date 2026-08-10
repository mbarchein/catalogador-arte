/**
 * The wastebasket: what classes of thing are inside, and what each one depends on to come back.
 *
 * The logical deletion has been in the schema from the start —**never a real delete**,
 * RF-901— and that is why there are twenty-one tables with `active`, `deactivated_at` and
 * `deactivated_by`. Twenty-one screens would be twenty-one different wordings of
 * the same sentence, so here each class is described ONCE —what it is called, with
 * what gender, which columns make its line legible and what it hangs from— and the screen
 * reads this table instead of writing its own case.
 *
 * It is the same split `DOCUMENTARY_SECTIONS` makes with the record's five
 * blocks, and for the same reason: the participle's gender («retirada» / «retirado»)
 * and the thing's name are data, not code branches, and this way they are tested.
 *
 * ── WHAT WAS MEASURED AGAINST THE BASE, AND NOT ASSUMED ──────────
 *
 * 1. **Who sees the wastebasket.** Eighteen of the twenty-one tables have the policy
 *    `(active and can_read()) or can_edit()`: whoever only consults does not see a single
 *    withdrawn row. Checked with the reader's token: `images?active=eq.false`
 *    returns `[]`. Three tables fall outside that pattern and their `select` is a bare
 *    `can_read()` —`artwork_types`, `series` and `physical_places`—, so a reader DOES
 *    see their withdrawn rows. It is not fixed from here (the schema is not touched), but
 *    the whole screen is closed to whoever does not catalogue, which is what this
 *    side can do.
 *
 * 2. **Recovering under a withdrawn parent does NOT fail.** Measured: an artwork is withdrawn, one
 *    of its links is restored, and the base accepts it —the `update` affects 1 row—. The
 *    row is active again and still is not visible, because what is not visible is its
 *    artwork. A button that «works» and does not change anything the user is looking at is
 *    worse than one that refuses with an explanation, so that case is stopped BEFORE
 *    writing. See `restoreBlock`.
 *
 * 3. **A withdrawn row's name is not freed.** The master tables' unique
 *    indexes —`parties_name_unique`, `document_types_name_unique`…— are NOT
 *    partial on `active`, so while something is in the wastebasket its name
 *    stays reserved and nobody can use it again. Consequence: recovering a
 *    master table row cannot clash over the name. The only table where the slot IS
 *    freed is `external_links`, whose indexes are `where ... and active`.
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
 * A PostgREST embedded row.
 *
 * It is accepted arriving as an object or as a list of one. Every one on this screen
 * is «one to one» —the foreign key is in the row itself— and they arrive as objects;
 * accepting the list is cheap and prevents a change in the client's shape from leaving the
 * lines without context in silence.
 */
export function embedded(row: TrashRow, key: string): TrashRow | null {
  const value = row[key]
  if (Array.isArray(value)) return (value[0] as TrashRow | undefined) ?? null
  if (value !== null && typeof value === 'object') return value as TrashRow
  return null
}

/**
 * Whether the embedded thing is withdrawn, or `null` when it is not known.
 *
 * `null` and `false` are not the same and the difference decides whether it is blocked: an optional
 * parent the row does not have —a document with no archive series— arrives as a
 * null embedded row, and that is NOT a withdrawn parent. Returning `false` there would be
 * right by chance; returning `null` tells the truth, which is that there is no parent.
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
 * What a thing depends on for recovering it to be of any use.
 *
 * Two ways of knowing it, and both are necessary because **PostgREST does not embed
 * a table in itself**: measured, `physical_places?select=parent:physical_places!
 * physical_places_parent_id_fkey(...)` answers `PGRST200`, «could not find a
 * relationship». The two tables nested on themselves —locations and
 * archive classification— are resolved with the only thing already at hand without
 * asking for anything: the set of withdrawn keys of their own table.
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
   * The participle with the thing's gender.
   *
   * It is a datum and not a code rule because Spanish does not forgive: «la
   * fotografía retirado» and «el eslabón retirada» are the two sentences that come out of
   * trying to deduce it from the name's ending.
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
   * The screen of its own from which this class is ALSO recovered, if there is one.
   *
   * The nine master tables already have theirs, and that is where the whole list is seen with
   * its name rules. It is linked instead of kept quiet: the wastebasket is a place
   * from which to look at everything together, not the only door.
   *
   * Without a screen of their own are the artworks, the photographs, the references, the
   * exhibitions and the archive documents: **for those, this is the only
   * way out**, which is exactly the pending item the wastebasket closes.
   */
  readonly ownScreen?: string
  /**
   * What is told if the base answers `23505` on recovering.
   *
   * Only `external_links` really needs it —see note 3 in the heading—, and
   * that is why it is optional instead of a generic sentence repeated twenty-one times.
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
 * The four groups, in the order one searches within a wastebasket.
 *
 * First what gets withdrawn by mistake and is missed the same day —an artwork, a
 * photograph—, and last the lists, which are withdrawn on purpose and are hardly ever
 * wanted back. It is not alphabetical: alphabetical puts «Las listas del catálogo»
 * before the artworks, which is putting what is looked for least in front of what is looked for most.
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
 * The twenty-one classes of thing the wastebasket can contain.
 *
 * The order within each group is that of importance for whoever searches, not the
 * alphabetical one or the migrations'.
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
    // An artwork hangs from nothing: it is the root. Its type, its series and its location
    // may be withdrawn, but that does not make it invisible —and the schema lets it
    // be recovered all the same—, so it is not blocked by them.
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
      // The party may be withdrawn with this link inside: the `tg_party_deactivation`
      // trigger only looks at the ACTIVE links, so withdrawing the
      // party was legal while the link was here.
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
    // A link with no title is named by its address, and with neither of the two —which
    // the base's `check` does not allow, but which costs nothing to support— what
    // it is missing is said instead of leaving the line mute and with no button to recover it.
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
    // Exactly one of the two owners is set —`external_links_exactly_one_owner`
    // forces it— and the other's embedded row arrives null, which
    // `embeddedRetired` translates to «there is no parent» and not to «withdrawn parent».
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
    // Since 5 August 2026 an exhibition DOES have a record of its own, and the
    // wastebasket links to it. It is the only one of the five classes that were
    // recovered only here to have stopped being so, and that is why this field is noted
    // now: without it, the wastebasket would be the only place to see a withdrawn
    // exhibition even though a screen exists that shows it better.
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
