import { describe, expect, it } from 'vitest'
import {
  authorName,
  changeDetail,
  changeSentence,
  fieldLabel,
  groupChanges,
  joinFields,
  type ChangeLogRow,
} from './changeEntry'

/**
 * RF-1502, RF-1503: a record's history is read.
 *
 * The log stores one row per changed field, which is what makes
 * «who touched the measurements» answerable and what makes the history illegible if it is painted as
 * is. What is tested here is the step from technical rows to sentences.
 */

let siguiente = 1
function fila(over: Partial<ChangeLogRow> = {}): ChangeLogRow {
  return {
    id: siguiente++,
    change_id: 'c1',
    entity: 'ARTWORK',
    row_key: 'AR-0001',
    operation: 'UPDATE',
    column_name: 'height_cm',
    old_value: '100',
    new_value: '120',
    changed_at: '2026-08-04T10:00:00+00:00',
    changed_by: 'u1',
    author: { name: 'Marta', email: 'marta@local.test' },
    ...over,
  }
}

describe('el nombre de un campo en español (RF-1503)', () => {
  it('traduce lo que la usuaria llama a la cosa, no el nombre de la columna', () => {
    expect(fieldLabel('height_cm')).toBe('el alto')
    expect(fieldLabel('attributed_title')).toBe('si el título es del artista')
    expect(fieldLabel('color_temperature')).toBe('la temperatura del color')
  })

  it('los cuatro campos de la fecha de ejecución son la misma cosa', () => {
    // Changing the start year and the end one is changing the date, once.
    for (const c of ['start_year', 'end_year', 'approximate_date', 'unconfirmed_date']) {
      expect(fieldLabel(c)).toBe('la fecha de ejecución')
    }
  })

  it('un campo desconocido se nombra, no se calla', () => {
    // It is jargon on purpose: a change that is not listed is a change the
    // history denies, and that is worse than an ugly word on screen.
    expect(fieldLabel('columna_del_futuro')).toBe('un dato (columna_del_futuro)')
  })

  it('nunca devuelve una cadena vacía', () => {
    for (const c of [null, undefined, '', '   ']) {
      expect(fieldLabel(c).length).toBeGreaterThan(0)
    }
  })
})

describe('quién lo hizo (RF-1502)', () => {
  it('el nombre del perfil', () => {
    expect(authorName(fila())).toBe('Marta')
  })

  it('el correo cuando no hay nombre', () => {
    expect(authorName(fila({ author: { name: null, email: 'ana@local.test' } }))).toBe('ana@local.test')
  })

  it('sin autor es «El sistema», y no «alguien»', () => {
    // A migration or a trigger writes it. Saying «somebody» would suggest the datum
    // has been lost, and it has not been lost: there never was one.
    expect(authorName(fila({ author: null, changed_by: null }))).toBe('El sistema')
    expect(authorName(fila({ author: { name: '  ', email: '  ' } }))).toBe('El sistema')
  })
})

describe('un guardado es una línea y no cuatro (RF-1503)', () => {
  it('agrupa por change_id y enumera los campos', () => {
    const rows = [
      fila({ change_id: 'a', column_name: 'height_cm' }),
      fila({ change_id: 'a', column_name: 'width_cm' }),
      fila({ change_id: 'a', column_name: 'technique' }),
    ]
    const [entry] = groupChanges(rows)
    expect(entry!.fields).toEqual(['el alto', 'el ancho', 'la técnica'])
    expect(changeSentence(entry!)).toBe('Marta cambió el alto, el ancho y la técnica')
  })

  it('no repite un campo que sale de varias columnas', () => {
    const rows = [
      fila({ change_id: 'a', column_name: 'start_year' }),
      fila({ change_id: 'a', column_name: 'end_year' }),
    ]
    const [entry] = groupChanges(rows)
    expect(entry!.fields).toEqual(['la fecha de ejecución'])
    expect(changeSentence(entry!)).toBe('Marta cambió la fecha de ejecución')
  })

  it('conserva el orden en que llegan los guardados', () => {
    const rows = [
      fila({ change_id: 'nuevo', column_name: 'title' }),
      fila({ change_id: 'viejo', column_name: 'technique' }),
    ]
    expect(groupChanges(rows).map((e) => e.changeId)).toEqual(['nuevo', 'viejo'])
  })

  it('un registro vacío no da ninguna línea', () => {
    expect(groupChanges([])).toEqual([])
  })
})

