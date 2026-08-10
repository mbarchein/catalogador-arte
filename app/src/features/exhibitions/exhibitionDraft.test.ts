import { describe, expect, it } from 'vitest'
import type { Exhibition } from '../../lib/types'
import {
  emptyExhibitionDraft,
  exhibitionDraft,
  exhibitionDraftProblem,
  exhibitionPayload,
  isIsoDate,
  MAX_EXHIBITION_YEAR,
  MIN_EXHIBITION_YEAR,
  planExhibitionCreate,
  planExhibitionSave,
  type ExhibitionDraft,
} from './exhibitionDraft'

/**
 * Dar de alta y corregir una exposición (RF-501, RF-502, RF-503, RF-512).
 *
 * Lo que se verifica aquí es la REGLA y la frase, no el componente: la batería
 * corre en node y no puede abrir un JSX, así que todo lo que decide —qué impide
 * guardar, qué viaja a la base, qué significa «no ha cambiado nada»— está en
 * funciones puras y se comprueba palabra por palabra.
 *
 * Cada regla de aquí tiene su gemela en el esquema, y los mensajes de la base se
 * midieron contra ella (ver `exhibitionMessages.ts`). Lo que estas pruebas fijan es
 * que la catalogadora se entera ANTES de pulsar.
 */

function draft(over: Partial<ExhibitionDraft> = {}): ExhibitionDraft {
  return { ...emptyExhibitionDraft(), title: 'Rotili. Obra reciente', year: '1985', ...over }
}

function row(over: Partial<Exhibition> = {}): Exhibition {
  return {
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
    catalogue_reference_id: null,
    note: '',
    active: true,
    ...over,
  }
}

describe('el borrador en blanco (RF-218)', () => {
  /**
   * Ni «Individual» ni «Sin catálogo» por omisión: un recorte de prensa da el
   * título de una muestra mucho antes de decir si el artista expuso solo, y que no
   * conste catálogo no es que no lo hubiera. Arrancar en cualquiera de esas dos
   * publicaría una respuesta que nadie ha dado.
   */
  it('RF-218: arranca sin revisar el carácter y sin revisar el catálogo', () => {
    const blank = emptyExhibitionDraft()
    expect(blank.exhibitionType).toBe('UNREVIEWED')
    expect(blank.cataloguePublished).toBe('UNREVIEWED')
  })

  it('no da por hecho que haya ficha del catálogo en la bibliografía', () => {
    expect(emptyExhibitionDraft().hasCatalogueRecord).toBe(false)
  })
})

describe('el borrador de una ficha que ya existe', () => {
  it('trae los ocho campos que esta pantalla escribe', () => {
    const d = exhibitionDraft(row({ venue_note: 'en la sala baja', note: 'Comisariada por…' }))
    expect(d.title).toBe('Rotili. Obra reciente')
    expect(d.exhibitionType).toBe('INDIVIDUAL')
    expect(d.venueId).toBe('v-1')
    expect(d.venueNote).toBe('en la sala baja')
    expect(d.startDate).toBe('1985-03-12')
    expect(d.endDate).toBe('1985-05-04')
    expect(d.cataloguePublished).toBe('YES')
    expect(d.note).toBe('Comisariada por…')
  })

  /**
   * Con fecha de apertura, el año es la derivación de la base
   * (`tg_exhibition_year_from_dates`) y no un dato que se escriba: ofrecerlo
   * sería ofrecer una contradicción que `exhibitions_year_matches_start_date`
   * rechaza.
   */
  it('el año no se ofrece cuando hay fecha de apertura, y sí cuando es lo único que hay', () => {
    expect(exhibitionDraft(row()).year).toBe('')
    expect(exhibitionDraft(row({ start_date: null, end_date: null, year: 1985 })).year).toBe('1985')
  })

  it('una sede sin identificar llega como cadena vacía y no como nulo', () => {
    expect(exhibitionDraft(row({ venue_id: null })).venueId).toBe('')
  })

  it('sabe si el catálogo de la muestra ya tiene ficha bibliográfica', () => {
    expect(exhibitionDraft(row({ catalogue_reference_id: 'bib-1' })).hasCatalogueRecord).toBe(true)
    expect(exhibitionDraft(row()).hasCatalogueRecord).toBe(false)
  })
})

