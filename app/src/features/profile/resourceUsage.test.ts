import { describe, expect, it } from 'vitest'
import {
  bytesText,
  freeBytes,
  freeText,
  measuredText,
  objectsText,
  truncatedNotice,
  usageLevel,
  usageWarning,
  usedPercent,
  DATABASE_LIMIT_BYTES,
  MASTERS_LIMIT_BYTES,
  STORAGE_LIMIT_BYTES,
} from './resourceUsage'

/**
 * El espacio que queda (RF-1202).
 *
 * Lo que se fija es lo que hace inútil a una pantalla como esta si se hace a
 * medias: que la cifra se pueda comparar con la del panel del servicio, que
 * pasarse del límite no se lea como espacio de sobra, y que el aviso salga solo
 * cuando queda poco. Un aviso permanente se deja de leer y entonces no sirve el
 * día que importa.
 */

describe('los tamaños se escriben como se leen', () => {
  it('en múltiplos de 1000, que es lo que enseña el panel del servicio', () => {
    // With 1024 it would come out as «976,6 KB» and would not match Supabase or Backblaze.
    // A figure disagreeing with the official panel is not believed, and rightly so.
    expect(bytesText(1_000_000)).toBe('1,0 MB')
    expect(bytesText(2_500_000_000)).toBe('2,5 GB')
  })

  it('sin decimales donde no dicen nada', () => {
    expect(bytesText(512)).toBe('512 B')
    expect(bytesText(4_096)).toBe('4 KB')
  })

  it('y el vacío es un cero, no un hueco', () => {
    expect(bytesText(0)).toBe('0 B')
    expect(bytesText(Number.NaN)).toBe('0 B')
  })
})

describe('cuánto queda', () => {
  it('es lo que se preguntó, así que va primero', () => {
    expect(freeText(200_000_000, DATABASE_LIMIT_BYTES)).toBe('Quedan 300,0 MB libres de 500,0 MB')
  })

  it('pasarse del límite no es espacio de sobra', () => {
    // Without the floor at zero it would say «quedan -2 GB libres», which besides being absurd
    // paints the bar backwards.
    expect(freeBytes(12_000_000_000, MASTERS_LIMIT_BYTES)).toBe(0)
    expect(freeText(12_000_000_000, MASTERS_LIMIT_BYTES)).toContain('Sin espacio libre')
  })

  it('el porcentaje no se sale de la barra', () => {
    expect(usedPercent(500_000_000, STORAGE_LIMIT_BYTES)).toBe(50)
    expect(usedPercent(9_999_999_999_999, MASTERS_LIMIT_BYTES)).toBe(100)
    expect(usedPercent(10, 0)).toBe(0)
  })
})

describe('el aviso sale cuando queda poco, y no antes', () => {
  it('lo holgado no lleva aviso', () => {
    expect(usageLevel(1_000_000, MASTERS_LIMIT_BYTES)).toBe('ok')
    expect(usageWarning('Archivo de másters', 1_000_000, MASTERS_LIMIT_BYTES)).toBeNull()
  })

  it('a partir del 80% avisa y dice el porcentaje', () => {
    expect(usageLevel(8_000_000_000, MASTERS_LIMIT_BYTES)).toBe('warning')
    expect(usageWarning('Archivo de másters', 8_000_000_000, MASTERS_LIMIT_BYTES)).toContain('80%')
  })

  it('y lleno dice qué va a pasar y qué se puede hacer', () => {
    // «Lleno» with no way out is bad news and nothing else. And what can be done
    // is not deleting, which does not exist in this project (RF-901).
    const said = usageWarning('Archivo de másters', MASTERS_LIMIT_BYTES, MASTERS_LIMIT_BYTES) ?? ''
    expect(usageLevel(MASTERS_LIMIT_BYTES, MASTERS_LIMIT_BYTES)).toBe('full')
    expect(said).toContain('puede fallar')
    expect(said).toContain('subir de plan')
    expect(said).not.toContain('borrar')
  })
})

describe('lo que matiza la cifra se dice', () => {
  it('un recuento a medias es un mínimo, no un total', () => {
    expect(truncatedNotice(true)).toContain('al menos')
    expect(truncatedNotice(false)).toBeNull()
  })

  it('cero ficheros no se lee como una avería', () => {
    expect(objectsText(0)).toBe('Todavía sin ficheros')
    expect(objectsText(1)).toBe('1 fichero')
    // Four-digit figures go without a separator in Spanish and five-digit ones with it: it is the
    // language's rule, not an oversight of the format.
    expect(objectsText(2_400)).toBe('2400 ficheros')
    expect(objectsText(24_000)).toBe('24.000 ficheros')
  })

  it('sin medir todavía se dice, en vez de dar una hora inventada', () => {
    expect(measuredText(null)).toBe('Sin medir todavía')
    expect(measuredText(new Date('2026-08-09T07:05:00Z'))).toContain('Medido a las')
  })
})
