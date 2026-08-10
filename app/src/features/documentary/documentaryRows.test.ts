import { describe, expect, it } from 'vitest'
import {
  ARTWORK_DOCUMENTARY_COLUMNS,
  CITATION_COLUMNS,
  DOCUMENT_LINK_COLUMNS,
  PARTICIPATION_COLUMNS,
  PROVENANCE_COLUMNS,
  RELATIONSHIP_COLUMNS,
  relationshipView,
  relationshipViews,
  sortCitations,
  sortDocumentLinks,
  sortParticipations,
  sortProvenance,
  type ArtworkDocumentaryRow,
  type ArtworkRef,
  type CitationRow,
  type DocumentLinkRow,
  type ParticipationRow,
  type PartyRef,
  type ProvenanceEventRow,
  type RelationshipRow,
} from './documentaryRows'

/**
 * Lo que cada bloque documental le pide a la base y lo que hace con la respuesta.
 *
 * Dos cosas se verifican aquí, y las dos han costado un fallo antes en este
 * proyecto:
 *
 *  1. que la lista de columnas seleccione TODO lo que su interfaz declara. Un
 *     campo que la consulta olvida llega como `undefined` con el tipo prometiendo
 *     un valor, que es exactamente lo que pasó con las esquinas de una
 *     fotografía: se guardaba el enderezado y no volvía nunca.
 *  2. el ORDEN, que no está en la consulta porque PostgREST no puede ordenar una
 *     fila padre por una columna incrustada, y que por tanto solo lo comprueba
 *     esta batería.
 */

// ── Fixtures ─────────────────────────────────────────────────
// Completas a propósito: el tipo obliga a nombrar todos los campos, y de ahí sale
// la comprobación de que la consulta los pide.

function party(over: Partial<PartyRef> = {}): PartyRef {
  return {
    id: 'party-1',
    party_type: 'PERSON',
    name: 'Familia Rotili',
    locality: 'Badajoz',
    country: 'España',
    active: true,
    ...over,
  }
}

function link(over: Partial<ProvenanceEventRow> = {}): ProvenanceEventRow {
  return {
    id: 'pe-1',
    catalog_id: 'AR-0001',
    position: 1,
    party_id: 'party-1',
    party_note: '',
    capacity: 'OWNER',
    acquisition: 'INHERITANCE',
    start_year: 1980,
    end_year: null,
    approximate_date: false,
    unconfirmed_date: false,
    date_note: '',
    date_text: '1980',
    note: '',
    active: true,
    party: party(),
    ...over,
  }
}

function citation(over: Partial<CitationRow> = {}, year: number | null = 1985): CitationRow {
  return {
    id: 'ab-1',
    catalog_id: 'AR-0001',
    bibliography_id: 'bib-1',
    pages: '34-36',
    note: '',
    active: true,
    reference: {
      id: 'bib-1',
      bibtex_key: 'rotili1985',
      authors: 'Álvarez, Juan',
      editors: '',
      title: 'La pintura extremeña de los ochenta',
      container_title: '',
      publication_type_id: 'pt-1',
      year,
      publisher: 'Diputación de Badajoz',
      place: 'Badajoz',
      note: '',
      active: true,
      publication_type: { id: 'pt-1', name: 'Libro', active: true },
    },
    ...over,
  }
}

function participation(over: Partial<ParticipationRow> = {}): ParticipationRow {
  return {
    id: 'ae-1',
    catalog_id: 'AR-0001',
    exhibition_id: 'ex-1',
    catalogue_number: '12 bis',
    note: '',
    active: true,
    exhibition: {
      id: 'ex-1',
      title: 'Rotili. Obra reciente',
      exhibition_type: 'INDIVIDUAL',
      venue_id: 'v-1',
      venue_note: '',
      year: 1985,
      start_date: '1985-03-12',
      end_date: '1985-05-04',
      date_note: '',
      catalogue_published: 'YES',
      catalogue_reference_id: 'bib-1',
      note: '',
      active: true,
      venue: {
        id: 'v-1',
        name: 'Museo de Bellas Artes',
        locality: 'Badajoz',
        country: 'España',
        party_id: 'party-2',
        note: '',
        active: true,
        party: party({ id: 'party-2', party_type: 'INSTITUTION' }),
      },
    },
    ...over,
  }
}

