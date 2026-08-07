import { describe, expect, it } from 'vitest'
import {
  MULTIPART_MIN_PART_BYTES,
  bytesBefore,
  planParts,
  useMultipart,
} from './multipartUpload'

const MB = 1_048_576

describe('cuándo merece la pena partir', () => {
  it('solo si sale más de una parte', () => {
    // Con una sola parte, partir es un PUT normal con dos viajes de más y una forma de
    // fallar que el PUT normal no tiene.
    expect(useMultipart(2 * MB)).toBe(false)
    expect(useMultipart(MULTIPART_MIN_PART_BYTES)).toBe(false)
    expect(useMultipart(MULTIPART_MIN_PART_BYTES + 1)).toBe(true)
    expect(useMultipart(19 * MB)).toBe(true)
  })

  it('no se atraganta con un tamaño que no es un número', () => {
    expect(useMultipart(Number.NaN)).toBe(false)
    expect(useMultipart(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('el reparto en partes', () => {
  it('cubre el fichero entero, exactamente una vez y en orden', () => {
    // La propiedad de la que depende todo lo demás: si las partes no cubren el fichero,
    // el almacén junta un objeto más corto que el original y lo da por bueno.
    const size = 19 * MB
    const parts = planParts(size)
    expect(parts[0]?.start).toBe(0)
    expect(parts[parts.length - 1]?.end).toBe(size)
    expect(parts.map((p) => p.partNumber)).toEqual(parts.map((_, i) => i + 1))
    parts.forEach((p, i) => {
      if (i > 0) expect(p.start).toBe(parts[i - 1]?.end)
    })
    expect(parts.reduce((n, p) => n + (p.end - p.start), 0)).toBe(size)
  })

  it('todas llegan al mínimo menos la última, que es lo que S3 permite', () => {
    const parts = planParts(12 * MB)
    expect(parts).toHaveLength(3)
    parts.slice(0, -1).forEach((p) => {
      expect(p.end - p.start).toBe(MULTIPART_MIN_PART_BYTES)
    })
    // 12 MiB − 10 MiB. La última puede ser todo lo pequeña que salga.
    expect((parts[2]?.end ?? 0) - (parts[2]?.start ?? 0)).toBe(2 * MB)
  })

  it('un fichero de un byte más que una parte da dos, la segunda de un byte', () => {
    const parts = planParts(MULTIPART_MIN_PART_BYTES + 1)
    expect(parts).toHaveLength(2)
    expect((parts[1]?.end ?? 0) - (parts[1]?.start ?? 0)).toBe(1)
  })

  it('un fichero vacío o absurdo no da partes', () => {
    expect(planParts(0)).toEqual([])
    expect(planParts(-1)).toEqual([])
    expect(planParts(Number.NaN)).toEqual([])
    expect(planParts(10, 0)).toEqual([])
  })
})

describe('lo que ya está al otro lado', () => {
  it('cuenta los bytes de las partes anteriores', () => {
    const parts = planParts(12 * MB)
    expect(bytesBefore(parts, 1)).toBe(0)
    expect(bytesBefore(parts, 2)).toBe(MULTIPART_MIN_PART_BYTES)
    expect(bytesBefore(parts, 3)).toBe(2 * MULTIPART_MIN_PART_BYTES)
  })

  it('es lo que impide que la barra vuelva a cero en cada tropiezo', () => {
    // Al reintentar una parte se pierde ESA parte, no el fichero: lo anterior ya está
    // aceptado por el almacén. Sin esto, cada corte devolvería el contador a cero y el
    // número dejaría de decir nada.
    const parts = planParts(19 * MB)
    const enElAire = 3
    const reintentoDesdeCero = bytesBefore(parts, enElAire) + 0
    expect(reintentoDesdeCero).toBe(2 * MULTIPART_MIN_PART_BYTES)
    expect(reintentoDesdeCero).toBeGreaterThan(0)
  })
})
