import { describe, expect, it } from 'vitest'
import type { DocumentLinkRow } from '../documentaryRows'
import {
  documentView,
  documentViews,
  documentsSummary,
  fundText,
  missingFileNote,
} from './documentView'

/**
 * «Documentación relacionada» línea a línea (RF-515, RF-516, RF-304).
 *
 * Lo que se comprueba aquí es la lectura: que ningún dato ausente deje un hueco,
 * que las dos notas —la del enlace y la del documento— no se confundan en una, y
 * que la diferencia entre «no está digitalizado» y «no se puede leer» se diga.
 */

function link(over: Partial<DocumentLinkRow> = {}): DocumentLinkRow {
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
      file_path: 'archivo/AR-ARCH-0001_a1b2.pdf',
      file_size_bytes: 3_355_443,
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

/** Un documento con los campos que se quieran cambiados, dentro de su enlace. */
function withDocument(over: Partial<NonNullable<DocumentLinkRow['document']>>): DocumentLinkRow {
  return link({ document: { ...link().document!, ...over } })
}

describe('los datos de un documento en la ficha', () => {
  it('la línea de un documento completo', () => {
    const view = documentView(link())
    expect(view.title).toBe('Carta de la galería')
    expect(view.code).toBe('AR-ARCH-0001')
    expect(view.typeText).toBe('Carta')
    expect(view.seriesText).toBe('Correspondencia')
    expect(view.dateText).toBe('1985')
    expect(view.fundText).toBe('Alberto Rotili')
    expect(view.unavailable).toBe(false)
    expect(view.retired).toBe(false)
  })

  it('RF-304: lo que la base deja opcional no deja un hueco', () => {
    const view = documentView(
      withDocument({
        archive_code: null,
        document_type: null,
        archive_series: null,
        start_year: null,
        date_text: '',
      }),
    )
    expect(view.code).toBeNull()
    expect(view.typeText).toBe('Tipo sin clasificar')
    expect(view.seriesText).toBe('Sin clasificar en el archivo')
    expect(view.dateText).toBe('Sin fecha')
  })

  it('la fecha es la que compuso la base (ADR-004), con sus marcas', () => {
    expect(documentView(withDocument({ date_text: 'c. 1978-1980 [?]' })).dateText).toBe(
      'c. 1978-1980 [?]',
    )
    // Sin la columna generada, el espejo de documentaryFormat da lo mismo.
    expect(
      documentView(
        withDocument({ date_text: '', start_year: 1978, end_year: 1978 }),
      ).dateText,
    ).toBe('1978-1978')
  })

  /**
   * El fondo nulo NO es «sin revisar»: `artist_fund` se hizo opcional a propósito,
   * porque un recorte sobre una colectiva de los dos artistas —o un documento de
   * contexto que no es de ninguno— no puede elegir.
   */
  it('un documento que no es de un solo fondo lo dice, y no parece un dato sin rellenar', () => {
    expect(fundText(null)).toBe('No es de un solo fondo')
    expect(fundText('RUIZ_CAMPINS')).toBe('María Ruiz Campins')
    expect(documentView(withDocument({ artist_fund: null })).fundText).toBe('No es de un solo fondo')
  })

  it('un tipo o una serie retirados se cargan igual y se marcan, en vez de desaparecer', () => {
    const view = documentView(
      withDocument({
        document_type: { id: 'dt-1', name: 'Carta', active: false },
        archive_series: { id: 'as-1', parent_id: null, name: 'Correspondencia', active: false },
      }),
    )
    expect(view.typeText).toBe('Carta')
    expect(view.typeRetired).toBe(true)
    expect(view.seriesRetired).toBe(true)
  })

  it('RF-901: un documento en la papelera detrás de un enlace vivo se señala', () => {
    expect(documentView(withDocument({ active: false })).retired).toBe(true)
  })

  it('las dos notas no se mezclan: una dice por qué está aquí, la otra qué es', () => {
    const view = documentView(
      link({ note: 'Menciona el cuadro en el segundo párrafo', document: { ...link().document!, note: 'Papel timbrado, dos hojas' } }),
    )
    expect(view.linkNote).toBe('Menciona el cuadro en el segundo párrafo')
    expect(view.documentNote).toBe('Papel timbrado, dos hojas')
  })

  it('una nota en blanco es null y no una línea vacía en pantalla', () => {
    const view = documentView(link({ note: '   ' }))
    expect(view.linkNote).toBeNull()
    expect(view.documentNote).toBeNull()
  })
})

describe('el documento que no se puede leer (RF-304)', () => {
  /**
   * La fila NO se descarta: el enlace existe, y quitarlo de la pantalla acortaría en
   * silencio la documentación de la obra. Se dice lo que pasa y no se inventa nada.
   */
  it('se queda en la lista, diciendo que no se puede leer', () => {
    const view = documentView(link({ note: 'Sale en la página 3', document: null }))
    expect(view.unavailable).toBe(true)
    expect(view.title).toBe('Documento no disponible')
    expect(view.file).toBeNull()
    expect(view.fileNote).toContain('no se puede leer')
    // La nota del enlace es NUESTRA, no del documento: se sigue leyendo.
    expect(view.linkNote).toBe('Sale en la página 3')
    expect(view.documentId).toBe('doc-1')
  })

  it('nombra a quien lo tiene enlazado, y por omisión es la obra', () => {
    // La misma fila se lee desde una obra y desde una exposición (RF-516), y esta frase
    // es lo ÚNICO que cambia entre los dos lados del puente. Decir «esta obra» en la
    // ficha de una exposición no es un detalle de estilo: cuenta mal dónde está el hueco.
    expect(documentView(link({ document: null })).fileNote).toContain('con esta obra')
    expect(
      documentView(link({ document: null }), { owner: 'exhibition' }).fileNote,
    ).toContain('con esta exposición')
    expect(
      documentView(link({ document: null }), { owner: 'exhibition' }).fileNote,
    ).not.toContain('esta obra')
  })
})

describe('el fichero digitalizado, o su ausencia (RF-408)', () => {
  it('digitalizado: la ficha ofrece la descarga con su peso', () => {
    const view = documentView(link())
    expect(view.file?.label).toBe('Descargar el documento (3,2 MB)')
    expect(view.fileNote).toBeNull()
  })

  it('sin digitalizar: no hay botón, y se dice dónde está el papel y cómo pedirlo', () => {
    const view = documentView(
      withDocument({ file_path: null, file_size_bytes: null, mime_type: null, uploaded_at: null }),
      { placeText: () => 'Edificio A, Archivo, Caja 3' },
    )
    expect(view.file).toBeNull()
    expect(view.fileNote).toContain('Sin digitalizar')
    expect(view.fileNote).toContain('Edificio A, Archivo, Caja 3')
    expect(view.fileNote).toContain('AR-ARCH-0001')
  })

  it('sin quien resuelva el sitio, no se inventa una ubicación', () => {
    const view = documentView(withDocument({ file_path: null }))
    expect(view.placeText).toBeNull()
    expect(view.fileNote).not.toContain('Está en')
    expect(view.fileNote).toContain('AR-ARCH-0001')
  })

  it('un lugar que el árbol no conoce se trata como no saberlo', () => {
    const view = documentView(withDocument({ file_path: null }), { placeText: () => '' })
    expect(view.placeText).toBeNull()
  })

  it('sin sitio y sin signatura, la frase sigue siendo una frase', () => {
    expect(missingFileNote({ code: null, placeText: null })).toBe(
      'Sin digitalizar: no consta ningún fichero subido, así que solo está en papel.',
    )
  })

  it('el sitio del papel se lee también cuando el documento SÍ está digitalizado', () => {
    const view = documentView(link(), { placeText: () => 'Edificio A, Caja 3' })
    expect(view.placeText).toBe('Edificio A, Caja 3')
  })
})

describe('el resumen que encabeza el bloque abierto', () => {
  /** Una fila reducida a lo que el resumen mira: si hay fichero y cuánto pesa. */
  function view(bytes: number | null): { file: { bytes: number | null } | null } {
    return { file: bytes === null ? null : { bytes } }
  }

  it('sin filas no dice nada: de un bloque vacío ya habla su explicación', () => {
    expect(documentsSummary([])).toBeNull()
  })

  it('cuenta cuántos se pueden ver desde aquí y cuánto costaría bajarlos', () => {
    expect(documentsSummary([view(1_048_576), view(1_048_576), view(null)])).toBe(
      '2 de 3 digitalizados · 2,0 MB en total',
    )
  })

  it('todos digitalizados', () => {
    expect(documentsSummary([view(524_288), view(524_288)])).toBe(
      'Los 2 digitalizados · 1,0 MB en total',
    )
  })

  it('uno solo, y digitalizado, concuerda en singular', () => {
    expect(documentsSummary([view(40_960)])).toBe('Digitalizado · 40 KB')
  })

  it('ninguno digitalizado se dice sin sonar a que no exista el documento', () => {
    expect(documentsSummary([view(null), view(null)])).toBe(
      'Ninguno digitalizado: los originales están en papel.',
    )
    expect(documentsSummary([view(null)])).toBe('Sin digitalizar: el original está en papel.')
  })

  it('un tamaño sin registrar no rompe la suma ni inventa megas', () => {
    expect(documentsSummary([{ file: { bytes: null } }, view(null)])).toBe(
      '1 de 2 digitalizados',
    )
  })

  it('documentViews respeta el orden que trae la consulta, del más antiguo al más nuevo', () => {
    const rows = [link({ id: 'a' }), link({ id: 'b' }), link({ id: 'c' })]
    expect(documentViews(rows).map((v) => v.id)).toEqual(['a', 'b', 'c'])
  })
})
