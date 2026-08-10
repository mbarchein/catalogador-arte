import { describe, expect, it } from 'vitest'
import {
  addBlockedReason,
  draftDatePreview,
  draftFromRow,
  draftIsSaveable,
  draftPayload,
  draftProblems,
  emptyProvenanceDraft,
  insertPayload,
  movedChainIds,
  problemsOf,
  reorderHint,
  retireConfirmText,
  stepTarget,
  type ProvenanceDraft,
} from './provenanceDraft'
import type { ProvenanceEventRow } from '../documentaryRows'

/**
 * RF-509 desde el lado de quien escribe la cadena.
 *
 * Cada negativa de aquí es el espejo de una restricción de
 * `provenance_events`. La base sigue siendo la autoridad —su mensaje se enseña
 * tal cual cuando habla—, pero un formulario que solo se entera al guardar
 * obliga a rellenar el eslabón dos veces, y en un almacén con el móvil eso es
 * lo que hace que un eslabón no se registre.
 */

function draft(over: Partial<ProvenanceDraft> = {}): ProvenanceDraft {
  return { ...emptyProvenanceDraft(), partyNote: 'Colección privada, España', ...over }
}

describe('un eslabón nuevo', () => {
  it('nace con las dos preguntas sin revisar, no con una respuesta inventada (RF-205)', () => {
    const fresh = emptyProvenanceDraft()
    expect(fresh.capacity).toBe('UNREVIEWED')
    expect(fresh.acquisition).toBe('UNREVIEWED')
    expect(fresh.id).toBeNull()
  })

  it('vacío no se puede guardar: un eslabón tiene que decir de quién habla', () => {
    const problems = draftProblems(emptyProvenanceDraft())
    expect(problems).toHaveLength(1)
    expect(problems[0]?.field).toBe('party')
    expect(problems[0]?.text).toContain('Colección particular, España')
    expect(draftIsSaveable(emptyProvenanceDraft())).toBe(false)
  })

  it('con ficha, o con nota libre, ya dice de quién habla', () => {
    expect(draftIsSaveable(draft({ partyId: 'party-1', partyNote: '' }))).toBe(true)
    expect(draftIsSaveable(draft({ partyNote: 'Colección privada, España' }))).toBe(true)
    // Una nota de solo espacios no nombra a nadie, igual que en la base.
    expect(draftIsSaveable(draft({ partyNote: '   ' }))).toBe(false)
  })
})

describe('las fechas del eslabón (ADR-004)', () => {
  /**
   * La diferencia de un carácter con `artworks`: allí el rango exige
   * `end_year > start_year` y aquí `>=`, porque una obra comprada y vendida en
   * 1985 es una tenencia real. Copiar la regla de la obra rechazaría un eslabón
   * legítimo.
   */
  it('un tramo que empieza y acaba el mismo año es válido, al revés que en la obra', () => {
    expect(draftIsSaveable(draft({ startYear: 1985, endYear: 1985 }))).toBe(true)
    expect(draftDatePreview(draft({ startYear: 1985, endYear: 1985 }))).toBe('1985-1985')
  })

  it('un año final anterior al inicial se rechaza, diciendo los dos', () => {
    const problems = problemsOf(draftProblems(draft({ startYear: 1990, endYear: 1985 })), 'years')
    expect(problems).toHaveLength(1)
    expect(problems[0]?.text).toContain('1985')
    expect(problems[0]?.text).toContain('1990')
  })

  it('un año final sin inicial no es un tramo', () => {
    expect(problemsOf(draftProblems(draft({ endYear: 1985 })), 'years')).toHaveLength(1)
  })

  it('un año fuera de lo plausible es una errata, y se dice así', () => {
    const problems = problemsOf(draftProblems(draft({ startYear: 985 })), 'years')
    expect(problems[0]?.text).toContain('errata')
    expect(draftIsSaveable(draft({ startYear: 2101 }))).toBe(false)
    expect(draftIsSaveable(draft({ startYear: 2100 }))).toBe(true)
  })

  it('«aproximada» y «sin confirmar» sin año no dicen nada, y se impide', () => {
    const problems = problemsOf(draftProblems(draft({ approximate: true })), 'flags')
    expect(problems).toHaveLength(1)
    expect(problems[0]?.text).toContain('sin año')
    expect(draftIsSaveable(draft({ unconfirmed: true }))).toBe(false)
    expect(draftIsSaveable(draft({ startYear: 1985, unconfirmed: true }))).toBe(true)
  })

  it('la vista previa es la que compondrá la base, banderas incluidas', () => {
    expect(draftDatePreview(draft({ startYear: 1975, endYear: 1978, approximate: true }))).toBe(
      'c. 1975-1978',
    )
    expect(draftDatePreview(draft({ startYear: 1975, unconfirmed: true }))).toBe('1975 [?]')
    expect(draftDatePreview(draft())).toBe('')
  })

  it('la nota de fecha manda sobre la estructura, como en la columna generada', () => {
    expect(
      draftDatePreview(draft({ startYear: 1975, dateNote: 'finales de los setenta' })),
    ).toBe('finales de los setenta')
  })
})

