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
 * Correcting an archive document, and giving it the scan it was missing (RF-515,
 * RF-408, RF-516).
 *
 * These tests cover a gap the artwork record declared out loud: a document
 * was uploaded and stayed however it had been uploaded. And they cover, above all, the two things
 * a correction form can do wrong without it showing when you look at it:
 *
 *   · **saving when there is nothing to save.** Writing the row moves `updated_at`,
 *     `updated_by` and an entry of the change history (RF-1501). A document that
 *     is recorded as corrected today without anybody having corrected anything is a trace that lies, and
 *     the history exists for the opposite.
 *   · **saying «nothing else has it linked» when the count has fallen over.** That is
 *     how somebody rewrites a file's shelfmark believing it is a matter for their own
 *     record. Null is «not known» and never zero.
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
    // The unique index is on `place_key(archive_code)`: for the base «ar-arch-1» and
    // «AR-ARCH-1» are the same shelfmark, so writing the row would change nothing and
    // would leave a trace of a change that does not exist.
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
    // `archive_documents_flags_require_year`. It could be normalised and sent —the payload
    // does it on its own, which is the net underneath— but what the cataloguer
    // needs to know is that the mark she set stops making sense: unmarking it
    // without telling her is changing a researched datum behind her back.
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
    // The case that matters: null is «not known». Saying «nothing else has it linked»
    // over a fallen count is how somebody rewrites a shelfmark believing it is
    // a matter for their own record.
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
    // A path of only spaces is not a file: it is the same as having none,
    // exactly as `documentFileOffer` reads it.
    expect(scanTargetProblem({ file_path: '   ' })).toBeNull()
  })

  it('con fichero, no se sustituye, y se dice por qué y qué hacer', () => {
    const text = scanTargetProblem({ file_path: 'archivo/ar-arch-0001_k3m9p2qz.pdf' })
    expect(text).not.toBeNull()
    // The real reason and not a «cannot be done»: the store's paths are immutable.
    expect(text).toContain('no se sobrescriben')
    // And the way out: register it as a new document.
    expect(text).toContain('documento nuevo')
  })

  it('estar retirado no impide digitalizarlo', () => {
    // A file withdrawn from the archive still deserves its scan, and uploading it does not
    // put it back in circulation.
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