describe('las cuatro operaciones se cuentan distinto (RF-1502)', () => {
  // The `!` is honest here: groupChanges of one row returns exactly one
  // entry, and the alternative would be an assertion per case proving nothing new.
  const de = (over: Partial<ChangeLogRow>) => groupChanges([fila(over)])[0]!

  it('el alta de una ficha y el de una fotografía', () => {
    expect(changeSentence(de({ operation: 'CREATE', column_name: null }))).toBe('Marta creó la ficha')
    expect(
      changeSentence(de({ operation: 'CREATE', column_name: null, entity: 'IMAGE' })),
    ).toBe('Marta añadió una fotografía')
  })

  it('la baja no se llama borrado, porque no se borra nada', () => {
    expect(changeSentence(de({ operation: 'DEACTIVATE', column_name: null }))).toBe(
      'Marta dio de baja la ficha',
    )
    expect(
      changeSentence(de({ operation: 'DEACTIVATE', column_name: null, entity: 'IMAGE' })),
    ).toBe('Marta retiró una fotografía')
  })

  it('la recuperación', () => {
    expect(changeSentence(de({ operation: 'RESTORE', column_name: null }))).toBe(
      'Marta recuperó la ficha',
    )
  })

  it('un cambio en una fotografía dice que es de una fotografía', () => {
    // A record's history mixes the artwork and its photos: «the rotation changed» without
    // saying of what is of no use.
    expect(changeSentence(de({ entity: 'IMAGE', column_name: 'rotation' }))).toBe(
      'Marta cambió el giro de una fotografía',
    )
  })

  it('un cambio sin campos anotados dice que hubo un cambio, no una frase a medias', () => {
    const entry = de({ operation: 'UPDATE', column_name: null })
    expect(changeSentence(entry!)).toBe('Marta cambió la ficha')
    expect(changeSentence({ ...entry, entity: 'IMAGE' })).toBe('Marta cambió una fotografía')
  })
})

describe('la enumeración en español', () => {
  it('uno, dos y tres', () => {
    expect(joinFields(['el alto'])).toBe('el alto')
    expect(joinFields(['el alto', 'el ancho'])).toBe('el alto y el ancho')
    expect(joinFields(['el alto', 'el ancho', 'la técnica'])).toBe('el alto, el ancho y la técnica')
  })

  it('ninguno', () => {
    expect(joinFields([])).toBe('')
  })
})

describe('el antes y el después (RF-1503)', () => {
  it('se enseña cuando el guardado tocó un solo campo', () => {
    const rows = [fila({ change_id: 'a', old_value: '100', new_value: '120' })]
    const [entry] = groupChanges(rows)
    expect(changeDetail(rows, entry!)).toEqual({ before: '100', after: '120' })
  })

  it('no se enseña con varios campos: sería una tabla y no una frase', () => {
    const rows = [
      fila({ change_id: 'a', column_name: 'height_cm' }),
      fila({ change_id: 'a', column_name: 'width_cm' }),
    ]
    expect(changeDetail(rows, groupChanges(rows)[0]!)).toBeNull()
  })

  it('no se enseña en un alta, porque no hay antes', () => {
    const rows = [fila({ operation: 'CREATE', column_name: null })]
    expect(changeDetail(rows, groupChanges(rows)[0]!)).toBeNull()
  })

  it('un valor que no estaba se dice «sin dato», no se deja en blanco', () => {
    const rows = [fila({ old_value: null, new_value: '120' })]
    expect(changeDetail(rows, groupChanges(rows)[0]!)).toEqual({ before: 'sin dato', after: '120' })
    const vacio = [fila({ change_id: 'b', old_value: '   ', new_value: '120' })]
    expect(changeDetail(vacio, groupChanges(vacio)[0]!)?.before).toBe('sin dato')
  })

  it('un valor largo se recorta: la nota de proceso no puede comerse el historial', () => {
    const largo = 'a'.repeat(400)
    const rows = [fila({ column_name: 'inventory_process_notes', old_value: largo, new_value: 'x' })]
    const detail = changeDetail(rows, groupChanges(rows)[0]!, 20)
    expect(detail?.before).toBe(`${'a'.repeat(20)}…`)
    expect(detail?.before.length).toBeLessThan(largo.length)
  })
})
