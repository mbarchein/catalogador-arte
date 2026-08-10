import { describe, expect, it } from 'vitest'
import type { ReferenceRow } from '../documentaryRows'
import {
  planReferenceEdit,
  referenceEdit,
  referenceEditProblem,
  referenceFailureText,
  referencePayload,
  referenceReachNotice,
  referenceRetiredNotice,
  referenceTitleText,
  referenceTypeOptions,
  referenceWriteResult,
  type ReferenceEdit,
} from './referenceEdit'

/**
 * Correcting a bibliographic reference from the record of an artwork that cites it
 * (RF-504, RF-1106, ADR-007), while the reference's own record (RF-309)
 * does not exist.
 *
 * What is checked is what decides something: what is sent to the base, what is
 * rejected before sending it, when there is nothing to write, and —what makes
 * this piece different from any other correction in the record— what is said on
 * screen BEFORE saving, because the row belongs to the catalogue and it is read by every
 * artwork that cites it.
 *
 * The base's messages are measured against the local stack through the same
 * REST gateway the application uses, with two references created for that and
 * deleted afterwards. The codes and the constraint names that appear
 * here are the ones it answered.
 */

function reference(over: Partial<ReferenceRow> = {}): ReferenceRow {
  return {
    id: 'bib-1',
    bibtex_key: null,
    authors: 'Rotili, A.',
    editors: '',
    title: 'Álbum de la Sierra',
    container_title: '',
    publication_type_id: null,
    year: 1985,
    publisher: '',
    place: '',
    note: '',
    active: true,
    publication_type: null,
    ...over,
  }
}

function draft(over: Partial<ReferenceEdit> = {}): ReferenceEdit {
  return { ...referenceEdit(reference()), ...over }
}

describe('RF-504 · el borrador se abre con la referencia tal como está guardada', () => {
  it('trae los nueve datos que la ficha de la obra lee de la referencia', () => {
    const open = referenceEdit(
      reference({
        title: 'Zafra 1985',
        authors: 'VV. AA.',
        editors: 'Pérez, Juan',
        container_title: 'Revista de Estudios Extremeños',
        publisher: 'Diputación de Badajoz',
        place: 'Badajoz',
        year: 1990,
        publication_type_id: 'tipo-1',
        bibtex_key: 'zafra1985',
      }),
    )
    expect(open).toEqual({
      title: 'Zafra 1985',
      authors: 'VV. AA.',
      editors: 'Pérez, Juan',
      containerTitle: 'Revista de Estudios Extremeños',
      publisher: 'Diputación de Badajoz',
      place: 'Badajoz',
      year: 1990,
      publicationTypeId: 'tipo-1',
      bibtexKey: 'zafra1985',
    })
  })

  it('una referencia sin clave BibTeX abre el campo vacío y no con «null» escrito', () => {
    expect(referenceEdit(reference({ bibtex_key: null })).bibtexKey).toBe('')
  })

  it('un año nulo se conserva nulo: «s.f.» es un dato y no un hueco', () => {
    expect(referenceEdit(reference({ year: null })).year).toBeNull()
  })
})

describe('lo que viaja a la base', () => {
  it('todo recortado, incluido el título que la base no exige recortado', () => {
    // The base only rejects the blank title (`bibliography_title_not_blank`),
    // not the one with spaces around it: measured, a title with spaces is
    // stored as is. And a trailing space is invisible on screen.
    const payload = referencePayload(
      draft({ title: '  Zafra 1985 ', authors: ' VV. AA. ', place: ' Badajoz ' }),
    )
    expect(payload.title).toBe('Zafra 1985')
    expect(payload.authors).toBe('VV. AA.')
    expect(payload.place).toBe('Badajoz')
  })

  it('la clave vacía viaja como null y nunca como cadena vacía', () => {
    // Measured: a `patch` with `bibtex_key: ""` answers 23514 on
    // `bibliography_bibtex_key_shape`. And the unique index ignores nulls, which is
    // what allows many references with no key.
    expect(referencePayload(draft({ bibtexKey: '   ' })).bibtex_key).toBeNull()
    expect(referencePayload(draft({ bibtexKey: ' zafra1985 ' })).bibtex_key).toBe('zafra1985')
  })

  it('no se escribe `active`: corregir un dato no es sacar una referencia de la papelera', () => {
    expect(Object.keys(referencePayload(draft()))).not.toContain('active')
  })

  it('tampoco se escribe la nota de la referencia, que la ficha de la obra no muestra', () => {
    expect(Object.keys(referencePayload(draft()))).not.toContain('note')
  })
})