function documentLink(over: Partial<DocumentLinkRow> = {}): DocumentLinkRow {
  return {
    id: 'ad-1',
    catalog_id: 'AR-0001',
    document_id: 'doc-1',
    note: '',
    active: true,
    document: {
      id: 'doc-1',
      archive_code: 'AR-ARCH-0001',
      artist_fund: 'ROTILI',
      document_type_id: 'dt-1',
      title: 'Carta de la galería',
      archive_series_id: 'as-1',
      start_year: 1985,
      end_year: null,
      approximate_date: false,
      unconfirmed_date: false,
      date_note: '',
      date_text: '1985',
      physical_place_id: 'pp-1',
      file_path: 'obras/archivo/carta.pdf',
      file_size_bytes: 40_960,
      mime_type: 'application/pdf',
      uploaded_at: '2026-08-04T10:00:00Z',
      note: '',
      active: true,
      document_type: { id: 'dt-1', name: 'Carta', active: true },
      archive_series: { id: 'as-1', parent_id: null, name: 'Correspondencia', active: true },
    },
    ...over,
  }
}

function artworkRef(over: Partial<ArtworkRef> = {}): ArtworkRef {
  return {
    catalog_id: 'AR-0007',
    title: 'Estudio de manos',
    artist: 'ROTILI',
    execution_date: '1978',
    active: true,
    ...over,
  }
}

function relationship(over: Partial<RelationshipRow> = {}): RelationshipRow {
  return {
    id: 'ar-1',
    from_catalog_id: 'AR-0003',
    to_catalog_id: 'AR-0007',
    relationship_type_id: 'rt-1',
    note: '',
    active: true,
    relationship_type: {
      id: 'rt-1',
      name: 'Estudio previo de',
      inverse_name: 'Obra final de',
      is_symmetric: false,
      active: true,
    },
    from_artwork: artworkRef({ catalog_id: 'AR-0003', title: 'Retrato de taller' }),
    to_artwork: artworkRef(),
    ...over,
  }
}

function documentary(over: Partial<ArtworkDocumentaryRow> = {}): ArtworkDocumentaryRow {
  return {
    catalog_id: 'AR-0001',
    provenance: '',
    provenance_note: '',
    rights_holder_party_id: 'party-1',
    rights_holder_note: '',
    provenance_status: 'UNREVIEWED',
    bibliography_status: 'UNREVIEWED',
    exhibition_history_status: 'UNREVIEWED',
    documentation_status: 'UNREVIEWED',
    rights_holder: party(),
    ...over,
  }
}

/**
 * Cada campo de la fila tiene que estar en la lista de columnas. Los campos que
 * son filas incrustadas se comprueban por su cabecera (`party:parties(`), que es
 * lo que le dice a PostgREST que la traiga.
 */
function selectsEveryField(columns: string, row: object, embeds: Record<string, string> = {}) {
  for (const field of Object.keys(row)) {
    const embed = embeds[field]
    if (embed !== undefined) {
      expect(columns, `la incrustación de ${field}`).toContain(embed)
      continue
    }
    // With word boundaries: `id` must not be taken as good just because
    // `catalog_id` exists.
    expect(columns, `la columna ${field}`).toMatch(new RegExp(`\\b${field}\\b`))
  }
}

describe('las columnas que pide cada bloque', () => {
  it('la procedencia pide sus catorce columnas y la ficha de la parte (RF-509)', () => {
    selectsEveryField(PROVENANCE_COLUMNS, link(), { party: 'party:parties(' })
    // La columna generada de ADR-004: sin ella, cada pantalla compondría la fecha
    // por su cuenta y podrían no coincidir.
    expect(PROVENANCE_COLUMNS).toContain('date_text')
  })

  it('la bibliografía pide la cita, la referencia y el tipo de publicación (RF-504, RF-514)', () => {
    const row = citation()
    selectsEveryField(CITATION_COLUMNS, row, { reference: 'reference:bibliography(' })
    selectsEveryField(CITATION_COLUMNS, row.reference!, {
      publication_type: 'publication_type:publication_types(',
    })
    // «34-36», «s/p» y «lám. XII» son páginas: columna propia y citable (RF-504).
    expect(CITATION_COLUMNS).toMatch(/\bpages\b/)
  })

  it('el historial pide la participación, la exposición y la sede con su institución (RF-501, RF-512)', () => {
    const row = participation()
    selectsEveryField(PARTICIPATION_COLUMNS, row, { exhibition: 'exhibition:exhibitions(' })
    selectsEveryField(PARTICIPATION_COLUMNS, row.exhibition!, {
      venue: 'venue:exhibition_venues(',
    })
    selectsEveryField(PARTICIPATION_COLUMNS, row.exhibition!.venue!, { party: 'party:parties(' })
    // El número histórico en catálogo se cita exacto y se busca (RF-513).
    expect(PARTICIPATION_COLUMNS).toMatch(/\bcatalogue_number\b/)
  })

  it('la documentación pide el enlace, el documento, su tipo y su serie (RF-515, RF-516)', () => {
    const row = documentLink()
    selectsEveryField(DOCUMENT_LINK_COLUMNS, row, { document: 'document:archive_documents(' })
    selectsEveryField(DOCUMENT_LINK_COLUMNS, row.document!, {
      document_type: 'document_type:document_types(',
      archive_series: 'archive_series:archive_series(',
    })
    // Sin las cuatro columnas del fichero no hay manera de saber si el documento
    // está digitalizado: no hay bandera, es `file_path !== null`.
    for (const column of ['file_path', 'file_size_bytes', 'mime_type', 'uploaded_at']) {
      expect(DOCUMENT_LINK_COLUMNS).toMatch(new RegExp(`\\b${column}\\b`))
    }
  })

  it('las obras relacionadas piden el tipo y las DOS obras, con pista de clave ajena (RF-217)', () => {
    const row = relationship()
    selectsEveryField(RELATIONSHIP_COLUMNS, row, {
      relationship_type: 'relationship_type:artwork_relationship_types(',
      from_artwork: 'from_artwork:artworks!artwork_relationships_from_catalog_id_fkey(',
      to_artwork: 'to_artwork:artworks!artwork_relationships_to_catalog_id_fkey(',
    })
    // `inverse_name` es la etiqueta que enseña la obra del otro extremo: sin ella
    // la ficha inversa no puede decir nada.
    expect(RELATIONSHIP_COLUMNS).toMatch(/\binverse_name\b/)
    expect(RELATIONSHIP_COLUMNS).toMatch(/\bis_symmetric\b/)
  })

  it('la obra pide sus ocho columnas documentales y el titular de derechos (RF-218, RF-510, RF-511)', () => {
    selectsEveryField(ARTWORK_DOCUMENTARY_COLUMNS, documentary(), {
      rights_holder: 'rights_holder:parties(',
    })
  })
})

