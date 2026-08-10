import { describe, expect, it } from 'vitest'
import type { DocumentOption } from '../documentary/documents/documentLink'
import {
  archiveCountText,
  archiveListNotice,
  archiveOrderKey,
  rankArchiveDocuments,
  retiredDocumentCount,
  sortArchiveDocuments,
  withoutFileCount,
} from './documentIndex'

/**
 * The archive's index (RF-515, RF-606, RF-609).
 *
 * The gap it closes: a document could be uploaded, linked, downloaded, corrected and
 * digitised, **all from the record of an artwork that had it linked**. One
 * that no artwork had linked was not reachable from anywhere — the poster of a
 * show that does not speak of a particular piece, or the document whose link was withdrawn —.
 *
 * And what these tests pin down besides the gap: that the order is the SHELF's and not
 * an artwork's block's, that the ones not filed go last and not
 * inventing a place on it, and that the count says how many are left undigitised,
 * which is the only screen where that figure is a work list.
 */

function doc(over: Partial<DocumentOption> = {}): DocumentOption {
  return {
    id: 'doc-1',
    archive_code: 'AR-ARCH-0001',
    title: 'Carta de la galería',
    start_year: 1985,
    end_year: null,
    approximate_date: false,
    unconfirmed_date: false,
    date_note: '',
    date_text: '1985',
    file_path: 'archivo/x.pdf',
    file_size_bytes: 3_355_443,
    mime_type: 'application/pdf',
    active: true,
    document_type: { id: 't1', name: 'Carta', active: true },
    ...over,
  } as DocumentOption
}

describe('archiveOrderKey, con qué se ordena un documento', () => {
  it('con su signatura, normalizada como la compara el índice único', () => {
    // Two references differing only in case are the SAME to the database, so they are for
    // the ordering too.
    expect(archiveOrderKey(doc({ archive_code: 'AR-ARCH-0001' }))).toBe(
      archiveOrderKey(doc({ archive_code: 'ar-arch-0001' })),
    )
  })

  it('y null cuando el documento no está archivado todavía', () => {
    expect(archiveOrderKey(doc({ archive_code: null }))).toBeNull()
    expect(archiveOrderKey(doc({ archive_code: '   ' }))).toBeNull()
  })
})