describe('lo que viaja a la base', () => {
  it('no manda la columna generada ni la posición ni el identificador', () => {
    const payload = draftPayload(draft({ id: 'event-1', startYear: 1985 }))
    expect(payload).not.toHaveProperty('date_text')
    expect(payload).not.toHaveProperty('position')
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('catalog_id')
  })

  it('el insert añade la obra de la que cuelga la cadena', () => {
    expect(insertPayload(draft(), 'AR-0042').catalog_id).toBe('AR-0042')
  })

  it('recorta los textos, como hace la base al comprobar la nota', () => {
    const payload = draftPayload(draft({ partyNote: '  Colección privada  ', note: '  fuente  ' }))
    expect(payload.party_note).toBe('Colección privada')
    expect(payload.note).toBe('fuente')
  })

  /**
   * Quitar el año de un eslabón que estaba marcado «c.» no puede mandar una
   * combinación que la base rechaza: las banderas se normalizan contra el año.
   */
  it('sin año, las banderas y el año final se apagan solos', () => {
    const payload = draftPayload(draft({ approximate: true, unconfirmed: true, endYear: 1990 }))
    expect(payload.approximate_date).toBe(false)
    expect(payload.unconfirmed_date).toBe(false)
    expect(payload.end_year).toBeNull()
  })

  it('con año, las banderas viajan como están', () => {
    const payload = draftPayload(draft({ startYear: 1985, endYear: 1990, approximate: true }))
    expect(payload.approximate_date).toBe(true)
    expect(payload.start_year).toBe(1985)
    expect(payload.end_year).toBe(1990)
  })

  it('las dos enumeraciones viajan siempre, también en «sin revisar» (RF-205)', () => {
    const payload = draftPayload(draft())
    expect(payload.capacity).toBe('UNREVIEWED')
    expect(payload.acquisition).toBe('UNREVIEWED')
  })
})

describe('abrir un eslabón existente', () => {
  const row: ProvenanceEventRow = {
    id: 'event-9',
    catalog_id: 'AR-0042',
    position: 3,
    party_id: 'party-1',
    party_note: 'Propiedad de la tía',
    capacity: 'DEPOSIT',
    acquisition: 'GIFT',
    start_year: 1985,
    end_year: 1990,
    approximate_date: true,
    unconfirmed_date: false,
    date_note: '',
    date_text: 'c. 1985-1990',
    note: 'según el catálogo de 1985',
    active: true,
    party: null,
  }

  it('trae todos los campos editables y ninguno de los que no lo son', () => {
    const opened = draftFromRow(row)
    expect(opened).toEqual({
      id: 'event-9',
      partyId: 'party-1',
      partyNote: 'Propiedad de la tía',
      capacity: 'DEPOSIT',
      acquisition: 'GIFT',
      startYear: 1985,
      endYear: 1990,
      approximate: true,
      unconfirmed: false,
      dateNote: '',
      note: 'según el catálogo de 1985',
    })
  })

  it('lo que se abre y se guarda sin tocar sale igual que entró', () => {
    const payload = draftPayload(draftFromRow(row))
    expect(payload.party_id).toBe(row.party_id)
    expect(payload.capacity).toBe(row.capacity)
    expect(payload.start_year).toBe(row.start_year)
    expect(payload.end_year).toBe(row.end_year)
    expect(payload.approximate_date).toBe(true)
  })
})