describe('el orden de la procedencia (RF-509)', () => {
  /**
   * El orden es `position`, MANUAL, y no las fechas: la mitad de los eslabones de
   * un catálogo razonado no tienen año conocido, y un orden derivado de nulos no
   * es un orden.
   */
  it('sigue la posición que ha puesto la catalogadora, no los años', () => {
    const rows = [
      link({ id: 'c', position: 3, start_year: 1960 }),
      link({ id: 'a', position: 1, start_year: null }),
      link({ id: 'b', position: 2, start_year: 1995 }),
    ]
    expect(sortProvenance(rows).map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('con la misma posición, el identificador rompe el empate y el orden es estable', () => {
    const rows = [link({ id: 'z', position: 1 }), link({ id: 'a', position: 1 })]
    expect(sortProvenance(rows).map((row) => row.id)).toEqual(['a', 'z'])
  })

  it('no toca el array que recibe', () => {
    const rows = [link({ id: 'b', position: 2 }), link({ id: 'a', position: 1 })]
    sortProvenance(rows)
    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
  })
})

describe('el orden de la bibliografía (RF-504)', () => {
  it('de la más antigua a la más reciente', () => {
    const rows = [
      citation({ id: 'c' }, 2001),
      citation({ id: 'a' }, 1972),
      citation({ id: 'b' }, 1985),
    ]
    expect(sortCitations(rows).map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  /** «s.f.» es un dato, pero no es una fecha: no puede encabezar la cronología. */
  it('las referencias sin año van al final, no al principio', () => {
    const rows = [citation({ id: 'sf' }, null), citation({ id: '1972' }, 1972)]
    expect(sortCitations(rows).map((row) => row.id)).toEqual(['1972', 'sf'])
  })

  it('a igual año ordena por autor con colación es-ES, con el acento en su sitio', () => {
    const rows = [
      citation({ id: 'z' }, 1985),
      citation({ id: 'a' }, 1985),
    ]
    rows[0]!.reference!.authors = 'Zamora, Ana'
    rows[1]!.reference!.authors = 'Álvarez, Juan'
    // Con la colación por omisión de la base, «Álvarez» se iría detrás de la z.
    expect(sortCitations(rows).map((row) => row.id)).toEqual(['a', 'z'])
  })

  it('una referencia que el lector no puede ver no revienta el orden', () => {
    const rows = [citation({ id: 'oculta', reference: null }), citation({ id: 'visible' }, 1985)]
    expect(sortCitations(rows).map((row) => row.id)).toEqual(['visible', 'oculta'])
  })
})

describe('el orden del historial expositivo (RF-502)', () => {
  it('RF-502: orden cronológico ascendente por la fecha de apertura', () => {
    const rows = [
      participation({ id: 'c', exhibition: { ...participation().exhibition!, start_date: '1990-01-10', year: 1990 } }),
      participation({ id: 'a', exhibition: { ...participation().exhibition!, start_date: '1979-11-02', year: 1979 } }),
      participation({ id: 'b', exhibition: { ...participation().exhibition!, start_date: '1985-03-12', year: 1985 } }),
    ]
    expect(sortParticipations(rows).map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('RF-502: una exposición con solo el año se coloca en el 1 de enero de ese año', () => {
    const bare = { ...participation().exhibition!, start_date: null, end_date: null, year: 1985 }
    const rows = [
      participation({ id: 'marzo', exhibition: { ...participation().exhibition!, start_date: '1985-03-12', year: 1985 } }),
      participation({ id: 'año', exhibition: bare }),
    ]
    expect(sortParticipations(rows).map((row) => row.id)).toEqual(['año', 'marzo'])
  })

  it('una exposición sin ninguna fecha va al final, no encabezando la carrera del artista', () => {
    const undated = { ...participation().exhibition!, start_date: null, end_date: null, year: null }
    const rows = [
      participation({ id: 'sin-fecha', exhibition: undated }),
      participation({ id: '1985' }),
    ]
    expect(sortParticipations(rows).map((row) => row.id)).toEqual(['1985', 'sin-fecha'])
  })
})

describe('el orden de la documentación de archivo (RF-516)', () => {
  it('del documento más antiguo al más reciente, y los sin fechar al final', () => {
    const rows = [
      documentLink({ id: 'sf', document: { ...documentLink().document!, start_year: null } }),
      documentLink({ id: '1990', document: { ...documentLink().document!, start_year: 1990 } }),
      documentLink({ id: '1972', document: { ...documentLink().document!, start_year: 1972 } }),
    ]
    expect(sortDocumentLinks(rows).map((row) => row.id)).toEqual(['1972', '1990', 'sf'])
  })
})

describe('las obras relacionadas leídas desde un extremo (RF-217)', () => {
  it('desde el extremo cercano se lee el nombre del tipo', () => {
    const view = relationshipView(relationship(), 'AR-0003')
    expect(view.label).toBe('Estudio previo de')
    expect(view.otherCatalogId).toBe('AR-0007')
    expect(view.other?.title).toBe('Estudio de manos')
    expect(view.reversed).toBe(false)
  })

  /**
   * La misma fila leída desde la otra obra dice lo contrario, y eso es lo que hace
   * que exista `inverse_name`: equivocar el sentido publicaría el estudio como la
   * obra final.
   */
  it('desde el extremo lejano se lee el nombre inverso, y la otra obra es la primera', () => {
    const view = relationshipView(relationship(), 'AR-0007')
    expect(view.label).toBe('Obra final de')
    expect(view.otherCatalogId).toBe('AR-0003')
    expect(view.other?.title).toBe('Retrato de taller')
    expect(view.reversed).toBe(true)
  })

  it('un tipo simétrico se lee igual desde los dos extremos', () => {
    const pair = relationship({
      relationship_type: {
        id: 'rt-2',
        name: 'Pareja de',
        inverse_name: '',
        is_symmetric: true,
        active: true,
      },
    })
    expect(relationshipView(pair, 'AR-0003').label).toBe('Pareja de')
    expect(relationshipView(pair, 'AR-0007').label).toBe('Pareja de')
    expect(relationshipView(pair, 'AR-0007').reversed).toBe(false)
  })

  it('RF-304: un tipo que el lector no puede ver no deja el hueco del verbo', () => {
    const view = relationshipView(relationship({ relationship_type: null }), 'AR-0007')
    expect(view.label).toBe('Tipo de relación no disponible')
    expect(view.otherCatalogId).toBe('AR-0003')
  })

  it('la obra del otro extremo puede no ser visible, y la relación sigue existiendo', () => {
    const view = relationshipView(relationship({ to_artwork: null }), 'AR-0003')
    expect(view.other).toBeNull()
    expect(view.otherCatalogId).toBe('AR-0007')
  })

  it('agrupa por tipo de relación y luego por código de la otra obra', () => {
    const rows = [
      relationship({ id: 'b', to_catalog_id: 'AR-0009', to_artwork: artworkRef({ catalog_id: 'AR-0009' }) }),
      relationship({
        id: 'c',
        relationship_type: {
          id: 'rt-2',
          name: 'Pareja de',
          inverse_name: '',
          is_symmetric: true,
          active: true,
        },
      }),
      relationship({ id: 'a' }),
    ]
    const views = relationshipViews(rows, 'AR-0003')
    expect(views.map((view) => view.label)).toEqual([
      'Estudio previo de',
      'Estudio previo de',
      'Pareja de',
    ])
    expect(views.map((view) => view.otherCatalogId)).toEqual(['AR-0007', 'AR-0009', 'AR-0007'])
  })
})
