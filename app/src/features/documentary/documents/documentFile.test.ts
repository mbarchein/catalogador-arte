import { describe, expect, it, vi } from 'vitest'
import { DownloadFailure } from '../../../lib/download'
import {
  DOCUMENT_STEP_TEXT,
  HEAVY_FILE_BYTES,
  documentFileName,
  documentFileOffer,
  documentNoun,
  mimeText,
  runDocumentDownload,
  weightWarning,
  type DocumentFileColumns,
} from './documentFile'

/**
 * El fichero digitalizado de un documento de archivo: cómo se llama al salir de la
 * aplicación, cuánto pesa y qué se dice cuando no hay ninguno (RF-408, RF-411).
 *
 * Todo se decide sin navegador, que es la única manera de que esta batería lo
 * verifique: los dos bordes impuros —firmar y guardar— se inyectan.
 */

function document(over: Partial<DocumentFileColumns> = {}): DocumentFileColumns {
  return {
    archive_code: 'AR-ARCH-0001',
    title: 'Carta de la galería',
    start_year: 1985,
    file_path: 'archivo/AR-ARCH-0001_a1b2.pdf',
    file_size_bytes: 3_355_443,
    mime_type: 'application/pdf',
    ...over,
  }
}

describe('qué clase de fichero es, en palabras', () => {
  it('los dos casos normales de un archivo: el PDF de un expediente y un escaneo', () => {
    expect(mimeText('application/pdf')).toBe('PDF')
    expect(mimeText('image/jpeg')).toBe('imagen JPEG')
    expect(mimeText('image/tiff')).toBe('imagen TIFF')
  })

  it('los parámetros del tipo no forman parte de lo que el fichero es', () => {
    expect(mimeText('text/plain; charset=utf-8')).toBe('texto')
    expect(mimeText('  APPLICATION/PDF  ')).toBe('PDF')
  })

  it('un tipo desconocido cae a su familia antes que a la jerga', () => {
    expect(mimeText('image/x-canon-cr2')).toBe('imagen')
    expect(mimeText('video/quicktime')).toBe('vídeo')
  })

  it('y si ni la familia dice nada, se lee el tipo crudo, que al menos se puede dictar', () => {
    expect(mimeText('application/zip')).toBe('application/zip')
  })

  it('sin tipo no hay nada que decir: null, y no una etiqueta inventada', () => {
    expect(mimeText(null)).toBeNull()
    expect(mimeText('')).toBeNull()
    expect(mimeText(undefined)).toBeNull()
  })
})

describe('el nombre con el que el fichero sale de la aplicación (RF-411)', () => {
  it('la signatura del archivo y el título, que es lo que lo identifica', () => {
    expect(documentFileName(document())).toBe('ar-arch-0001_carta-de-la-galeria.pdf')
  })

  /**
   * El documento es del archivo, NO de la obra desde la que se descarga: un recorte
   * que menciona tres obras es una sola fila (RF-516), y bautizarlo con el código de
   * la ficha que se tuviera abierta daría tres nombres para un mismo fichero.
   */
  it('no lleva el código de catalogación de la obra, ni aunque esté en la ruta', () => {
    const name = documentFileName(
      document({ archive_code: null, title: 'Carta', file_path: 'archivo/AR-0001/carta.pdf' }),
    )
    expect(name).toBe('carta_1985.pdf')
    expect(name).not.toContain('ar-0001')
  })

  it('sin signatura entra el año, que es lo que distingue diez recortes de prensa', () => {
    expect(
      documentFileName(document({ archive_code: null, title: 'Recorte de prensa' })),
    ).toBe('recorte-de-prensa_1985.pdf')
  })

  it('sin signatura y sin año, el título a secas', () => {
    expect(
      documentFileName(document({ archive_code: null, title: 'Recorte', start_year: null })),
    ).toBe('recorte.pdf')
  })

  it('ni acentos, ni eñes, ni espacios: lo que cualquier máquina acepta', () => {
    expect(
      documentFileName(document({ archive_code: null, title: 'Daño en el ángulo', start_year: null })),
    ).toBe('dano-en-el-angulo.pdf')
  })

  it('un título largo se corta por un guion, para que no acabe en media palabra', () => {
    const name = documentFileName(
      document({
        archive_code: null,
        start_year: null,
        title: 'Correspondencia con la galería de arte contemporáneo de Badajoz sobre la muestra',
      }),
    )
    expect(name).toBe('correspondencia-con-la-galeria-de-arte.pdf')
    expect(name.endsWith('-.pdf')).toBe(false)
  })

  it('la extensión es la del fichero guardado y no una suposición', () => {
    expect(documentFileName(document({ file_path: 'archivo/x.JPG' }))).toMatch(/\.jpg$/)
    // An impossible extension is not glued on: a name with the wrong extension opens
    // in the wrong program and gets reported as a broken file.
    expect(documentFileName(document({ file_path: 'archivo/documento-sin-extension' }))).toBe(
      'ar-arch-0001_carta-de-la-galeria',
    )
  })

  it('un título que no deja ni una letra utilizable no da un nombre vacío', () => {
    expect(
      documentFileName(document({ archive_code: null, title: '···', start_year: null })),
    ).toBe('documento-de-archivo.pdf')
  })
})

