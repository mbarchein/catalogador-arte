import { describe, expect, it } from 'vitest'
import { anyWritten, draftDirty } from './formDirty'

/**
 * La condición que enciende la pregunta de «tienes datos a medio meter».
 *
 * Los dos errores posibles se pagan en direcciones opuestas: quedarse corto pierde datos
 * —la incidencia de la que viene todo esto— y pasarse convierte la pregunta en un cartel
 * que se despacha sin leer, y entonces el día que importa tampoco se lee. Cada regla de
 * abajo está a un lado o al otro de esa raya.
 */

interface Campos {
  title: string
  year: number | null
  approximate: boolean
  note: string
}

const VACIO: Campos = { title: '', year: null, approximate: false, note: '' }

describe('draftDirty, ¿se ha escrito algo?', () => {
  it('el borrador intacto no está sucio', () => {
    expect(draftDirty({ ...VACIO }, VACIO)).toBe(false)
  })

  it('un campo escrito sí', () => {
    expect(draftDirty({ ...VACIO, title: 'Carta' }, VACIO)).toBe(true)
    expect(draftDirty({ ...VACIO, year: 1985 }, VACIO)).toBe(true)
    expect(draftDirty({ ...VACIO, approximate: true }, VACIO)).toBe(true)
  })

  it('un espacio NO es trabajo', () => {
    // Cerrar por un roce después de haber tocado la barra espaciadora no merece un
    // cartel, y ese espacio no llega a la base tampoco: todo se recorta antes de escribir.
    expect(draftDirty({ ...VACIO, title: '   ' }, VACIO)).toBe(false)
    expect(draftDirty({ ...VACIO, title: ' Carta ' }, { ...VACIO, title: 'Carta' })).toBe(false)
  })

  it('null y «sin poner» son el mismo «sin dato»', () => {
    expect(
      draftDirty({ title: '', year: undefined }, { title: '', year: null } as { title: string; year: number | null | undefined }),
    ).toBe(false)
  })

  it('y sirve igual para «¿hay una corrección sin guardar?»', () => {
    // La misma pregunta desde el otro lado: el punto de partida es la fila guardada. Una
    // hoja de alta y una de corrección no pueden proteger cosas distintas.
    const guardado = { title: 'Carta de la galería', year: 1985, approximate: false, note: '' }
    expect(draftDirty({ ...guardado }, guardado)).toBe(false)
    expect(draftDirty({ ...guardado, year: 1986 }, guardado)).toBe(true)
    // Vaciar un campo que tenía dato también es una corrección, y de las que más duele
    // perder: es la que cuesta decidirse a hacer.
    expect(draftDirty({ ...guardado, title: '' }, guardado)).toBe(true)
  })

  it('solo mira los campos del punto de partida, no lo que la hoja lleve encima', () => {
    const current = { ...VACIO, saving: true } as unknown as typeof VACIO
    expect(draftDirty(current, VACIO)).toBe(false)
  })
})

describe('anyWritten, para las hojas de dos campos libres', () => {
  it('contesta a «¿hay algo escrito?» recortando', () => {
    expect(anyWritten('', null, undefined)).toBe(false)
    expect(anyWritten('   ', '')).toBe(false)
    expect(anyWritten('', 'cartel de la muestra')).toBe(true)
    expect(anyWritten('págs. 34-36')).toBe(true)
  })

  it('sin nada que mirar, no está sucio', () => {
    expect(anyWritten()).toBe(false)
  })
})
