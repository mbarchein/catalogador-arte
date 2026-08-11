import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_NOUN,
  archiveDownloads,
  archiveFileName,
  fileNameSlug,
  runArchiveDownload,
  shotOrdinal,
  sizeText,
  storedExtension,
  type ArchiveOffer,
  type CorrectedCopyColumns,
} from './archiveDownloads'
import { originalSize, pixelText } from './photoDetails'
import { SHOT_TYPE_LABEL, type ShotTypeValue } from '../../lib/types'

/**
 * What the record offers to take out of the application, and what it says about what it
 * cannot offer (RF-411, RF-420).
 *
 * All of it decided without a browser on purpose: the battery runs in node, so whatever
 * had been left inside the JSX would be verified by nobody — and this is the only door
 * of the application towards the outside world.
 */

/** A gallery row: the framing columns plus what identifies the shot. */
function row(over: Partial<Parameters<typeof archiveDownloads>[0]['row']> = {}) {
  return {
    image_id: 'AR-0001_v1',
    master_path: 'AR-0001/AR-0001_ab12cd34_master.jpg',
    shot_type: 'GENERAL' as ShotTypeValue,
    rotation: 0,
    ...over,
  }
}

/** A detail row: an untouched photograph with no copy of any kind. */
function detail(over: Partial<CorrectedCopyColumns> = {}): CorrectedCopyColumns {
  return {
    corrected_path: null,
    corrected_bytes: null,
    corrected_pending: false,
    master_bytes: null,
    ...over,
  }
}

describe('el nombre del fichero descargado (RF-411)', () => {
  it('lleva la clave de catalogación, el tipo de toma y qué fichero es', () => {
    // Somebody is going to receive it by e-mail with no context at all: the name has to
    // say which artwork it belongs to, which shot, and whether it is corrected or not.
    expect(
      archiveFileName({
        catalogId: 'AR-0001',
        shotType: 'GENERAL',
        kind: 'master',
        storedPath: 'AR-0001/AR-0001_ab12cd34_master.jpg',
      }),
    ).toBe('AR-0001_general_original.jpg')
    expect(
      archiveFileName({
        catalogId: 'AR-0001',
        shotType: 'SIGNATURE_DETAIL',
        kind: 'corrected',
        storedPath: 'AR-0001/AR-0001_ab12cd34_corrected.jpg',
      }),
    ).toBe('AR-0001_firma_corregida.jpg')
  })

  it('no arrastra el sufijo aleatorio de la ruta, que no significa nada fuera', () => {
    const name = archiveFileName({
      catalogId: 'AR-0001',
      shotType: 'GENERAL',
      kind: 'master',
      storedPath: 'AR-0001/AR-0001_ab12cd34_master.jpg',
    })
    expect(name).not.toContain('ab12cd34')
    expect(name).not.toContain('master')
  })

  it('conserva la extensión real del máster, que no siempre es jpg', () => {
    // The master is uploaded with the bytes and the name the camera gave (ADR-002): calling
    // a HEIC `.jpg` is a file that lies about its content.
    expect(
      archiveFileName({
        catalogId: 'AR-0001',
        shotType: 'BACK',
        kind: 'master',
        storedPath: 'AR-0001/AR-0001_ab12cd34_master.HEIC',
      }),
    ).toBe('AR-0001_reverso_original.heic')
  })

  it('la copia corregida es JPEG aunque la ruta llegue sin extensión', () => {
    expect(
      archiveFileName({
        catalogId: 'AR-0001',
        shotType: 'GENERAL',
        kind: 'corrected',
        storedPath: 'AR-0001/AR-0001_ab12cd34_corrected',
      }),
    ).toBe('AR-0001_general_corregida.jpg')
  })

  it('un máster sin extensión reconocible se queda sin ella antes que con una falsa', () => {
    expect(
      archiveFileName({
        catalogId: 'AR-0001',
        shotType: 'GENERAL',
        kind: 'master',
        storedPath: 'AR-0001/AR-0001_ab12cd34_master',
      }),
    ).toBe('AR-0001_general_original')
  })

  it('dos tomas del mismo tipo no se llaman igual en el mismo correo', () => {
    const rows = [
      { image_id: 'a', shot_type: 'GENERAL' as ShotTypeValue },
      { image_id: 'b', shot_type: 'GENERAL' as ShotTypeValue },
      { image_id: 'c', shot_type: 'BACK' as ShotTypeValue },
    ]
    expect(shotOrdinal(rows, 'a')).toBe(1)
    expect(shotOrdinal(rows, 'b')).toBe(2)
    // The only one of its kind is not numbered: `AR-0001_reverso-1_original.jpg` suggests
    // there is a second back nobody has uploaded.
    expect(shotOrdinal(rows, 'c')).toBeUndefined()
    expect(shotOrdinal(rows, 'no-existe')).toBeUndefined()
    expect(
      archiveFileName({
        catalogId: 'AR-0001',
        shotType: 'GENERAL',
        kind: 'master',
        storedPath: 'AR-0001/AR-0001_ab12cd34_master.jpg',
        ordinal: 2,
      }),
    ).toBe('AR-0001_general-2_original.jpg')
  })

  it('ningún tipo de toma produce un nombre con acentos, espacios ni mayúsculas', () => {
    // «Daño» is the case that breaks a mail server or a print queue.
    for (const shot of Object.keys(SHOT_TYPE_LABEL) as ShotTypeValue[]) {
      const name = archiveFileName({
        catalogId: 'AR-0001',
        shotType: shot,
        kind: 'corrected',
        storedPath: 'AR-0001/x_corrected.jpg',
      })
      expect(name).toMatch(/^AR-0001_[a-z0-9-]+_corregida\.jpg$/)
    }
    expect(fileNameSlug('Daño')).toBe('dano')
    expect(fileNameSlug('Detalle de firma')).toBe('detalle-de-firma')
    expect(fileNameSlug('  ')).toBe('')
  })

  it('la extensión se lee del último tramo, no de los puntos de la carpeta', () => {
    expect(storedExtension('AR-0001/AR-0001_ab12cd34_master.jpg')).toBe('jpg')
    expect(storedExtension('AR.0001/fichero')).toBeNull()
    expect(storedExtension('AR-0001/.oculto')).toBeNull()
    expect(storedExtension('AR-0001/x.demasiadolarga')).toBeNull()
  })
})

