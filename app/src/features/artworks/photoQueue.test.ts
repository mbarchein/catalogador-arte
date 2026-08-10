import { describe, it, expect } from 'vitest'
import { toStoredShot, rehydrate, type StoredShot } from './photoQueue'
import { normalizeEdit, type PhotoEdit } from '../../lib/imageEdits'
import type { PhotoTakenDate } from '../../lib/exif'
import { isConvexQuadrilateral, type Corners } from '../../lib/perspective'
import type { PreparedShot } from '../../lib/images'

/**
 * The save/rehydrate round trip of the offline photo queue.
 *
 * IndexedDB is not mocked. The failure these tests cover lives in what is copied
 * into the stored row and what is read back out of it —`toStoredShot` and
 * `rehydrate`, both pure but for the object URL— and not in the database
 * plumbing, so they are driven directly. Faking IndexedDB would exercise the
 * plumbing and still miss a dropped field, which is the whole incident.
 */

function shot(
  edit: PhotoEdit,
  cropSource?: PreparedShot['cropSource'],
  extra?: Pick<PreparedShot, 'fileDate' | 'provenance'>,
) {
  const master = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'IMG_0001.jpg', {
    type: 'image/jpeg',
  })
  return {
    key: 'k1',
    shotType: 'GENERAL' as const,
    isIndex: true,
    prepared: {
      master,
      thumbnail: new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      derivative: new Blob([new Uint8Array([2])], { type: 'image/webp' }),
      originalWidth: 4000,
      originalHeight: 2252,
      preview: 'blob:previo',
      cropSource,
      ...extra,
      edit,
    } satisfies PreparedShot,
  }
}

/** What the EXIF reader gives back for the 2022 batch: file date, approximate. */
const APPROXIMATE: PhotoTakenDate = {
  when: { year: 2022, month: 10, day: 9, hour: 17, minute: 10, second: 33 },
  source: 'IFD0_DATE_TIME',
  exact: false,
  date: '2022-10-09',
}

/** A straightened quadrilateral: tilted, so it is not a rectangle in disguise. */
const TILTED: Corners = {
  nw: { x: 0.12, y: 0.1 },
  ne: { x: 0.88, y: 0.16 },
  se: { x: 0.86, y: 0.9 },
  sw: { x: 0.1, y: 0.84 },
}