describe('RF-504 · lo que la base rechazaría se dice antes de ir a preguntar', () => {
  it('sin título no se guarda, y se dice para qué sirve el título', () => {
    const problem = referenceEditProblem(draft({ title: '   ' }))
    expect(problem).not.toBeNull()
    expect(problem).toContain('cada obra que la cita')
  })

  it('el año tiene que caer en la ventana plausible de la base (1000-2100)', () => {
    expect(referenceEditProblem(draft({ year: 999 }))).toContain('1000')
    expect(referenceEditProblem(draft({ year: 2101 }))).toContain('2100')
    expect(referenceEditProblem(draft({ year: 1000 }))).toBeNull()
    expect(referenceEditProblem(draft({ year: 2100 }))).toBeNull()
    // No year is legitimate: half a press-clipping collection carries no date.
    expect(referenceEditProblem(draft({ year: null }))).toBeNull()
  })

  it('la clave BibTeX no admite espacios, comas ni llaves', () => {
    // These are the characters that break an entry of a `.bib` file, which is what
    // the handle is for. Measured: 23514 on `bibliography_bibtex_key_shape`.
    expect(referenceEditProblem(draft({ bibtexKey: 'zafra 1985' }))).toContain('espacios')
    expect(referenceEditProblem(draft({ bibtexKey: 'zafra,1985' }))).not.toBeNull()
    expect(referenceEditProblem(draft({ bibtexKey: '{zafra}' }))).not.toBeNull()
    expect(referenceEditProblem(draft({ bibtexKey: 'zafra1985muba' }))).toBeNull()
    // Empty is «it has no key», which is the norm, not an error.
    expect(referenceEditProblem(draft({ bibtexKey: '  ' }))).toBeNull()
  })

  it('no se exige autoría ni año: un recorte sin firma ni fecha es una referencia buena', () => {
    expect(referenceEditProblem(draft({ authors: '', editors: '', year: null }))).toBeNull()
  })
})