describe('sortArchiveDocuments, el orden de la estantería', () => {
  it('por signatura', () => {
    const rows = [
      doc({ id: 'c', archive_code: 'AR-ARCH-0100' }),
      doc({ id: 'a', archive_code: 'AR-ARCH-0007' }),
      doc({ id: 'b', archive_code: 'AR-ARCH-0042' }),
    ]
    expect(sortArchiveDocuments(rows).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('los que no están archivados van AL FINAL, no entre los que sí', () => {
    // And this does not contradict the bibliography, where a reference with no author is placed
    // by its title among the rest: a document with no shelfmark has no place on the
    // shelf, whereas an anonymous text does have a place in the alphabet.
    const rows = [
      doc({ id: 'sin', archive_code: null, title: 'AAA recorte sin archivar' }),
      doc({ id: 'con', archive_code: 'AR-ARCH-0100' }),
    ]
    expect(sortArchiveDocuments(rows).map((r) => r.id)).toEqual(['con', 'sin'])
  })

  it('entre los que no la tienen, por título en es-ES', () => {
    const rows = [
      doc({ id: 'z', archive_code: null, title: 'Zafra, notas' }),
      doc({ id: 'a', archive_code: null, title: 'Álbum de recortes' }),
    ]
    expect(sortArchiveDocuments(rows).map((r) => r.id)).toEqual(['a', 'z'])
  })

  it('el orden es estable entre dos cargas', () => {
    const rows = [
      doc({ id: 'b', archive_code: 'AR-ARCH-0001', title: 'Igual' }),
      doc({ id: 'a', archive_code: 'AR-ARCH-0001', title: 'Igual' }),
    ]
    expect(sortArchiveDocuments(rows).map((r) => r.id)).toEqual(['a', 'b'])
    expect(sortArchiveDocuments(rows.slice().reverse()).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('no toca el array que recibe', () => {
    const rows = [doc({ id: 'b', archive_code: 'AR-ARCH-0100' }), doc({ id: 'a', archive_code: 'AR-ARCH-0001' })]
    sortArchiveDocuments(rows)
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('rankArchiveDocuments, lo que la búsqueda encuentra (RF-606)', () => {
  const archivo = [
    doc({ id: 'carta', archive_code: 'AR-ARCH-0001', title: 'Carta de la galería', start_year: 1985, date_text: '1985' }),
    doc({
      id: 'recorte',
      archive_code: null,
      title: 'Recorte del Hoy sobre la muestra de Zafra',
      start_year: null,
      date_text: '',
      file_path: null,
      file_size_bytes: null,
      mime_type: null,
      document_type: { id: 't2', name: 'Recorte de prensa', active: true },
    }),
    doc({ id: 'retirado', archive_code: 'AR-ARCH-0500', title: 'Duplicado', active: false }),
  ]

  it('sin nada teclado, el índice entero en orden de estantería', () => {
    expect(rankArchiveDocuments(archivo, '').map((e) => e.row.id)).toEqual(['carta', 'recorte'])
  })

  it('caza por signatura', () => {
    expect(rankArchiveDocuments(archivo, 'arch-0001').map((e) => e.row.id)).toEqual(['carta'])
  })

  it('caza por el tipo, que no está en el título', () => {
    expect(rankArchiveDocuments(archivo, 'recorte de prensa').map((e) => e.row.id)).toEqual([
      'recorte',
    ])
  })

  it('sin coincidencias devuelve la lista vacía, para que la pantalla lo explique', () => {
    expect(rankArchiveDocuments(archivo, 'zzzzz')).toEqual([])
  })

  it('cada fila trae lo que se pinta, y nunca un hueco (RF-304)', () => {
    const [fila] = rankArchiveDocuments(archivo, 'carta de la galería')
    expect(fila?.code).toBe('AR-ARCH-0001')
    expect(fila?.title).toBe('Carta de la galería')
    expect(fila?.kind).toBe('Carta')
    expect(fila?.date).toBe('1985')
    expect(fila?.digitized).toBe(true)
    expect(fila?.fileText).toContain('Digitalizado')
  })

  it('el que no está archivado ni fechado ni digitalizado lo dice todo, sin huecos', () => {
    const [fila] = rankArchiveDocuments(archivo, 'hoy sobre la muestra')
    expect(fila?.code).toBeNull()
    expect(fila?.date).toBe('Sin fecha')
    expect(fila?.digitized).toBe(false)
    expect(fila?.fileText).toBe('Sin digitalizar')
  })

  it('los retirados no salen si no se piden, y pedidos salen marcados', () => {
    expect(rankArchiveDocuments(archivo, '').map((e) => e.row.id)).not.toContain('retirado')
    const conRetirados = rankArchiveDocuments(archivo, '', { includeRetired: true })
    expect(conRetirados.find((e) => e.row.id === 'retirado')?.retired).toBe(true)
  })

  it('se cuentan los retirados, para no ofrecer un interruptor que no cambia nada', () => {
    expect(retiredDocumentCount(archivo)).toBe(1)
    expect(retiredDocumentCount([doc()])).toBe(0)
  })
})

describe('archiveCountText, cuántos hay y cuántos quedan por escanear', () => {
  it('el total cuando no se busca', () => {
    expect(archiveCountText({ total: 12, shown: 12, searching: false, withoutFile: 0 })).toBe(
      '12 documentos',
    )
    expect(archiveCountText({ total: 1, shown: 1, searching: false, withoutFile: 0 })).toBe(
      '1 documento',
    )
  })

  it('la fracción cuando la búsqueda recorta', () => {
    expect(archiveCountText({ total: 12, shown: 3, searching: true, withoutFile: 0 })).toBe(
      '3 de 12 documentos',
    )
  })

  it('y los que faltan por digitalizar, que es la lista de trabajo del escaneo', () => {
    expect(archiveCountText({ total: 12, shown: 12, searching: false, withoutFile: 5 })).toBe(
      '12 documentos · 5 sin digitalizar',
    )
    expect(archiveCountText({ total: 12, shown: 12, searching: false, withoutFile: 1 })).toBe(
      '12 documentos · 1 sin digitalizar',
    )
  })

  it('se cuentan sobre lo que se está enseñando', () => {
    const entries = rankArchiveDocuments(
      [doc({ id: 'a' }), doc({ id: 'b', file_path: null }), doc({ id: 'c', file_path: '  ' })],
      '',
    )
    expect(withoutFileCount(entries)).toBe(2)
  })
})

describe('archiveListNotice, nunca una página en blanco', () => {
  const base = { loading: false, error: null, total: 5, shown: 5, query: '', includingRetired: false }

  it('con filas no dice nada', () => {
    expect(archiveListNotice(base)).toBeNull()
  })

  it('mientras carga lo dice, y el error manda sobre eso', () => {
    expect(archiveListNotice({ ...base, loading: true, shown: 0 })).toBe('Cargando el archivo…')
    expect(archiveListNotice({ ...base, loading: true, shown: 0, error: 'Sin red' })).toBe('Sin red')
  })

  it('una búsqueda sin resultados apunta a la papelera', () => {
    const text = archiveListNotice({ ...base, shown: 0, query: 'zzz' })
    expect(text).toContain('No se ha encontrado ningún documento')
    expect(text).toContain('retirado')
  })

  it('y si ya se incluyen los retirados, no la ofrece otra vez', () => {
    expect(archiveListNotice({ ...base, shown: 0, query: 'zzz', includingRetired: true })).toContain(
      'ni entre los retirados',
    )
  })

  it('el archivo vacío dice de dónde salen los documentos', () => {
    // And it does not offer a creation that does not exist here: it is uploaded from an
    // artwork's documentation, because that way it lands uploaded and linked in one go.
    const text = archiveListNotice({ ...base, total: 0, shown: 0 })
    expect(text).toContain('Todavía no hay ningún documento')
    expect(text).toContain('desde la documentación de una obra')
  })

  it('y con todos retirados lo dice, en vez de parecer un archivo vacío', () => {
    expect(archiveListNotice({ ...base, total: 3, shown: 0 })).toContain('están retirados')
  })
})