describe('la cola de fotos pendientes (RF-410)', () => {
  it('conserva esquinas y procedencia del encuadre al guardar y rehidratar (RF-410, ADR-008)', () => {
    expect(isConvexQuadrilateral(TILTED)).toBe(true)
    const original = normalizeEdit({ rotation: 90, crop: null, corners: TILTED })
    expect(original.corners).not.toBeNull()

    const row = toStoredShot(shot(original, 'SUGGESTED_ADJUSTED'))
    const back = rehydrate(row)

    expect(back.prepared.edit.rotation).toBe(90)
    expect(back.prepared.edit.corners).toEqual(original.corners)
    // Without it the row would be written as MANUAL and the suggestion the
    // cataloger accepted would be indistinguishable from one drawn by hand.
    expect(back.prepared.cropSource).toBe('SUGGESTED_ADJUSTED')
  })

  it('no confunde un encuadre enderezado con un recorte rectangular (RF-410)', () => {
    const original = normalizeEdit({ rotation: 0, crop: null, corners: TILTED })
    const back = rehydrate(toStoredShot(shot(original, 'MANUAL')))
    // The derivatives came back straightened: reading them as a plain rectangle
    // would make the printed catalog reframe them wrong.
    expect(back.prepared.edit.crop).toBeNull()
    expect(back.prepared.edit.corners).not.toBeNull()
  })

  it('conserva el giro y el recorte rectangular, como ya hacía (RF-410)', () => {
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }
    const back = rehydrate(toStoredShot(shot({ rotation: 180, crop }, 'SUGGESTED')))
    expect(back.prepared.edit.rotation).toBe(180)
    expect(back.prepared.edit.crop).toEqual(crop)
    expect(back.prepared.edit.corners).toBeNull()
    expect(back.prepared.cropSource).toBe('SUGGESTED')
  })

  it('rehidrata una entrada de la versión anterior, sin esquinas ni procedencia (RF-410)', () => {
    // Exactly what the previous version of this module wrote: no `corners` and
    // no `cropSource` fields at all. The store keeps its rows across a deploy,
    // so this is the ordinary case on the first load after an update.
    const legacy = {
      key: 'k1',
      shotType: 'GENERAL',
      isIndex: false,
      master: new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }),
      masterName: 'IMG_0002.jpg',
      masterType: 'image/jpeg',
      thumbnail: new Blob([new Uint8Array([1])]),
      derivative: new Blob([new Uint8Array([2])]),
      originalWidth: 3000,
      originalHeight: 4000,
      rotation: 270,
      crop: { x: 0, y: 0.25, width: 1, height: 0.5 },
    } as StoredShot

    const back = rehydrate(legacy)
    expect(back.prepared.edit.rotation).toBe(270)
    expect(back.prepared.edit.crop).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 })
    expect(back.prepared.edit.corners).toBeNull()
    expect(back.prepared.cropSource).toBeUndefined()
  })

  it('rehidrata sin lanzar una entrada sin giro ni encuadre de ningún tipo (RF-410)', () => {
    const bare = {
      key: 'k1',
      shotType: 'GENERAL',
      isIndex: false,
      master: new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }),
      masterName: 'IMG_0003.jpg',
      masterType: 'image/jpeg',
      thumbnail: new Blob([new Uint8Array([1])]),
      derivative: new Blob([new Uint8Array([2])]),
      originalWidth: 1080,
      originalHeight: 2400,
    } as StoredShot

    expect(() => rehydrate(bare)).not.toThrow()
    const back = rehydrate(bare)
    expect(back.prepared.edit).toEqual({ rotation: 0, crop: null, corners: null })
  })

  it('descarta unas esquinas imposibles en vez de rehidratar un encuadre doblado (RF-410)', () => {
    // A crossed quadrilateral cannot be straightened: it would fold the image
    // over itself. Showing the photograph unstraightened is always better.
    const crossed = {
      ...toStoredShot(shot({ rotation: 0, crop: null })),
      corners: { nw: TILTED.nw, ne: TILTED.se, se: TILTED.ne, sw: TILTED.sw },
    } as StoredShot
    const back = rehydrate(crossed)
    expect(back.prepared.edit.corners).toBeNull()
  })

  it('ignora una procedencia del encuadre que no reconoce (RF-410)', () => {
    const strange = {
      ...toStoredShot(shot({ rotation: 0, crop: null })),
      cropSource: 'DETECTED_BY_A_FUTURE_VERSION',
    } as unknown as StoredShot
    expect(rehydrate(strange).prepared.cropSource).toBeUndefined()
  })
})

/**
 * The file's date and the provenance in the queue (RF-416, RF-417).
 *
 * The date is the whole module's field with no second chance: the original is only
 * in the browser during `prepareShot`, so if it does not travel in the queue's
 * row, a tab discarded while the camera was in the foreground leaves the
 * photograph filed as if it had no date, and the 14 shots from 2022 are
 * precisely the ones that depend on it.
 */