describe('ADR-007 · guardar la corrección de una fila que comparte el catálogo', () => {
  const catalog = [
    reference({ id: 'bib-1', bibtex_key: 'rotili1985' }),
    reference({ id: 'bib-2', title: 'Zafra 1985', bibtex_key: 'zafra1985' }),
  ]

  /** The draft as the panel opens it over the catalogue's reference. */
  function open(over: Partial<ReferenceEdit> = {}): ReferenceEdit {
    return { ...referenceEdit(catalog[0]!), ...over }
  }

  it('con un título nuevo se escribe, y solo las columnas de la referencia', () => {
    const plan = planReferenceEdit(catalog, 'bib-1', open({ title: 'Álbum de la Sierra Norte' }))
    expect(plan.action).toBe('update')
    if (plan.action !== 'update') return
    expect(plan.payload.title).toBe('Álbum de la Sierra Norte')
    expect(plan.payload.bibtex_key).toBe('rotili1985')
  })

  it('abrir el panel y cerrarlo sin tocar nada NO escribe', () => {
    // The table carries auditing (`tg_row_audit` stamps `updated_at` and
    // `updated_by`): a false save leaves a record that somebody corrected
    // a reference nobody corrected, in a row the whole catalogue reads.
    expect(planReferenceEdit(catalog, 'bib-1', open()).action).toBe('unchanged')
  })

  it('los espacios de sobra tampoco cuentan como cambio', () => {
    expect(planReferenceEdit(catalog, 'bib-1', open({ title: '  Álbum de la Sierra  ' })).action).toBe(
      'unchanged',
    )
  })

  it('quitarle la clave BibTeX sí es un cambio, y viaja como null', () => {
    const plan = planReferenceEdit(catalog, 'bib-1', open({ bibtexKey: '' }))
    expect(plan.action).toBe('update')
    if (plan.action !== 'update') return
    expect(plan.payload.bibtex_key).toBeNull()
  })

  it('un título en blanco se para aquí con el mismo mensaje, sin llegar a la base', () => {
    const plan = planReferenceEdit(catalog, 'bib-1', open({ title: '' }))
    expect(plan.action).toBe('blank')
    if (plan.action !== 'blank') return
    expect(plan.message).toBe(referenceEditProblem(open({ title: '' })))
  })

  it('la clave de otra referencia se avisa con el título de esa, no con el nombre de un índice', () => {
    const plan = planReferenceEdit(catalog, 'bib-1', open({ bibtexKey: 'zafra1985' }))
    expect(plan.action).toBe('duplicate')
    if (plan.action !== 'duplicate') return
    expect(plan.message).toContain('«Zafra 1985»')
  })

  it('las claves no distinguen mayúsculas ni tildes, igual que el índice de la base', () => {
    // Measured: changing the key to «PRUEBAMEDIDA1990» with another reference on
    // «pruebamedida1990» answers 23505. The index is on `place_key`.
    const plan = planReferenceEdit(catalog, 'bib-1', open({ bibtexKey: 'ZAFRA1985' }))
    expect(plan.action).toBe('duplicate')
    if (plan.action !== 'duplicate') return
    expect(plan.message).toContain('mayúsculas')
  })

  it('la clave que ya tiene ella misma no es un duplicado de sí misma', () => {
    expect(planReferenceEdit(catalog, 'bib-2', open({ bibtexKey: 'zafra1985' })).action).not.toBe(
      'duplicate',
    )
  })

  it('RF-901 · una referencia retirada también ocupa su clave, y se dice que lo está', () => {
    const withRetired = [
      catalog[0]!,
      reference({ id: 'bib-3', title: 'Recorte de 1972', bibtex_key: 'recorte1972', active: false }),
    ]
    const plan = planReferenceEdit(withRetired, 'bib-1', open({ bibtexKey: 'recorte1972' }))
    expect(plan.action).toBe('duplicate')
    if (plan.action !== 'duplicate') return
    // Without this half, the warning seems to lie about a list that does not show it.
    expect(plan.message).toContain('retirada')
  })

  it('con el catálogo sin cargar se escribe igual, y la base tiene la última palabra', () => {
    // The panel opens with the reference embedded in the citation, so correcting
    // works even if the complete catalogue has not arrived. What is lost is
    // the duplicate prediction, which the base repeats.
    expect(planReferenceEdit([], 'bib-1', open({ title: 'Otro título' })).action).toBe('update')
  })
})

