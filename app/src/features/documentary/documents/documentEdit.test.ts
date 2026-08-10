import { describe, expect, it } from 'vitest'
import {
  documentEditDraft,
  documentEditedNotice,
  documentReachNotice,
  documentRetiredNotice,
  planDocumentEdit,
  scanAddedNotice,
  scanTargetProblem,
  documentEditDraft as draftOf,
  type EditableDocument,
} from './documentEdit'

/**
 * Corregir un documento del archivo, y darle el escaneo que le faltaba (RF-515,
 * RF-408, RF-516).
 *
 * Estos tests cubren un hueco que la ficha de obra declaraba en voz alta: un documento
 * se subía y se quedaba como se hubiera subido. Y cubren, sobre todo, las dos cosas que
 * un formulario de corrección puede hacer mal sin que se note al mirarlo:
 *
 *   · **guardar cuando no hay nada que guardar.** Escribir la fila mueve `updated_at`,
 *     `updated_by` y una entrada del historial de cambios (RF-1501). Un documento que
 *     consta corregido hoy sin que nadie haya corregido nada es una traza que miente, y
 *     el historial existe para lo contrario.
 *   · **decir «no lo tiene enlazado nada más» cuando el recuento se ha caído.** Eso es
 *     cómo alguien reescribe la signatura de un expediente creyendo que es cosa de su
 *     ficha. Null es «no se sabe» y nunca cero.
 */

function document(over: Partial<EditableDocument> = {}): EditableDocument {
  return {
    id: 'doc-1',
    archive_code: 'AR-ARCH-0001',
    title: 'Carta de la galería',
    document_type_id: 'type-1',
    archive_series_id: null,
    artist_fund: 'ROTILI',
    start_year: 1985,
    end_year: null,
    approximate_date: false,
    unconfirmed_date: false,
    date_note: '',
    physical_place_id: null,
    note: 'tres folios',
    file_path: null,
    active: true,
    ...over,
  }
}

describe('documentEditDraft, la fila como el formulario la escribe', () => {
  it('abre los nulos de texto a cadena vacía y conserva los de las claves', () => {
    const draft = documentEditDraft(document({ archive_code: null, archive_series_id: null }))
    // A controlled `input` with null is a field React takes as uncontrolled.
    expect(draft.archiveCode).toBe('')
    // Here null IS the answer —«sin clasificar»— and not a gap.
    expect(draft.archiveSeriesId).toBeNull()
    expect(draft.artistFund).toBe('ROTILI')
    expect(draft.startYear).toBe(1985)
  })
})

describe('planDocumentEdit, qué hacer con lo que hay en el formulario (RF-1501)', () => {
  it('sin tocar nada no se escribe la fila', () => {
    const row = document()
    expect(planDocumentEdit(row, draftOf(row))).toEqual({ action: 'unchanged' })
  })

  it('un cambio de verdad se manda, y solo las columnas del documento', () => {
    const row = document()
    const plan = planDocumentEdit(row, { ...draftOf(row), title: 'Carta de la galería Juana Mordó' })
    expect(plan.action).toBe('update')
    if (plan.action !== 'update') return
    expect(plan.payload.title).toBe('Carta de la galería Juana Mordó')
    // The file's four columns do NOT travel in a correction: sending them half-filled
    // clashes with `archive_documents_file_all_or_nothing`.
    expect(plan.payload).not.toHaveProperty('file_path')
    expect(plan.payload).not.toHaveProperty('file_size_bytes')
    // `date_text` is a generated column: any value sent is an error.
    expect(plan.payload).not.toHaveProperty('date_text')
  })

  it('cambiar solo las mayúsculas de la signatura no es una corrección', () => {
    // El índice único es sobre `place_key(archive_code)`: para la base «ar-arch-1» y
    // «AR-ARCH-1» son la misma signatura, así que escribir la fila no cambiaría nada y
    // dejaría una traza de un cambio que no existe.
    const row = document({ archive_code: 'ar-arch-0001' })
    const plan = planDocumentEdit(row, { ...draftOf(row), archiveCode: 'AR-ARCH-0001' })
    expect(plan).toEqual({ action: 'unchanged' })
  })

  it('quitar la signatura sí es una corrección', () => {
    const row = document({ archive_code: 'AR-ARCH-0001' })
    const plan = planDocumentEdit(row, { ...draftOf(row), archiveCode: '' })
    expect(plan.action).toBe('update')
    if (plan.action !== 'update') return
    // Empty goes as NULL and not as '': the column admits null and the CHECK rejects «».
    expect(plan.payload.archive_code).toBeNull()
  })

  it('poner una signatura donde no había también', () => {
    const row = document({ archive_code: null })
    const plan = planDocumentEdit(row, { ...draftOf(row), archiveCode: 'AR-ARCH-0007' })
    expect(plan.action).toBe('update')
  })

  it('quitarle el año a un documento marcado «c.» se avisa, no se desmarca en silencio', () => {
    // `archive_documents_flags_require_year`. Se podría normalizar y mandar —el payload
    // lo hace por su cuenta, que es la red de debajo— pero lo que la catalogadora
    // necesita saber es que la marca que ella puso deja de tener sentido: desmarcarla
    // sin decírselo es cambiarle un dato investigado por la espalda.
    const row = document({ start_year: 1985, approximate_date: true })
    const plan = planDocumentEdit(row, { ...draftOf(row), startYear: null, approximate: true })
    expect(plan.action).toBe('problems')
    if (plan.action !== 'problems') return
    expect(plan.problems.map((problem) => problem.field)).toContain('flags')
  })

  it('quitando el año y la marca a la vez, sí entra', () => {
    const row = document({ start_year: 1985, approximate_date: true })
    const plan = planDocumentEdit(row, {
      ...draftOf(row),
      startYear: null,
      approximate: false,
    })
    expect(plan.action).toBe('update')
    if (plan.action !== 'update') return
    expect(plan.payload.start_year).toBeNull()
    expect(plan.payload.approximate_date).toBe(false)
  })

  it('lo que la base rechazaría se dice antes de mandarlo', () => {
    const row = document()
    const plan = planDocumentEdit(row, { ...draftOf(row), title: '   ' })
    expect(plan.action).toBe('problems')
    if (plan.action !== 'problems') return
    expect(plan.problems.map((problem) => problem.field)).toContain('title')
  })

  it('una incoherencia de fechas se detecta sin viaje de ida y vuelta', () => {
    const row = document()
    const plan = planDocumentEdit(row, { ...draftOf(row), startYear: 1990, endYear: 1985 })
    expect(plan.action).toBe('problems')
  })
})