describe('qué descargas se ofrecen según la fila (RF-411, RF-420)', () => {
  it('con copia corregida se ofrecen las dos, y la copia va primero', () => {
    // The copy is the one sent to print: it goes under the thumb. The original is never
    // hidden: it is the archive document.
    const { offers, notes } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row({ rotation: 90 }),
      detail: detail({
        corrected_path: 'AR-0001/AR-0001_ab12cd34_corrected.jpg',
        corrected_bytes: 4_404_019,
        master_bytes: 19_922_944,
      }),
    })
    expect(offers.map((o) => o.kind)).toEqual(['corrected', 'master'])
    expect(offers[0]?.fileName).toBe('AR-0001_general_corregida.jpg')
    expect(offers[1]?.fileName).toBe('AR-0001_general_original.jpg')
    // Nothing downloads unasked, and asking is only a decision if the weight is known.
    expect(offers[0]?.label).toContain('4,2 MB')
    expect(offers[1]?.label).toContain('19,0 MB')
    // And the difference between the two, said without jargon.
    expect(offers[0]?.hint).toContain('imprenta')
    expect(offers[1]?.hint).toContain('cámara')
    expect(offers.some((o) => /máster/i.test(o.label + o.hint))).toBe(false)
    expect(notes).toEqual([])
  })

  it('la copia pendiente NO se ofrece: se dice que falta y por qué', () => {
    // A missing button does not tell «not needed» from «missing».
    const { offers, notes } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row({ rotation: 90 }),
      detail: detail({ corrected_pending: true }),
    })
    expect(offers.map((o) => o.kind)).toEqual(['master'])
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('pendiente')
    expect(notes[0]).toContain('ordenador')
    expect(notes[0]).toContain('sin corregir')
  })

  it('una corrección anterior a las copias se explica, no se lee como «no hace falta»', () => {
    // The state most of the base is in today: the correction is real, the copy was never
    // made and nothing is repaired backwards (ADR-010).
    const { offers, notes } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row({ rotation: 0, crop_x: 0.1, crop_y: 0.1, crop_width: 0.8, crop_height: 0.8 }),
      detail: detail(),
    })
    expect(offers.map((o) => o.kind)).toEqual(['master'])
    expect(notes[0]).toContain('anterior a las copias')
  })

  it('el color corregido también cuenta como corrección', () => {
    // Without the colour columns, a photograph that only had the bulb's cast
    // fixed would read as «sin correcciones», which is the one clearly false
    // reading.
    const { notes } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row(),
      detail: detail({ color_temperature: 18, color_source: 'MANUAL' }),
    })
    expect(notes[0]).toContain('anterior a las copias')
  })

  it('sin correcciones no falta nada, y se dice con naturalidad', () => {
    const { offers, notes } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row(),
      detail: detail({ master_bytes: 8_388_608 }),
    })
    expect(offers.map((o) => o.kind)).toEqual(['master'])
    expect(notes[0]).toContain('no tiene correcciones')
    expect(notes[0]).toContain('el original ya es lo que hay que mandar')
    expect(notes[0]).not.toContain('pendiente')
  })

  it('mientras se lee el estado no se acusa de nada, y cuando falla se dice', () => {
    // «I do not know yet» and «there is none» are not the same, and the second sentence
    // during the first second of every load would be a false alarm on every visit.
    const loading = archiveDownloads({ catalogId: 'AR-0001', row: row(), detail: undefined })
    expect(loading.notes[0]).toContain('Comprobando')
    expect(loading.offers.map((o) => o.kind)).toEqual(['master'])

    const failed = archiveDownloads({
      catalogId: 'AR-0001',
      row: row(),
      detail: undefined,
      detailsFailed: true,
    })
    expect(failed.notes[0]).toContain('No se ha podido comprobar')
    // And the original can still be downloaded: a read failure does not close the door.
    expect(failed.offers.map((o) => o.kind)).toEqual(['master'])
  })

  it('sin original de archivo no hay hueco mudo: se explica que no consta', () => {
    // There is no such row today, but the column is nullable and the button simply
    // disappeared, which is the unexplained gap the rule forbids.
    const { offers, notes } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row({ master_path: null }),
      detail: detail(),
    })
    expect(offers.map((o) => o.kind)).toEqual([])
    expect(notes.some((n) => n.includes('no consta el original de archivo'))).toBe(true)
  })

  it('sin copia y sin original quedan las dos explicaciones, nunca un panel vacío', () => {
    const { offers, notes } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row({ master_path: null, rotation: 90 }),
      detail: detail({ corrected_pending: true }),
    })
    expect(offers).toEqual([])
    expect(notes).toHaveLength(2)
  })

  it('sin fotografía seleccionada tampoco se deja el hueco', () => {
    const { offers, notes } = archiveDownloads({ catalogId: 'AR-0001', row: null, detail: null })
    expect(offers).toEqual([])
    expect(notes).toHaveLength(1)
  })

  it('el tamaño solo se promete cuando se sabe', () => {
    const { offers } = archiveDownloads({ catalogId: 'AR-0001', row: row(), detail: detail() })
    expect(offers[0]?.label).toBe('Descargar el original')
    expect(sizeText(null)).toBeNull()
    expect(sizeText(0)).toBeNull()
    expect(sizeText(Number.NaN)).toBeNull()
    expect(sizeText(204_800)).toBe('200 KB')
    expect(sizeText(19_922_944)).toBe('19,0 MB')
  })

  it('el original dice sus píxeles y su peso, en ese orden', () => {
    // The pixels answer what the weight cannot: whether the file is big enough for what
    // a print shop is being asked to do with it.
    const { offers } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row(),
      detail: detail({ master_bytes: 1_572_864, original_width: 4032, original_height: 3024 }),
    })
    expect(offers[0]?.label).toBe('Descargar el original (4032×3024 px · 1,5 MB)')
  })

  it('la copia corregida dice EL TAMAÑO DE LA COPIA, no el del original', () => {
    // The assertion that matters, and the one a stored column would have got wrong: the
    // copy carries the geometry, so a photograph turned a quarter and cropped to half of
    // each side is 1512×2016 and the original is still 4032×3024. Both numbers are on
    // screen at once, and telling the print shop the original's size for the file it is
    // about to receive is exactly the mistake that gets discovered at the print shop.
    const { offers } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row({
        rotation: 90,
        crop_x: 0,
        crop_y: 0,
        crop_width: 0.5,
        crop_height: 0.5,
      }),
      detail: detail({
        corrected_path: 'AR-0001/AR-0001_ab12cd34_corrected.jpg',
        corrected_bytes: 903_168,
        master_bytes: 1_572_864,
        original_width: 4032,
        original_height: 3024,
      }),
    })
    expect(offers.map((o) => o.label)).toEqual([
      'Descargar la copia corregida (1512×2016 px · 882 KB)',
      'Descargar el original (4032×3024 px · 1,5 MB)',
    ])
  })

  it('sin correcciones la copia mide lo que el original, que es lo que es', () => {
    // A path with no geometry is the case of a photograph corrected only in colour: the
    // copy is the same frame, so saying a different size would be inventing one.
    const { offers } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row(),
      detail: detail({
        corrected_path: 'AR-0001/AR-0001_ab12cd34_corrected.jpg',
        corrected_bytes: 903_168,
        original_width: 4032,
        original_height: 3024,
      }),
    })
    expect(offers[0]?.label).toBe('Descargar la copia corregida (4032×3024 px · 882 KB)')
  })

  it('el tamaño en píxeles solo se promete cuando se sabe, como el peso', () => {
    // The rows uploaded before the colour migration have both columns null and nothing
    // was filled in backwards (ADR-010). The button keeps the weight it does know and
    // says nothing about pixels: a guessed number on the one door out of the application
    // is worse than no number.
    const { offers } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row({ rotation: 90 }),
      detail: detail({
        corrected_path: 'AR-0001/AR-0001_ab12cd34_corrected.jpg',
        corrected_bytes: 903_168,
        master_bytes: 1_572_864,
      }),
    })
    expect(offers.map((o) => o.label)).toEqual([
      'Descargar la copia corregida (882 KB)',
      'Descargar el original (1,5 MB)',
    ])
  })

  it('media medida no es una medida: los dos lados o ninguno', () => {
    expect(originalSize(detail({ original_width: 4032, original_height: 3024 }))).toEqual({
      width: 4032,
      height: 3024,
    })
    expect(originalSize(detail({ original_width: 4032 }))).toBeNull()
    expect(originalSize(detail({ original_height: 3024 }))).toBeNull()
    expect(originalSize(detail())).toBeNull()
    expect(originalSize(null)).toBeNull()
    // A zero would be a photograph with no pixels, which only comes from bad arithmetic.
    expect(originalSize(detail({ original_width: 0, original_height: 3024 }))).toBeNull()
    expect(originalSize(detail({ original_width: -1, original_height: 3024 }))).toBeNull()
  })

  it('el tamaño se escribe con el signo de multiplicar, como en la pantalla de fotografías', () => {
    expect(pixelText({ width: 4032, height: 3024 })).toBe('4032×3024 px')
    expect(pixelText(null)).toBeNull()
    expect(pixelText({ width: 0, height: 10 })).toBeNull()
    expect(pixelText({ width: Number.NaN, height: 10 })).toBeNull()
  })

  it('ninguna condición mira el rol: el Lector descarga las dos (RF-411)', () => {
    // The Reader's use case IS sending the file to a print shop or to a curator.
    // The real authorisation lives in the signing function, which only asks for a valid session
    // to download; here there cannot be a second permission contradicting it.
    const { offers } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row({ rotation: 90 }),
      detail: detail({ corrected_path: 'AR-0001/AR-0001_ab12cd34_corrected.jpg' }),
    })
    expect(offers).toHaveLength(2)
  })
})

