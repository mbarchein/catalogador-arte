import { describe, expect, it } from 'vitest'
import {
  describeDocumentRefusal,
  documentDatePreview,
  documentDraftIsSaveable,
  documentDraftPayload,
  documentDraftProblems,
  DOCUMENT_MAX_YEAR,
  DOCUMENT_MIN_YEAR,
  emptyNewDocumentDraft,
  problemsOf,
  type NewDocumentDraft,
} from './documentDraft'

/**
 * An archive document's record while it is being written (RF-515, RF-408, RF-218).
 *
 * The problems mirror `archive_documents`' constraints one by one, and the
 * base's messages are MEASURED: they were provoked with BEGIN/ROLLBACK against the local
 * base and read. The ones arriving in English naming a constraint are
 * translated; the one a trigger already wrote in Spanish is shown as is.
 */

function draft(over: Partial<NewDocumentDraft> = {}): NewDocumentDraft {
  return { ...emptyNewDocumentDraft(), title: 'Carta de la galería', ...over }
}

describe('un documento nuevo no trae ningún dato inventado', () => {
  /**
   * `artist_fund` is nullable on purpose: a clipping about a group show of the two
   * artists does not belong to a single fund. Starting it on the fund of the artwork being
   * catalogued would be the tempting shortcut and would put in a false datum.
   */
  it('el fondo del artista arranca vacío, que es una respuesta y no un hueco', () => {
    expect(emptyNewDocumentDraft().artistFund).toBeNull()
  })

  it('ni tipo, ni serie, ni sitio, ni fecha: «sin clasificar» también es una respuesta', () => {
    const blank = emptyNewDocumentDraft()
    expect(blank.documentTypeId).toBeNull()
    expect(blank.archiveSeriesId).toBeNull()
    expect(blank.physicalPlaceId).toBeNull()
    expect(blank.startYear).toBeNull()
  })

  it('en blanco no se puede guardar: falta lo único que la base exige', () => {
    expect(documentDraftIsSaveable(emptyNewDocumentDraft())).toBe(false)
    expect(problemsOf(documentDraftProblems(emptyNewDocumentDraft()), 'title')).toHaveLength(1)
  })
})

describe('lo que impide guardar, espejo de las restricciones (medidas)', () => {
  /** `archive_documents_title_not_blank`. It is the only indispensable thing. */
  it('sin título no hay documento, y se dice para qué sirve el título', () => {
    const problems = problemsOf(documentDraftProblems(draft({ title: '   ' })), 'title')
    expect(problems[0]?.text).toContain('no se vuelve a encontrar')
  })

  it('con título, y nada más, ya se puede guardar', () => {
    expect(documentDraftIsSaveable(draft())).toBe(true)
  })

  /** `archive_documents_code_shape`: a shelfmark of spaces would be a gap with a unique index. */
  it('una signatura de solo espacios se rechaza; vacía no', () => {
    expect(problemsOf(documentDraftProblems(draft({ archiveCode: '   ' })), 'code')).toHaveLength(1)
    expect(problemsOf(documentDraftProblems(draft({ archiveCode: '' })), 'code')).toHaveLength(0)
  })

  /** `archive_documents_coherent_range`: and it is `>=`, not `>`. */
  it('un final sin principio es media fecha', () => {
    const problems = problemsOf(documentDraftProblems(draft({ endYear: 1985 })), 'years')
    expect(problems[0]?.text).toContain('empezar en algún sitio')
  })

  it('el final anterior al inicial se rechaza con los dos años en la frase', () => {
    const problems = problemsOf(
      documentDraftProblems(draft({ startYear: 1985, endYear: 1979 })),
      'years',
    )
    expect(problems[0]?.text).toContain('1979')
    expect(problems[0]?.text).toContain('1985')
  })

  /**
   * A correspondence folder opened and closed the same year is a real range:
   * here the base checks `>=`, unlike an artwork's date of execution.
   */
  it('un tramo que empieza y acaba el mismo año es legítimo', () => {
    expect(documentDraftIsSaveable(draft({ startYear: 1985, endYear: 1985 }))).toBe(true)
  })

  /** `archive_documents_plausible_years`, which here is 1000..2100 and not the artworks' window. */
  it('un año imposible es una errata', () => {
    expect(problemsOf(documentDraftProblems(draft({ startYear: 999 })), 'years')).toHaveLength(1)
    expect(
      problemsOf(documentDraftProblems(draft({ startYear: 1985, endYear: 2101 })), 'years'),
    ).toHaveLength(1)
  })

  /**
   * On purpose it is NOT narrowed to the two artists' window: the archive keeps
   * context documents older than them, and refusing them from the form
   * would be rejecting something the catalogue accepts.
   */
  it('un documento de contexto del siglo XIX cabe', () => {
    expect(documentDraftIsSaveable(draft({ startYear: 1843 }))).toBe(true)
    expect(DOCUMENT_MIN_YEAR).toBe(1000)
    expect(DOCUMENT_MAX_YEAR).toBe(2100)
  })

  /** `archive_documents_flags_require_year`: «[?]» on its own says nothing. */
  it('«aproximada» y «sin confirmar» hablan de un año que tiene que existir', () => {
    const problems = problemsOf(documentDraftProblems(draft({ approximate: true })), 'flags')
    expect(problems[0]?.text).toContain('sin año')
    expect(
      problemsOf(documentDraftProblems(draft({ startYear: 1985, approximate: true })), 'flags'),
    ).toHaveLength(0)
  })
})