describe('lo que impide guardar (RF-502)', () => {
  it('sin título no hay exposición que citar', () => {
    expect(exhibitionDraftProblem(draft({ title: '   ' }))).toContain('Escribe el título')
  })

  /** `exhibitions_dated`: an undated show cannot be placed in a chronological history. */
  it('RF-502: sin año y sin fecha de apertura, lo dice y explica por qué', () => {
    const message = exhibitionDraftProblem(draft({ year: '' }))
    expect(message).toContain('Pon al menos el año')
    expect(message).toContain('se ordena por fecha')
  })

  /**
   * `exhibitions_coherent_dates`, la mitad que un `end_date >= start_date` a secas
   * habría dejado pasar: una comparación con nulo no es falsa.
   */
  it('una fecha de cierre sin apertura es media fecha, y se dice qué hacer', () => {
    const message = exhibitionDraftProblem(draft({ endDate: '1985-05-04' }))
    expect(message).toContain('media fecha')
    expect(message).toContain('nota de las fechas')
  })

  it('la exposición no puede cerrar antes de abrir', () => {
    const message = exhibitionDraftProblem(
      draft({ year: '', startDate: '1985-05-04', endDate: '1985-03-12' }),
    )
    expect(message).toBe('La exposición cerraría antes de abrir. Revisa las dos fechas.')
  })

  it('abrir y cerrar el mismo día es legítimo: una muestra de un día', () => {
    expect(
      exhibitionDraftProblem(draft({ year: '', startDate: '1985-03-12', endDate: '1985-03-12' })),
    ).toBeNull()
  })

  /** `exhibitions_plausible_year`: a year out of range is a typo, not a date. */
  it('el año tiene que ser plausible, y el mensaje dice el rango', () => {
    const low = exhibitionDraftProblem(draft({ year: String(MIN_EXHIBITION_YEAR - 1) }))
    expect(low).toContain(String(MIN_EXHIBITION_YEAR))
    expect(low).toContain(String(MAX_EXHIBITION_YEAR))
    expect(exhibitionDraftProblem(draft({ year: String(MAX_EXHIBITION_YEAR + 1) }))).not.toBeNull()
    expect(exhibitionDraftProblem(draft({ year: String(MIN_EXHIBITION_YEAR) }))).toBeNull()
  })

  it('un año que no es un año se dice como se escribe', () => {
    expect(exhibitionDraftProblem(draft({ year: '19 ochenta' }))).toBe('El año son cuatro cifras: 1985.')
  })

  it('una fecha que no es una fecha se señala por su nombre', () => {
    expect(exhibitionDraftProblem(draft({ startDate: '1985-13-40' }))).toContain('apertura')
    expect(exhibitionDraftProblem(draft({ startDate: '1985-03-12', endDate: '1985-02-30' }))).toContain(
      'cierre',
    )
  })

  /**
   * `exhibitions_catalogue_reference_needs_catalogue`. Al revés SÍ se permite, y es
   * el estado normal mientras se investiga: un catálogo puede constar publicado y no
   * estar todavía dado de alta en la bibliografía.
   */
  it('RF-503: con ficha del catálogo en la bibliografía, no se puede decir que no lo hubo', () => {
    const withRecord = draft({ hasCatalogueRecord: true, cataloguePublished: 'NO' })
    expect(exhibitionDraftProblem(withRecord)).toContain('ya está dado de alta en la bibliografía')
    expect(exhibitionDraftProblem({ ...withRecord, cataloguePublished: 'UNREVIEWED' })).not.toBeNull()
    expect(exhibitionDraftProblem({ ...withRecord, cataloguePublished: 'YES' })).toBeNull()
  })

  it('constar «con catálogo» sin ficha bibliográfica es correcto y no estorba', () => {
    expect(exhibitionDraftProblem(draft({ cataloguePublished: 'YES' }))).toBeNull()
  })

  it('el título va primero: con dos problemas a la vez manda el que impide citarla', () => {
    expect(exhibitionDraftProblem(draft({ title: '', year: '' }))).toContain('Escribe el título')
  })

  it('lo mínimo —título y año— basta', () => {
    expect(exhibitionDraftProblem(draft())).toBeNull()
  })
})

describe('las fechas ISO se comprueban a mano, sin zona horaria', () => {
  it('acepta un día que existe', () => {
    expect(isIsoDate('1985-03-12')).toBe(true)
    expect(isIsoDate('2024-02-29')).toBe(true)
  })

  /** A 30 February is a typo, and `new Date` would turn it into 1 March. */
  it('rechaza un día que no existe en su mes', () => {
    expect(isIsoDate('1985-02-30')).toBe(false)
    expect(isIsoDate('2023-02-29')).toBe(false)
    expect(isIsoDate('1985-13-01')).toBe(false)
    expect(isIsoDate('1985-00-10')).toBe(false)
  })

  it('rechaza lo que no tiene la forma', () => {
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate('12/03/1985')).toBe(false)
    expect(isIsoDate('1985-3-12')).toBe(false)
  })
})