describe('cómo se nombra el fichero dentro de un mensaje de error', () => {
  it('lleva el título, porque en la ficha hay media docena de botones iguales', () => {
    expect(documentNoun('Carta de la galería')).toBe('el documento «Carta de la galería»')
  })

  it('sin título no deja unas comillas vacías', () => {
    expect(documentNoun('   ')).toBe('el documento')
  })

  it('los saltos de línea de un título pegado de un PDF no rompen la frase', () => {
    expect(documentNoun('Carta\n  de la galería')).toBe('el documento «Carta de la galería»')
  })
})

describe('el peso, antes de tocar (RNF-106)', () => {
  it('un fichero corriente no avisa de nada', () => {
    expect(weightWarning(400_000)).toBeNull()
    expect(weightWarning(HEAVY_FILE_BYTES - 1)).toBeNull()
  })

  it('a partir de 10 MiB lo dice, con el número y qué hacer', () => {
    const notice = weightWarning(HEAVY_FILE_BYTES)
    expect(notice).toContain('10,0 MB')
    expect(notice).toContain('wifi')
  })

  it('un expediente escaneado en color avisa con su peso real', () => {
    expect(weightWarning(31_457_280)).toContain('30,0 MB')
  })

  it('sin tamaño no se avisa: no saber no es pesar poco ni pesar mucho', () => {
    expect(weightWarning(null)).toBeNull()
    expect(weightWarning(undefined)).toBeNull()
  })
})

describe('lo que la ficha ofrece de un documento (RF-408, RF-411)', () => {
  it('el botón lleva el peso encima, no en una nota al pie', () => {
    const offer = documentFileOffer(document())!
    expect(offer.label).toBe('Descargar el documento (3,2 MB)')
    expect(offer.kindText).toBe('PDF · 3,2 MB')
    expect(offer.path).toBe('archivo/AR-ARCH-0001_a1b2.pdf')
    expect(offer.fileName).toBe('ar-arch-0001_carta-de-la-galeria.pdf')
    expect(offer.noun).toBe('el documento «Carta de la galería»')
    expect(offer.weightWarning).toBeNull()
  })

  it('la oferta trae también cómo se puede VER, no solo cómo se descarga', () => {
    // Un PDF se abre aparte y un JPEG se pinta dentro de la aplicación; la frontera
    // entera está en `documentPreview.test.ts`. Lo que se fija aquí es que la oferta la
    // lleva, que si no la fila se quedaría con el botón de descargar y nada más.
    const pdf = documentFileOffer(document())!
    expect(pdf.preview).toBe('newTab')
    expect(pdf.previewLabel).toBe('Abrir el PDF (3,2 MB)')
    expect(pdf.previewHint).toContain('fuera de la aplicación')

    const jpeg = documentFileOffer(
      document({ file_path: 'archivo/recorte.jpg', mime_type: 'image/jpeg' }),
    )!
    expect(jpeg.preview).toBe('image')
    expect(jpeg.previewLabel).toBe('Ver el documento (3,2 MB)')
    expect(jpeg.previewHint).toBeNull()
  })

  it('y lo que no se puede ver no ofrece verlo, en vez de un botón roto', () => {
    const tiff = documentFileOffer(
      document({ file_path: 'archivo/x.tif', mime_type: 'image/tiff' }),
    )!
    expect(tiff.preview).toBeNull()
    expect(tiff.previewLabel).toBeNull()
    // Downloading it is still there: it is what always works.
    expect(tiff.label).toContain('Descargar')
  })

  /** There is no «digitised» flag: it is `file_path !== null`, and with no path there is no button. */
  it('sin fichero no hay oferta, y no un botón que no puede funcionar', () => {
    expect(documentFileOffer(document({ file_path: null }))).toBeNull()
    expect(documentFileOffer(document({ file_path: '   ' }))).toBeNull()
    expect(documentFileOffer(null)).toBeNull()
    expect(documentFileOffer(undefined)).toBeNull()
  })

  it('RF-304: sin tamaño registrado el botón sigue diciendo algo, y la línea también', () => {
    const offer = documentFileOffer(document({ file_size_bytes: null }))!
    expect(offer.label).toBe('Descargar el documento')
    expect(offer.kindText).toBe('PDF · tamaño sin registrar')
    expect(offer.bytes).toBeNull()
  })

  it('un fichero pesado se ofrece igual, avisando: con wifi es perfectamente razonable', () => {
    const offer = documentFileOffer(document({ file_size_bytes: 31_457_280 }))!
    expect(offer.label).toContain('30,0 MB')
    expect(offer.weightWarning).not.toBeNull()
  })
})