describe('la vista previa de la fecha coincide con lo que se guarda (ADR-004)', () => {
  it('un año a secas', () => {
    expect(documentDatePreview(draft({ startYear: 1985 }))).toBe('1985')
  })

  /**
   * `structuredDateText` and not `composeDate`: that one trims a range whose end equals
   * the start, which is right in `artworks` and false here, because the base
   * would store «1985-1985».
   */
  it('un rango de un solo año se muestra como la base lo guardará', () => {
    expect(documentDatePreview(draft({ startYear: 1985, endYear: 1985 }))).toBe('1985-1985')
  })

  it('las banderas y el rango, juntos', () => {
    expect(
      documentDatePreview(draft({ startYear: 1978, endYear: 1985, approximate: true, unconfirmed: true })),
    ).toBe('c. 1978-1985 [?]')
  })

  it('la nota gana entera, como en SQL: es la letra que la estructura no cabe', () => {
    expect(documentDatePreview(draft({ startYear: 1978, dateNote: 'finales de los setenta' }))).toBe(
      'finales de los setenta',
    )
  })

  it('sin fecha, nada: qué se lee en su lugar lo decide la ficha, no el formulario', () => {
    expect(documentDatePreview(draft())).toBe('')
  })
})

describe('lo que viaja a la base', () => {
  it('sin la columna generada y sin ninguna de las cuatro del fichero', () => {
    const payload = documentDraftPayload(draft({ startYear: 1985 }))
    expect(payload).not.toHaveProperty('date_text')
    expect(payload).not.toHaveProperty('file_path')
    expect(payload).not.toHaveProperty('file_size_bytes')
    expect(payload).not.toHaveProperty('mime_type')
    expect(payload).not.toHaveProperty('uploaded_at')
  })

  it('la nota del vínculo tampoco viaja aquí: es de la tabla puente (RF-516)', () => {
    const payload = documentDraftPayload(draft({ linkNote: 'reproducida en la página 3' }))
    expect(JSON.stringify(payload)).not.toContain('página 3')
  })

  /** The column allows null for a clipping nobody has filed; `''` is rejected by the check. */
  it('una signatura vacía va como NULL y no como cadena vacía', () => {
    expect(documentDraftPayload(draft({ archiveCode: '   ' })).archive_code).toBeNull()
    expect(documentDraftPayload(draft({ archiveCode: '  AR-ARCH-0001 ' })).archive_code).toBe(
      'AR-ARCH-0001',
    )
  })

  it('el título y las notas van recortados', () => {
    const payload = documentDraftPayload(draft({ title: '  Carta  ', note: '  tres folios  ' }))
    expect(payload.title).toBe('Carta')
    expect(payload.note).toBe('tres folios')
  })

  /**
   * Removing the year from a document marked «c.» cannot send a combination the
   * base rejects: the flags are normalised against the year instead of being believed.
   */
  it('sin año, las banderas y el año final se apagan solos', () => {
    const payload = documentDraftPayload(
      draft({ startYear: null, endYear: 1985, approximate: true, unconfirmed: true }),
    )
    expect(payload.end_year).toBeNull()
    expect(payload.approximate_date).toBe(false)
    expect(payload.unconfirmed_date).toBe(false)
  })
})