describe('RF-514 · el tipo de publicación que se ofrece, y el que no se puede perder', () => {
  const types = [
    { id: 'tipo-1', name: 'Catálogo de exposición', active: true },
    { id: 'tipo-2', name: 'Prensa', active: true },
    { id: 'tipo-3', name: 'Folleto', active: false },
  ]

  it('«Sin clasificar» va primero: un tipo nulo es una respuesta y no un hueco', () => {
    expect(referenceTypeOptions(types, null, null)[0]).toEqual({ value: '', text: 'Sin clasificar' })
  })

  it('un tipo retirado no se ofrece: elegirlo lo devolvería a la circulación (RF-901)', () => {
    const values = referenceTypeOptions(types, null, null).map((option) => option.value)
    expect(values).toEqual(['', 'tipo-1', 'tipo-2'])
  })

  it('pero el que la referencia YA tiene se queda, marcado como retirado', () => {
    // It is the hole that would lose a datum without saying anything: without its chip, the selector
    // shows nothing chosen on a reference that IS classified, and the
    // next natural gesture is «Sin clasificar».
    const options = referenceTypeOptions(types, 'tipo-3', null)
    expect(options.map((option) => option.value)).toContain('tipo-3')
    expect(options.find((option) => option.value === 'tipo-3')?.text).toBe('Folleto (retirado)')
  })

  it('si el vocabulario no ha llegado, el tipo se muestra desde la fila de la cita', () => {
    // The panel opens with the reference embedded in the citation, which brings its type:
    // with one bar of coverage and the vocabulary not loaded, the classification is
    // still visible instead of appearing as «sin clasificar».
    const options = referenceTypeOptions([], 'tipo-9', {
      id: 'tipo-9',
      name: 'Tesis doctoral',
      active: true,
    })
    expect(options).toEqual([
      { value: '', text: 'Sin clasificar' },
      { value: 'tipo-9', text: 'Tesis doctoral' },
    ])
  })

  it('el vocabulario manda sobre la fila incrustada cuando está: es el nombre corregido', () => {
    const options = referenceTypeOptions(
      [{ id: 'tipo-1', name: 'Catálogo de exposición', active: true }],
      'tipo-1',
      { id: 'tipo-1', name: 'Catalogo de exposicion', active: true },
    )
    expect(options).toHaveLength(2)
    expect(options[1]!.text).toBe('Catálogo de exposición')
  })

  it('un tipo incrustado que no es el elegido no se cuela en la lista', () => {
    const options = referenceTypeOptions(types, null, {
      id: 'tipo-9',
      name: 'Tesis doctoral',
      active: true,
    })
    expect(options.map((option) => option.value)).not.toContain('tipo-9')
  })

  it('un tipo sin nombre tampoco pinta un chip vacío (RF-304)', () => {
    const options = referenceTypeOptions([{ id: 'tipo-4', name: '  ', active: true }], null, null)
    expect(options[1]!.text).toBe('Tipo sin nombre')
  })
})

describe('lo que hay que decir ANTES de guardar: la fila es del catálogo', () => {
  it('siempre se dice que lo que se corrija se lee desde la ficha de cualquier obra que la cite', () => {
    for (const count of [null, 0, 1, 7]) {
      expect(referenceReachNotice(count)).toContain('catálogo compartido')
    }
  })

  it('con el número contado se dice el número, que es lo que cambia la decisión', () => {
    expect(referenceReachNotice(7)).toContain('otras 7 obras')
  })

  it('una sola obra más se dice en singular', () => {
    const notice = referenceReachNotice(1)
    expect(notice).toContain('otra obra')
    expect(notice).not.toContain('obras')
  })

  it('ninguna otra obra no es «esto es tuyo»: la referencia sigue siendo del catálogo', () => {
    expect(referenceReachNotice(0)).toContain('ninguna otra obra')
    expect(referenceReachNotice(0)).toContain('catálogo')
  })

  it('sin poder contar NO se dice que no la cita nadie más', () => {
    // This is the dangerous case: the storeroom with a coverage bar. An invented
    // zero tells her she is correcting something private.
    const notice = referenceReachNotice(null)
    expect(notice).toContain('No se ha podido contar')
    expect(notice).not.toContain('ninguna otra obra')
  })
})

describe('RF-901 · corregir una referencia retirada no la recupera', () => {
  it('una referencia en el catálogo no dice nada de la papelera', () => {
    expect(referenceRetiredNotice(reference({ active: true }))).toBeNull()
  })

  it('una retirada avisa de que sigue retirada y de dónde se recupera', () => {
    const notice = referenceRetiredNotice(reference({ active: false }))
    expect(notice).toContain('seguirá retirada')
    // Putting it back in circulation belongs to its own record (RF-309), not a
    // side effect of fixing a typo in it.
    expect(notice).toContain('su propia ficha')
  })
})

describe('cómo se nombra una referencia en pantalla (RF-304)', () => {
  it('por su título', () => {
    expect(referenceTitleText(reference({ title: 'Zafra 1985' }))).toBe('Zafra 1985')
  })

  it('y si llegara sin título, con una frase y no con un hueco', () => {
    expect(referenceTitleText(reference({ title: '   ' }))).toBe('Referencia sin título')
  })
})