describe('documentReachNotice, el alcance de la corrección medido (RF-516)', () => {
  it('sin nada más enlazado lo dice, y dice que sigue en el archivo', () => {
    const text = documentReachNotice({ otherArtworks: 0, exhibitions: 0 })
    expect(text).toContain('no lo tiene enlazado nada más')
    expect(text).toContain('mañana')
  })

  it('cuenta las obras', () => {
    expect(documentReachNotice({ otherArtworks: 1, exhibitions: 0 })).toContain('otra obra')
    expect(documentReachNotice({ otherArtworks: 3, exhibitions: 0 })).toContain('otras 3 obras')
  })

  it('cuenta las exposiciones, que no son obras', () => {
    // RF-516: a poster linked to the show and to no other artwork is still a
    // poster that another record reads.
    const text = documentReachNotice({ otherArtworks: 0, exhibitions: 1 })
    expect(text).toContain('una exposición')
    expect(text).not.toContain('no lo tiene enlazado nada más')
  })

  it('las dos mitades juntas se leen como una frase', () => {
    expect(documentReachNotice({ otherArtworks: 3, exhibitions: 2 })).toContain(
      'otras 3 obras y 2 exposiciones',
    )
  })

  it('un recuento sin terminar NO dice que no haya nada', () => {
    // El caso que importa: null es «no se sabe». Decir «no lo tiene enlazado nada más»
    // sobre un recuento caído es cómo alguien reescribe una signatura creyendo que es
    // cosa de su ficha.
    for (const reach of [
      { otherArtworks: null, exhibitions: 0 },
      { otherArtworks: 0, exhibitions: null },
      { otherArtworks: null, exhibitions: null },
    ]) {
      const text = documentReachNotice(reach)
      expect(text).toContain('No se ha podido contar')
      expect(text).not.toContain('no lo tiene enlazado nada más')
    }
  })

  it('siempre dice que el documento es del archivo y no de esta obra', () => {
    for (const reach of [
      { otherArtworks: 0, exhibitions: 0 },
      { otherArtworks: 9, exhibitions: 1 },
      { otherArtworks: null, exhibitions: null },
    ]) {
      expect(documentReachNotice(reach)).toContain('es del archivo, no de esta obra')
    }
  })
})

describe('documentRetiredNotice, corregir uno retirado (RF-901)', () => {
  it('en circulación no dice nada', () => {
    expect(documentRetiredNotice({ active: true })).toBeNull()
  })

  it('retirado avisa de que la corrección no lo devuelve', () => {
    const text = documentRetiredNotice({ active: false })
    expect(text).toContain('seguirá retirado')
    expect(text).toContain('papelera')
  })
})

describe('scanTargetProblem, por qué no se puede añadir un escaneo', () => {
  it('sin fichero, se puede', () => {
    expect(scanTargetProblem({ file_path: null })).toBeNull()
    // Una ruta de solo espacios no es un fichero: es lo mismo que no tener ninguno,
    // igual que lo lee `documentFileOffer`.
    expect(scanTargetProblem({ file_path: '   ' })).toBeNull()
  })

  it('con fichero, no se sustituye, y se dice por qué y qué hacer', () => {
    const text = scanTargetProblem({ file_path: 'archivo/ar-arch-0001_k3m9p2qz.pdf' })
    expect(text).not.toBeNull()
    // El motivo real y no un «no se puede»: las rutas del almacén son inmutables.
    expect(text).toContain('no se sobrescriben')
    // Y la salida: registrarlo como documento nuevo.
    expect(text).toContain('documento nuevo')
  })

  it('estar retirado no impide digitalizarlo', () => {
    // Un expediente retirado del archivo sigue mereciendo su escaneo, y subirlo no lo
    // devuelve a circulación.
    expect(scanTargetProblem({ file_path: null })).toBeNull()
    expect(documentRetiredNotice({ active: false })).not.toBeNull()
  })
})

describe('lo que se dice cuando ha salido bien', () => {
  it('la corrección nombra el documento', () => {
    expect(documentEditedNotice('Carta de la galería')).toBe(
      '«Carta de la galería» queda corregido en el archivo.',
    )
  })

  it('y un título en blanco no deja unas comillas vacías', () => {
    expect(documentEditedNotice('   ')).toBe('El documento queda corregido en el archivo.')
  })

  it('el escaneo dice el peso y que ya se puede descargar', () => {
    const text = scanAddedNotice('Carta de la galería', 3_355_443)
    expect(text).toContain('«Carta de la galería»')
    expect(text).toContain('ya está digitalizado')
    expect(text).toContain('3,2 MB')
  })
})