describe('reordenar la cadena (RF-509)', () => {
  const rows = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
  ] as ProvenanceEventRow[]

  it('manda la lista ENTERA de la obra, que es lo que la base exige', () => {
    expect(movedChainIds(rows, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(movedChainIds(rows, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(movedChainIds(rows, 1, 1)).toEqual(['a', 'b', 'c'])
  })

  /**
   * En los extremos el botón se desactiva en vez de no hacer nada: un control
   * que se pulsa y no pasa nada se lee como que reordenar está roto.
   */
  it('en los extremos no hay destino, y se dice con un nulo', () => {
    expect(stepTarget(rows, 0, -1)).toBeNull()
    expect(stepTarget(rows, 2, 1)).toBeNull()
    expect(stepTarget(rows, 0, 1)).toBe(1)
    expect(stepTarget(rows, 2, -1)).toBe(1)
    expect(stepTarget(rows, -1, 1)).toBeNull()
  })

  /**
   * El orden manual es la decisión más rara de este bloque: todas las demás
   * listas de la aplicación se ordenan solas. Sin explicarlo, las flechas se
   * leen como una lista que no supo ordenarse.
   */
  it('explica por qué el orden es manual, y no lo explica cuando no hay orden', () => {
    expect(reorderHint(2)).toContain('lo pones tú')
    expect(reorderHint(5)).toContain('no llevan año')
    expect(reorderHint(1)).toBeNull()
    expect(reorderHint(0)).toBeNull()
  })
})

describe('añadir un eslabón donde la base no lo va a aceptar (RF-218)', () => {
  it('con la procedencia investigada sin resultados, dice qué cambiar antes', () => {
    const reason = addBlockedReason('NONE_FOUND')
    expect(reason).toContain('Investigado, sin resultados')
    expect(reason).toContain('ponla en «Investigación en curso»')
  })

  it('en cualquier otro estado no hay nada que impedir', () => {
    expect(addBlockedReason('UNREVIEWED')).toBeNull()
    expect(addBlockedReason('IN_PROGRESS')).toBeNull()
    expect(addBlockedReason('COMPLETE')).toBeNull()
    // Nulo es «no se ha podido leer el estado», y eso no se convierte en una
    // prohibición: la base es la que manda y ya contestará.
    expect(addBlockedReason(null)).toBeNull()
  })
})

describe('retirar un eslabón (RF-517, RF-901)', () => {
  function row(over: Partial<ProvenanceEventRow> = {}): ProvenanceEventRow {
    return {
      id: 'event-1',
      catalog_id: 'AR-0042',
      position: 2,
      party_id: null,
      party_note: 'Colección particular, España',
      capacity: 'OWNER',
      acquisition: 'PURCHASE',
      start_year: 1985,
      end_year: 1990,
      approximate_date: false,
      unconfirmed_date: false,
      date_note: '',
      date_text: '1985-1990',
      note: '',
      active: true,
      party: null,
      ...over,
    }
  }

  it('nombra el eslabón y sus años, para no retirar el de al lado', () => {
    const text = retireConfirmText(row())
    expect(text).toContain('Colección particular, España')
    expect(text).toContain('1985-1990')
  })

  it('avisa de que la cadena se recompone y puede abrirse un hueco', () => {
    // Es la consecuencia que nadie espera: se está mirando una cadena continua
    // mientras se pulsa.
    expect(retireConfirmText(row())).toContain('hueco')
  })

  it('dice que no se borra, para que nadie deje un eslabón falso por miedo', () => {
    const text = retireConfirmText(row())
    expect(text).toContain('papelera')
    expect(text).toContain('volver a añadir')
  })

  it('un eslabón sin fechar no arrastra un paréntesis vacío (RF-304)', () => {
    const text = retireConfirmText(row({ start_year: null, end_year: null, date_text: '' }))
    expect(text).not.toContain('()')
    expect(text).toContain('Colección particular, España')
  })

  it('con ficha, se retira por el nombre de la ficha', () => {
    const text = retireConfirmText(
      row({
        party_id: 'party-1',
        party_note: '',
        party: {
          id: 'party-1',
          party_type: 'INSTITUTION',
          name: 'Galería Multitud',
          locality: 'Madrid',
          country: 'España',
          active: true,
        },
      }),
    )
    expect(text).toContain('Galería Multitud')
  })
})