describe('cuando la base dice no (mensajes medidos por la pasarela REST)', () => {
  it('23514 sobre el título en blanco nombra el título', () => {
    const text = referenceFailureText({
      code: '23514',
      message:
        'new row for relation "bibliography" violates check constraint "bibliography_title_not_blank"',
    })
    expect(text).toContain('título')
    expect(text).not.toContain('bibliography_title_not_blank')
  })

  it('el mismo 23514 sobre el año nombra el año y su ventana', () => {
    // Three different typos arrive with the same code: a single sentence for the
    // three would name the wrong field.
    const text = referenceFailureText({
      code: '23514',
      message:
        'new row for relation "bibliography" violates check constraint "bibliography_plausible_year"',
    })
    expect(text).toContain('1000')
    expect(text).toContain('2100')
    expect(text).not.toContain('título')
  })

  it('y sobre la forma de la clave habla de la clave', () => {
    const text = referenceFailureText({
      code: '23514',
      message:
        'new row for relation "bibliography" violates check constraint "bibliography_bibtex_key_shape"',
    })
    expect(text).toContain('clave BibTeX')
  })

  it('un 23514 sobre una restricción que no se conoce no se traga el mensaje de la base', () => {
    const text = referenceFailureText({
      code: '23514',
      message: 'violates check constraint "bibliography_de_pasado_mañana"',
    })
    expect(text).toContain('bibliography_de_pasado_mañana')
  })

  it('23505 es la clave BibTeX repetida, y puede ser de una retirada', () => {
    const text = referenceFailureText({
      code: '23505',
      message: 'duplicate key value violates unique constraint "bibliography_bibtex_key_unique"',
    })
    expect(text).toContain('clave BibTeX')
    expect(text).toContain('retirada')
    expect(text).not.toContain('bibliography_bibtex_key_unique')
  })

  it('23503 es el tipo de publicación que ya no está, y dice qué hacer', () => {
    const text = referenceFailureText({
      code: '23503',
      message:
        'insert or update on table "bibliography" violates foreign key constraint "bibliography_publication_type_id_fkey"',
      details: 'Key is not present in table "publication_types".',
    })
    expect(text).toContain('tipo de publicación')
    // The base's `details` comes in English: it is not shown.
    expect(text).not.toContain('Key is not present')
  })

  it('42501 es la sesión, y lo que hace falta es volver a entrar', () => {
    const text = referenceFailureText({
      code: '42501',
      message: 'permission denied for schema public',
    })
    expect(text).toContain('Catalogador')
    expect(text).toContain('Vuelve a entrar')
  })

  it('sin código no es una negativa, es que no contesta nadie, y se dice en español', () => {
    const text = referenceFailureText({ message: 'Failed to fetch' })
    expect(text).toContain('conexión')
    // And the half that matters: what was written has not been lost.
    expect(text).toContain('no se ha perdido')
    expect(text).not.toContain('Failed to fetch')
  })

  it('un fallo sin mensaje ninguno se trata igual', () => {
    expect(referenceFailureText({ message: '' })).toContain('conexión')
  })

  it('una negativa inesperada conserva lo que dijo la base, con su pista', () => {
    const text = referenceFailureText({
      code: 'P0001',
      message: 'No se puede corregir esta referencia',
      hint: 'Habla con quien la está revisando.',
    })
    expect(text).toContain('No se puede corregir esta referencia')
    expect(text).toContain('Habla con quien la está revisando.')
  })
})

describe('un guardado que no ha tocado nada no se cuenta como guardado', () => {
  it('sin fallo y con filas cambiadas, no hay nada que decir', () => {
    expect(referenceWriteResult({ failure: null, rows: 1 })).toBeNull()
  })

  it('cero filas es la sesión de un Lector o una referencia que ya no está', () => {
    // Measured: a Reader who does a `patch` on a reference receives 204 and zero
    // rows, NOT a 42501. Believing the «no error» would close the panel saying that
    // the catalogue was corrected when it was not.
    const text = referenceWriteResult({ failure: null, rows: 0 })
    expect(text).not.toBeNull()
    expect(text).toContain('no se ha tocado')
  })

  it('sin contar filas no se inventa un cero', () => {
    expect(referenceWriteResult({})).toBeNull()
  })

  it('un fallo manda sobre el conteo', () => {
    expect(referenceWriteResult({ failure: { code: '23505', message: 'duplicate key' }, rows: 0 })).toContain(
      'clave BibTeX',
    )
  })
})