describe('cuando la base dice no, medido contra la base local', () => {
  /**
   * «duplicate key value violates unique constraint "archive_documents_code_unique"»,
   * con el detalle «Key (place_key(archive_code))=(ar-arch-0001) already exists». El
   * índice es sobre `place_key`, así que mayúsculas y tildes no distinguen dos
   * signaturas — que es justo la mitad de la regla que el mensaje crudo no dice.
   */
  it('una signatura repetida se explica, y con lo que hay que hacer en su lugar', () => {
    const said = describeDocumentRefusal('create', {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "archive_documents_code_unique"',
    })
    expect(said).toContain('sin contar mayúsculas ni tildes')
    expect(said).toContain('enlaza el que ya está')
    expect(said).not.toMatch(/duplicate|constraint|archive_documents/)
  })

  it('los tres «23514» del fichero y del título son tres errores distintos', () => {
    const of = (constraint: string) =>
      describeDocumentRefusal('create', {
        code: '23514',
        message: `new row for relation "archive_documents" violates check constraint "${constraint}"`,
      })
    expect(of('archive_documents_title_not_blank')).toContain('título')
    expect(of('archive_documents_file_size_positive')).toContain('0 bytes')
    expect(of('archive_documents_file_all_or_nothing')).toContain('a medias')
    expect(of('archive_documents_coherent_range')).toContain('año final')
    expect(of('archive_documents_flags_require_year')).toContain('un año')
    expect(of('archive_documents_plausible_years')).toContain('1000-2100')
    for (const constraint of [
      'archive_documents_title_not_blank',
      'archive_documents_file_all_or_nothing',
    ]) {
      expect(of(constraint)).not.toContain('check constraint')
    }
  })

  /**
   * RF-218. El trigger lo escribió en español y para ella, y el hint es la mitad que
   * dice qué hacer: los dos se muestran, unidos. Reescribirlo aquí sería una segunda
   * copia de una regla que vive al lado del dato.
   */
  it('el rechazo de «investigado, sin resultados» se muestra tal cual, con su pista', () => {
    const said = describeDocumentRefusal('link', {
      code: 'P0001',
      message:
        'La documentación de la obra AR-0001 consta investigada sin resultado y este vínculo la contradice',
      hint: 'Cambia antes el estado de la documentación a «En curso» o «Completa».',
    })
    expect(said).toBe(
      'La documentación de la obra AR-0001 consta investigada sin resultado y este vínculo la ' +
        'contradice. Cambia antes el estado de la documentación a «En curso» o «Completa».',
    )
  })

  it('sin pista no se queda una frase colgando ni con dos puntos', () => {
    expect(
      describeDocumentRefusal('link', {
        code: 'P0001',
        message: 'No tienes permiso para vincular un documento con una obra',
      }),
    ).toBe('No tienes permiso para vincular un documento con una obra.')
  })

  it('la obra que ya no está se lee como lo que es', () => {
    const said = describeDocumentRefusal('link', {
      code: '23503',
      message:
        'insert or update on table "artwork_documents" violates foreign key constraint "artwork_documents_catalog_id_fkey"',
    })
    expect(said).toContain('ya no está en el catálogo')
    expect(said).not.toContain('foreign key')
  })

  it('un permiso perdido se cuenta como permiso y no como SQLSTATE', () => {
    expect(describeDocumentRefusal('create', { code: '42501', message: 'permission denied' })).toContain(
      'permiso',
    )
  })

  it('la red se cuenta como red, y dice que no hay nada a medias', () => {
    const said = describeDocumentRefusal('create', { message: 'TypeError: Failed to fetch' })
    expect(said).toContain('conexión')
    expect(said).toContain('nada a medias')
  })

  /**
   * El fallo silencioso, y el que más vale: un update que las políticas niegan vuelve
   * 204 sin error. Sin contar las filas afectadas la pantalla diría «guardado» y no
   * habría cambiado nada.
   */
  it('cero filas afectadas y ningún error no es un éxito', () => {
    const said = describeDocumentRefusal('retire', null)
    expect(said).toContain('No se ha guardado nada')
    expect(said).toContain('Vuelve a entrar')
  })

  it('cada acción se nombra por su verbo cuando la base dice algo que no se mapea', () => {
    expect(describeDocumentRefusal('create', { message: 'algo raro' })).toContain(
      'registrar el documento',
    )
    expect(describeDocumentRefusal('link', { message: 'algo raro' })).toContain(
      'enlazar el documento con esta obra',
    )
    expect(describeDocumentRefusal('retire', { message: 'algo raro' })).toContain(
      'quitar el documento de la ficha',
    )
    expect(describeDocumentRefusal('load', { message: 'algo raro' })).toContain('cargar el archivo')
  })
})