describe('la descarga, paso a paso y contando lo que pasa (RF-411, RF-420)', () => {
  const offer: ArchiveOffer = {
    kind: 'corrected',
    path: 'AR-0001/AR-0001_ab12cd34_corrected.jpg',
    fileName: 'AR-0001_general_corregida.jpg',
    label: 'Descargar la copia corregida (4,2 MB)',
    hint: 'da igual',
    noun: ARCHIVE_NOUN.corrected,
  }

  it('firma la ruta de SU fichero y guarda con el nombre nuestro', async () => {
    const signed: [string, string][] = []
    const saved: [string, string, string][] = []
    const notice = await runArchiveDownload(offer, {
      sign: (kind, path) => {
        signed.push([kind, path])
        return Promise.resolve('https://s3.local/firmada')
      },
      save: (url, fileName, noun) => {
        saved.push([url, fileName, noun])
        return Promise.resolve()
      },
    })
    expect(signed).toEqual([['corrected', 'AR-0001/AR-0001_ab12cd34_corrected.jpg']])
    expect(saved).toEqual([
      ['https://s3.local/firmada', 'AR-0001_general_corregida.jpg', 'la copia corregida'],
    ])
    // And it is said to have finished: on mobile the file lands wherever the browser decides
    // and the page does not move, so with no message the tap looks like it did nothing.
    expect(notice).toContain('AR-0001_general_corregida.jpg')
  })

  it('anuncia los dos tramos de espera, que son largos y silenciosos', async () => {
    const steps: string[] = []
    await runArchiveDownload(offer, {
      sign: () => Promise.resolve('https://s3.local/firmada'),
      save: () => Promise.resolve(),
      onStep: (step) => steps.push(step),
    })
    expect(steps).toEqual(['signing', 'downloading'])
  })

  it('el fallo al firmar se traduce en vez de salir crudo', async () => {
    // What the invocation returns is «Firmando el original de archivo: Failed to
    // fetch»: true, useless and half of it in English.
    const thrown: unknown = await runArchiveDownload(offer, {
      sign: () => Promise.reject(new Error('Failed to fetch')),
      save: () => Promise.resolve(),
    }).catch((e: unknown) => e)
    const failure = thrown as Error
    expect(failure.message).toContain('la copia corregida')
    expect(failure.message).toContain('Comprueba la conexión')
    expect(failure.message).toContain('Failed to fetch')
  })

  it('si la firma falla no se pide nada al almacén', async () => {
    let saves = 0
    await runArchiveDownload(offer, {
      sign: () => Promise.reject(new Error('sin red')),
      save: () => {
        saves += 1
        return Promise.resolve()
      },
    }).catch(() => undefined)
    expect(saves).toBe(0)
  })
})