describe('lo que viaja a la base', () => {
  it('recorta los textos: «Rotili » y «Rotili» no son dos exposiciones', () => {
    const payload = exhibitionPayload(
      draft({ title: '  Rotili  ', venueNote: '  una galería  ', note: '  nota  ', dateNote: ' x ' }),
    )
    expect(payload.title).toBe('Rotili')
    expect(payload.venue_note).toBe('una galería')
    expect(payload.note).toBe('nota')
    expect(payload.date_note).toBe('x')
  })

  it('una sede sin elegir viaja como nulo: la columna es clave ajena y «» no es un uuid', () => {
    expect(exhibitionPayload(draft({ venueId: '' })).venue_id).toBeNull()
    expect(exhibitionPayload(draft({ venueId: ' v-1 ' })).venue_id).toBe('v-1')
  })

  /**
   * La razón entera está en la cabecera del módulo: el trigger deriva el año de la
   * fecha y nunca al revés, así que mandar los dos es pedir que la base rechace
   * `exhibitions_year_matches_start_date` antes o después. Mandando solo uno, ese
   * check no se puede alcanzar desde esta pantalla.
   */
  it('nunca manda el año al lado de una fecha de apertura', () => {
    const payload = exhibitionPayload(draft({ year: '1986', startDate: '1985-03-12' }))
    expect(payload.year).toBeNull()
    expect(payload.start_date).toBe('1985-03-12')
  })

  it('con solo el año, el año va y las fechas no', () => {
    const payload = exhibitionPayload(draft({ year: '1985' }))
    expect(payload).toMatchObject({ year: 1985, start_date: null, end_date: null })
  })

  it('las fechas vacías viajan como nulas y no como cadena vacía', () => {
    expect(exhibitionPayload(draft({ startDate: '', endDate: '' }))).toMatchObject({
      start_date: null,
      end_date: null,
    })
  })

  /**
   * `catalogue_reference_id` NO está en la carga, y su ausencia es intencionada:
   * esta pantalla no puede elegir la ficha bibliográfica del catálogo, y un guardado
   * que la vaciara tiraría un enlace hecho en otro sitio. «Lo que no se manda no se
   * borra».
   */
  it('no toca la ficha bibliográfica del catálogo', () => {
    expect('catalogue_reference_id' in exhibitionPayload(draft())).toBe(false)
  })
})

describe('crear una exposición (RF-909)', () => {
  it('con un problema no llega a la base', () => {
    const plan = planExhibitionCreate(draft({ title: '' }))
    expect(plan.action).toBe('blank')
  })

  /**
   * Sin comprobación de duplicados, y no es un olvido: `exhibitions` no tiene
   * índice único sobre el título, a propósito y escrito en la migración —dos
   * itinerantes de años distintos se llaman igual—. Una pantalla que rechazara la
   * segunda rechazaría una muestra real; lo que hace es avisar (ver
   * `exhibitionIndex.similarTitleNotice`).
   */
  it('un título repetido no impide crearla: es un dato legítimo', () => {
    const plan = planExhibitionCreate(draft({ title: 'Alberto Rotili. Antológica' }))
    expect(plan.action).toBe('insert')
  })
})

describe('corregir una exposición (RF-804)', () => {
  it('con un problema no llega a la base', () => {
    expect(planExhibitionSave(row(), exhibitionDraft(row({ title: '' }))).action).toBe('blank')
  })

  /**
   * `tg_row_audit` sella quién y cuándo en cada `update`. Abrir la ficha, leerla y
   * pulsar «Guardar» sellaría un cambio que no cambió nada, y el historial de
   * cambios enseñaría una edición que no ocurrió.
   */
  it('RF-1501: abrir y guardar sin tocar nada no escribe', () => {
    const current = row()
    expect(planExhibitionSave(current, exhibitionDraft(current)).action).toBe('unchanged')
  })

  /**
   * El caso que la comparación ingenua habría dado por cambiado: la base derivó el
   * año 1985 de la fecha de apertura, el borrador no lo lleva porque con fecha no se
   * ofrece, y comparar los borradores en crudo diría que 1985 se ha borrado.
   */
  it('el año que derivó la base no cuenta como un cambio', () => {
    const current = row({ year: 1985, start_date: '1985-03-12' })
    const d = exhibitionDraft(current)
    expect(d.year).toBe('')
    expect(planExhibitionSave(current, d).action).toBe('unchanged')
  })

  it('cualquier campo distinto sí escribe, y va entero', () => {
    const current = row()
    const plan = planExhibitionSave(current, {
      ...exhibitionDraft(current),
      note: 'Comisariada por Fulano',
    })
    expect(plan.action).toBe('update')
    if (plan.action !== 'update') throw new Error('esperaba update')
    expect(plan.payload.note).toBe('Comisariada por Fulano')
    expect(plan.payload.title).toBe('Rotili. Obra reciente')
  })

  /** Going from exact dates to just the year is a legitimate and frequent correction. */
  it('cambiar unas fechas exactas por un año suelto se guarda', () => {
    const current = row()
    const plan = planExhibitionSave(current, {
      ...exhibitionDraft(current),
      startDate: '',
      endDate: '',
      year: '1985',
    })
    expect(plan.action).toBe('update')
    if (plan.action !== 'update') throw new Error('esperaba update')
    expect(plan.payload).toMatchObject({ year: 1985, start_date: null, end_date: null })
  })

  it('quitarle la sede a una exposición la deja sin identificar, no la rompe', () => {
    const current = row()
    const plan = planExhibitionSave(current, { ...exhibitionDraft(current), venueId: '' })
    expect(plan.action).toBe('update')
    if (plan.action !== 'update') throw new Error('esperaba update')
    expect(plan.payload.venue_id).toBeNull()
  })
})