describe('la fecha del fichero y la procedencia en la cola (RF-416, RF-417)', () => {
  const EXACT: PhotoTakenDate = {
    when: { year: 2024, month: 3, day: 14, hour: 9, minute: 5, second: 1 },
    source: 'DATE_TIME_ORIGINAL',
    exact: true,
    date: '2024-03-14',
  }

  it('conserva la fecha fiable al guardar y rehidratar (RF-416)', () => {
    const back = rehydrate(
      toStoredShot(shot({ rotation: 0, crop: null }, undefined, { fileDate: EXACT })),
    )
    expect(back.prepared.fileDate).toEqual(EXACT)
  })

  it('conserva la fecha aproximada Y su condición de aproximada (RF-416)', () => {
    // Without the IFD0 fallback marked as approximate none of the 14 photographs from 2022
    // gets corrected, and without the mark the approximation would read as measured.
    const back = rehydrate(
      toStoredShot(shot({ rotation: 0, crop: null }, undefined, { fileDate: APPROXIMATE })),
    )
    expect(back.prepared.fileDate?.date).toBe('2022-10-09')
    expect(back.prepared.fileDate?.exact).toBe(false)
    expect(back.prepared.fileDate?.source).toBe('IFD0_DATE_TIME')
  })

  it('rehidrata como sin fecha una fotografía que no la trae (RF-416)', () => {
    const back = rehydrate(toStoredShot(shot({ rotation: 0, crop: null })))
    expect(back.prepared.fileDate).toBeNull()
  })

  it('no toma la fecha de modificación del fichero como fecha de la toma (RF-416)', () => {
    // `lastModified` is the date the file was written, and in a rehydrated
    // row it is the instant of the rehydration itself. A master having a
    // recent file date cannot turn into a shooting date.
    const row = toStoredShot(shot({ rotation: 0, crop: null }))
    const back = rehydrate(row)
    expect(back.prepared.fileDate).toBeNull()
    expect(back.prepared.master.lastModified).toBeGreaterThan(0)
  })

  it('deriva «exacta» de la etiqueta de origen y no se cree la pareja incoherente (RF-416)', () => {
    // It is the same fact written twice. A row saying DateTimeOriginal with
    // `exact: false` would reach the base as an approximate date that is not one, and the
    // column that distinguishes the 2022 batch would start lying.
    const row = {
      ...toStoredShot(shot({ rotation: 0, crop: null })),
      fileDate: { ...EXACT, exact: false },
    } as StoredShot
    expect(rehydrate(row).prepared.fileDate?.exact).toBe(true)
  })

  it('reconstruye el texto de la fecha desde sus partes, no desde el texto guardado (RF-416)', () => {
    // The text and the parts cannot diverge: it is written with the same function that
    // produced it.
    const row = {
      ...toStoredShot(shot({ rotation: 0, crop: null })),
      fileDate: { ...APPROXIMATE, date: '1999-01-01' },
    } as StoredShot
    expect(rehydrate(row).prepared.fileDate?.date).toBe('2022-10-09')
  })

  it('descarta una fecha imposible o de origen desconocido en vez de escribirla (RF-416)', () => {
    const base = toStoredShot(shot({ rotation: 0, crop: null }))
    const broken: unknown[] = [
      { ...APPROXIMATE, source: 'GUESSED_BY_A_FUTURE_VERSION' },
      { ...APPROXIMATE, when: { ...APPROXIMATE.when, month: 13 } },
      { ...APPROXIMATE, when: { ...APPROXIMATE.when, year: 0 } },
      { ...APPROXIMATE, when: { ...APPROXIMATE.when, hour: 24 } },
      { ...APPROXIMATE, when: { ...APPROXIMATE.when, day: 1.5 } },
      { ...APPROXIMATE, when: null },
      'ayer',
    ]
    for (const fileDate of broken) {
      const row = { ...base, fileDate } as StoredShot
      // A date that is not understood is «there is no date», never an `undefined` that
      // keeps travelling all the way to the insert.
      expect(rehydrate(row).prepared.fileDate).toBeNull()
    }
  })

  it('conserva la procedencia elegida por la catalogadora (RF-417)', () => {
    const back = rehydrate(
      toStoredShot(shot({ rotation: 0, crop: null }, undefined, { provenance: 'OTHER_CATALOG' })),
    )
    // Without this, a reproduction taken from another catalogue surviving a
    // reload would be uploaded as our own, and on our own the colour adjustment IS
    // offered: the consequence is not cosmetic.
    expect(back.prepared.provenance).toBe('OTHER_CATALOG')
  })

  it('no inventa una procedencia cuando la fila no la trae (RF-417)', () => {
    // Absent is «nobody has said anything», and whoever writes the row puts OWN, which is the
    // column's default. Guessing it here from the dimensions —1080×2400 with no
    // camera data looks like a screenshot— would be an inference, not
    // proof.
    const back = rehydrate(toStoredShot(shot({ rotation: 0, crop: null })))
    expect(back.prepared.provenance).toBeUndefined()
  })

  it('ignora una procedencia que no reconoce (RF-417)', () => {
    const strange = {
      ...toStoredShot(shot({ rotation: 0, crop: null })),
      provenance: 'INHERITED_FROM_A_FUTURE_VERSION',
    } as unknown as StoredShot
    // An unknown label would travel to the base's enum, be rejected, and the whole shot
    // would be lost over one word.
    expect(rehydrate(strange).prepared.provenance).toBeUndefined()
  })

  it('rehidrata una fila de la versión anterior, sin fecha ni procedencia (RF-416, RF-417)', () => {
    const legacy = {
      key: 'k9',
      shotType: 'GENERAL',
      isIndex: false,
      master: new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }),
      masterName: 'IMG_0009.jpg',
      masterType: 'image/jpeg',
      thumbnail: new Blob([new Uint8Array([1])]),
      derivative: new Blob([new Uint8Array([2])]),
      originalWidth: 3000,
      originalHeight: 4000,
    } as StoredShot
    const back = rehydrate(legacy)
    expect(back.prepared.fileDate).toBeNull()
    expect(back.prepared.provenance).toBeUndefined()
    // And what already worked keeps working: the old row does not blow up.
    expect(back.prepared.edit).toEqual({ rotation: 0, crop: null, corners: null })
  })
})