describe('el camino de la descarga (RF-411, RF-110)', () => {
  const offer = documentFileOffer(document())!

  it('firma, descarga, guarda, y lo dice: en el móvil la página no se mueve', async () => {
    const steps: string[] = []
    const save = vi.fn(async () => {})
    const message = await runDocumentDownload(offer, {
      sign: async (path) => `https://almacen/${path}?firma`,
      save,
      onStep: (step) => steps.push(DOCUMENT_STEP_TEXT[step]),
    })
    expect(steps).toEqual(['Pidiendo permiso…', 'Descargando…'])
    expect(save).toHaveBeenCalledWith(
      'https://almacen/archivo/AR-ARCH-0001_a1b2.pdf?firma',
      'ar-arch-0001_carta-de-la-galeria.pdf',
      'el documento «Carta de la galería»',
    )
    expect(message).toContain('ar-arch-0001_carta-de-la-galeria.pdf')
  })

  it('si la firma revienta, se lee una frase en español que nombra el documento', async () => {
    const failure = await runDocumentDownload(offer, {
      sign: async () => {
        throw new Error('Failed to fetch')
      },
    }).catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(DownloadFailure)
    expect((failure as DownloadFailure).kind).toBe('sign')
    // «al documento» and not «a el documento»: the signature warning is the only one carrying
    // a preposition before the noun, and `contracted` contracts it.
    expect((failure as DownloadFailure).message).toContain('al documento «Carta de la galería»')
    // The technical crumb, in brackets: useless to her, decisive over the phone.
    expect((failure as DownloadFailure).message).toContain('Failed to fetch')
  })

  /**
   * `signedUrl` de images.ts contesta null y se traga el mensaje del almacén. Sin
   * este caso, un permiso denegado dejaría el botón en silencio.
   */
  it('una firma que no llega tampoco deja el botón mudo', async () => {
    const failure = await runDocumentDownload(offer, { sign: async () => null }).catch(
      (cause: unknown) => cause,
    )
    expect(failure).toBeInstanceOf(DownloadFailure)
    // «acceder» and not «preparar la descarga»: signing is the step before downloading it and
    // also before SEEING it, and nobody had asked to download anything.
    expect((failure as DownloadFailure).message).toContain('No se ha podido acceder al documento')
  })

  it('lo que falle al guardar viaja tal cual: download.ts ya lo escribió en español', async () => {
    const cut = new DownloadFailure('network', 'No se ha podido descargar el documento: …')
    const failure = await runDocumentDownload(offer, {
      sign: async () => 'https://almacen/x',
      save: async () => {
        throw cut
      },
    }).catch((cause: unknown) => cause)
    expect(failure).toBe(cut)
  })
})
