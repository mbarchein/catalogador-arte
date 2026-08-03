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
    // Alguien lo va a recibir por correo sin ningún contexto: el nombre tiene que
    // decir de qué obra es, qué toma y si está corregido o no.
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
    // El máster se sube con los bytes y el nombre que dio la cámara (ADR-002): llamar
    // `.jpg` a un HEIC es un fichero que miente sobre su contenido.
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
    // La única de su tipo no se numera: `AR-0001_reverso-1_original.jpg` sugiere que
    // hay un segundo reverso que nadie ha subido.
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
    // «Daño» es el caso que rompe un servidor de correo o una cola de imprenta.
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
    // La copia es la que se manda a imprimir: va debajo del pulgar. El original no se
    // esconde nunca: es el documento de archivo.
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
    // Nada se descarga sin pedirlo, y pedirlo solo es una decisión si se sabe cuánto pesa.
    expect(offers[0]?.label).toContain('4,2 MB')
    expect(offers[1]?.label).toContain('19,0 MB')
    // Y la diferencia entre las dos, dicha sin jerga.
    expect(offers[0]?.hint).toContain('imprenta')
    expect(offers[1]?.hint).toContain('cámara')
    expect(offers.some((o) => /máster/i.test(o.label + o.hint))).toBe(false)
    expect(notes).toEqual([])
  })

  it('la copia pendiente NO se ofrece: se dice que falta y por qué', () => {
    // Un botón ausente no distingue «no hace falta» de «falta».
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
    // El estado en que está hoy la mayor parte de la base: la corrección es real, la
    // copia no se hizo nunca y nada se repara hacia atrás (ADR-010).
    const { offers, notes } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row({ rotation: 0, crop_x: 0.1, crop_y: 0.1, crop_width: 0.8, crop_height: 0.8 }),
      detail: detail(),
    })
    expect(offers.map((o) => o.kind)).toEqual(['master'])
    expect(notes[0]).toContain('antes de que se guardaran copias')
  })

  it('el color corregido también cuenta como corrección', () => {
    // Sin las columnas de color, una fotografía a la que solo se le arregló la
    // dominante de la bombilla se leería como «sin correcciones», que es la única
    // lectura claramente falsa.
    const { notes } = archiveDownloads({
      catalogId: 'AR-0001',
      row: row(),
      detail: detail({ color_temperature: 18, color_source: 'MANUAL' }),
    })
    expect(notes[0]).toContain('antes de que se guardaran copias')
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
    // «Todavía no lo sé» y «no hay» no son lo mismo, y la segunda frase durante el
    // primer segundo de cada carga sería una falsa alarma en cada visita.
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
    // Y el original se sigue pudiendo descargar: un fallo de lectura no cierra la puerta.
    expect(failed.offers.map((o) => o.kind)).toEqual(['master'])
  })

  it('sin original de archivo no hay hueco mudo: se explica que no consta', () => {
    // Hoy no hay ninguna fila así, pero la columna es nullable y el botón sencillamente
    // desaparecía, que es el hueco sin explicación que la regla prohíbe.
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

  it('ninguna condición mira el rol: el Lector descarga las dos (RF-411)', () => {
    // El caso de uso del Lector ES mandar el fichero a una imprenta o a un comisario.
    // La autorización real vive en la función de firma, que solo pide sesión válida
    // para descargar; aquí no puede haber un segundo permiso que la contradiga.
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
    // Y se dice que ha terminado: en el móvil el fichero cae donde el navegador decide
    // y la página no se mueve, así que sin mensaje el toque parece no haber hecho nada.
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
    // Lo que devuelve la invocación es «Firmando el original de archivo: Failed to
    // fetch»: cierto, inútil y la mitad en inglés.
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
