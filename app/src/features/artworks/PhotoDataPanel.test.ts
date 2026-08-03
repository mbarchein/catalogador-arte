import { describe, expect, it } from 'vitest'
import { photoExifRows, type PhotoExif } from '../../lib/exif'
import { emptyDataMessage, photoDateWhisper } from './PhotoDataPanel'

/**
 * The pure part of the «Datos de la fotografía» panel (RF-419, §7.1).
 *
 * The rendering cannot be tested here —this repository has no DOM in its tests— so what is
 * checked is the two sentences the panel has to get right: the aside that names a
 * discrepancy of dates in a low voice, and which of the two different explanations an
 * empty panel shows.
 */

describe('RF-419 · la fecha de la foto y la de la ficha, cuando difieren', () => {
  it('lo dice en voz baja y con la fecha en español', () => {
    // El lote de 2022 es el caso real: la ficha guarda la fecha de subida.
    expect(photoDateWhisper('2022-10-09', '2026-07-28')).toBe(
      'La ficha guarda otra fecha; la foto dice 9 de octubre de 2022.',
    )
  })

  it('no dice nada cuando coinciden: hoy difieren las 39, y una alarma constante se ignora', () => {
    expect(photoDateWhisper('2022-10-09', '2022-10-09')).toBeNull()
  })

  it('no dice nada cuando falta cualquiera de las dos', () => {
    expect(photoDateWhisper(null, '2026-07-28')).toBeNull()
    expect(photoDateWhisper('2022-10-09', null)).toBeNull()
    expect(photoDateWhisper(undefined, undefined)).toBeNull()
    expect(photoDateWhisper('', '2026-07-28')).toBeNull()
  })

  it('una fecha con una forma que no se entiende se calla, en vez de imprimir «Invalid Date»', () => {
    expect(photoDateWhisper('2022-13-09', '2026-07-28')).toBeNull()
    expect(photoDateWhisper('ayer', '2026-07-28')).toBeNull()
    expect(photoDateWhisper('2022-10-9', '2026-07-28')).toBeNull()
  })

  it('la fecha se escribe tal como el fichero la dice, sin que la zona del portátil la mueva', () => {
    // Una fecha EXIF es un reloj de pared sin zona: el primero de enero no puede aparecer
    // como el 31 de diciembre según dónde se abra la aplicación.
    expect(photoDateWhisper('2023-01-01', '2023-06-01')).toContain('1 de enero de 2023')
    expect(photoDateWhisper('2023-12-31', '2023-06-01')).toContain('31 de diciembre de 2023')
  })
})

describe('RF-419 · nunca un hueco: dos mensajes de vacío distintos', () => {
  it('sobre el máster, la fotografía simplemente no trae datos', () => {
    expect(emptyDataMessage(true)).toBe('Esta fotografía no trae datos de cámara.')
  })

  it('sobre la copia de consulta, los datos están en un máster que no se descargó', () => {
    expect(emptyDataMessage(false)).toBe(
      'Los datos de cámara están en el máster de archivo, que no se ha podido descargar.',
    )
  })

  it('los dos son frases distintas: decir la primera cuando es la segunda manda a arreglar lo que no está roto', () => {
    expect(emptyDataMessage(true)).not.toBe(emptyDataMessage(false))
  })
})

describe('RF-419 · números y no juicios, y solo los campos presentes', () => {
  const full: PhotoExif = {
    taken: {
      when: { year: 2022, month: 10, day: 9, hour: 17, minute: 10, second: 33 },
      source: 'DATE_TIME_ORIGINAL',
      exact: true,
      date: '2022-10-09',
    },
    make: 'Xiaomi',
    model: 'Redmi Note 8 Pro',
    software: 'MIUI Camera',
    iso: 800,
    exposureTime: 1 / 60,
    fNumber: 1.9,
    focalLength: 5.4,
    flash: 16,
    flashFired: false,
    orientation: 6,
    reportedPixelSize: { width: 4000, height: 2252 },
  }

  it('un fichero sin nada deja la lista vacía, que es la respuesta que el panel explica', () => {
    expect(photoExifRows(null, {})).toEqual([])
  })

  it('la orientación no se muestra: ya está cocida en los píxeles que se ven', () => {
    const keys = photoExifRows(full, { width: 2252, height: 4000, bytes: 3_200_000 }).map((r) => r.key)
    expect(keys).not.toContain('orientation')
    // Ni el aviso de recorte previo: 23 falsos positivos de 31 medidos.
    expect(keys).not.toContain('cropped')
  })

  it('la fecha del fichero se etiqueta como aproximada, que es lo que distingue el lote de 2022', () => {
    const approximate: PhotoExif = {
      ...full,
      taken: {
        when: { year: 2022, month: 10, day: 9, hour: 17, minute: 10, second: 33 },
        source: 'IFD0_DATE_TIME',
        exact: false,
        date: '2022-10-09',
      },
    }
    expect(photoExifRows(approximate, {})[0]?.label).toBe('Fecha del fichero (aproximada)')
    expect(photoExifRows(full, {})[0]?.label).toBe('Fecha de la toma')
  })
})
