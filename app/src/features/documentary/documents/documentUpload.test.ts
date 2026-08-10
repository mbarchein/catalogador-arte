import { describe, expect, it, vi } from 'vitest'
import {
  ARCHIVE_PREFIX,
  BUCKET_FILE_LIMIT_BYTES,
  describeStorageFailure,
  documentFileProblem,
  documentObjectPath,
  extensionForFile,
  fileColumns,
  mimeForFile,
  runAddScan,
  runDocumentUpload,
  SCAN_STEP_TEXT,
  uploadedNotice,
  UPLOAD_STEP_TEXT,
  type AddScanDeps,
  type PickedFile,
  type ScanStep,
  type UploadDocumentDeps,
  type UploadStep,
} from './documentUpload'

/**
 * Uploading an archive document's scanned file and linking it to the artwork
 * (RF-408, RF-110, RF-516, RF-517).
 *
 * Everything is decided with no browser, which is the only way for this suite to
 * verify it: `File` is a DOM type and here its shape is used, and the three impure
 * edges —uploading, inserting, linking— are injected.
 */

function picked(over: Partial<PickedFile> = {}): PickedFile {
  return {
    name: 'expediente 1985.pdf',
    size: 3_355_443,
    type: 'application/pdf',
    ...over,
  }
}

const DOCUMENT = { archive_code: 'AR-ARCH-0001', title: 'Carta de la galería' }

describe('el límite del bucket, medido y no supuesto (RF-408)', () => {
  /**
   * 62 914 560 bytes = 60 MiB, read from `storage.buckets` of the running base, which
   * is what `20260726010000_imagenes.sql` set and no migration has changed.
   * The store answers one byte more with HTTP 400 and
   * `{"statusCode":"413","message":"The object exceeded the maximum allowed size"}`,
   * in English and without saying the number: that is why the number is here.
   */
  it('son 62 914 560 bytes, 60 MiB', () => {
    expect(BUCKET_FILE_LIMIT_BYTES).toBe(62_914_560)
    expect(BUCKET_FILE_LIMIT_BYTES).toBe(60 * 1_048_576)
  })

  it('un expediente escaneado en blanco y negro cabe holgado', () => {
    // ~200 pages at 300 dpi in black and white come to around 12 MB.
    expect(documentFileProblem(picked({ size: 12 * 1_048_576 }))).toBeNull()
  })

  it('uno en color de unas decenas de páginas también, y avisa de su peso al bajarlo', () => {
    expect(documentFileProblem(picked({ size: 45 * 1_048_576 }))).toBeNull()
  })

  it('pasado el límite se dice antes de subir, con los dos números y qué hacer', () => {
    const problem = documentFileProblem(picked({ size: BUCKET_FILE_LIMIT_BYTES + 1 }))
    expect(problem).toContain('60,0 MB')
    expect(problem).toContain('blanco y negro')
    // And without the file's real number the sentence is of no use for deciding.
    expect(problem).toContain('«expediente 1985.pdf»')
  })

  it('justo en el límite entra: el almacén acepta el límite, no lo rechaza', () => {
    expect(documentFileProblem(picked({ size: BUCKET_FILE_LIMIT_BYTES }))).toBeNull()
  })

  /** `archive_documents_file_size_positive`: a zero-byte file is a failed upload. */
  it('cero bytes es un escaneo que se cortó, y se dice así', () => {
    expect(documentFileProblem(picked({ size: 0 }))).toContain('vacío')
  })

  it('sin fichero no hay problema que avisar: registrar sin digitalizar es legítimo', () => {
    expect(documentFileProblem(null)).toBeNull()
    expect(documentFileProblem(undefined)).toBeNull()
  })

  /**
   * The bucket does not declare `allowed_mime_types` —checked— and the archive keeps
   * letters, clippings, posters and whatever turns up. A whitelist here would reject
   * precisely the format nobody foresaw.
   */
  it('no se rechaza ningún tipo de fichero', () => {
    expect(documentFileProblem(picked({ name: 'cinta.wav', type: 'audio/wav' }))).toBeNull()
    expect(documentFileProblem(picked({ name: 'x', type: '' }))).toBeNull()
  })
})

describe('dónde aterriza el fichero, que NUNCA es donde están las fotografías', () => {
  it('su propio prefijo, la signatura y un sufijo aleatorio', () => {
    expect(documentObjectPath(DOCUMENT, picked(), 'k3m9p2qz')).toBe(
      'archivo/ar-arch-0001_k3m9p2qz.pdf',
    )
  })

  /**
   * A PHOTOGRAPH'S ARCHIVE ORIGINAL IS UNALTERABLE. A photo's files
   * hang from `<CATALOG_ID>/…`; here no cataloguing identifier comes in,
   * so the two families of names cannot coincide by arithmetic and not by
   * care.
   */
  it('ninguna ruta lleva el código de la obra, así que no puede pisar una foto', () => {
    const path = documentObjectPath(
      { archive_code: null, title: 'Recorte sobre AR-0001' },
      picked(),
      'aaaa1111',
    )
    expect(path.startsWith(`${ARCHIVE_PREFIX}/`)).toBe(true)
    expect(path).toBe('archivo/recorte-sobre-ar-0001_aaaa1111.pdf')
    // A photo's path is «AR-0001/AR-0001_xxxx_master.jpg»: with no slash inside the
    // name, this file cannot land in any artwork's folder.
    expect(path.slice(ARCHIVE_PREFIX.length + 1)).not.toContain('/')
  })

  it('sin signatura manda el título', () => {
    expect(
      documentObjectPath({ archive_code: null, title: 'Daño en el ángulo' }, picked(), 'bbbb2222'),
    ).toBe('archivo/dano-en-el-angulo_bbbb2222.pdf')
  })

  it('un título largo se corta por un guion, no por media palabra', () => {
    const path = documentObjectPath(
      {
        archive_code: '  ',
        title: 'Correspondencia con la galería de arte contemporáneo de Badajoz sobre la muestra',
      },
      picked(),
      'cccc3333',
    )
    expect(path).toBe('archivo/correspondencia-con-la-galeria-de-arte_cccc3333.pdf')
  })

  it('un título que no deja ni una letra utilizable no da una ruta vacía', () => {
    expect(documentObjectPath({ archive_code: null, title: '···' }, picked(), 'dddd4444')).toBe(
      'archivo/documento_dddd4444.pdf',
    )
  })

  it('dos subidas del mismo documento dan dos rutas: nada se sobrescribe nunca', () => {
    const one = documentObjectPath(DOCUMENT, picked())
    const two = documentObjectPath(DOCUMENT, picked())
    expect(one).not.toBe(two)
  })
})

describe('la extensión, que decide con qué nombre se baja después (RF-411)', () => {
  it('la del fichero que el escáner escribió', () => {
    expect(extensionForFile(picked({ name: 'EXPEDIENTE.PDF' }))).toBe('pdf')
    expect(extensionForFile(picked({ name: 'folio.tif', type: 'image/tiff' }))).toBe('tif')
  })

  it('sin extensión en el nombre, la del tipo que dijo el navegador', () => {
    expect(extensionForFile(picked({ name: 'expediente' }))).toBe('pdf')
    expect(extensionForFile(picked({ name: 'escaneo', type: 'image/jpeg' }))).toBe('jpg')
  })

  it('y si no se sabe, ninguna: una extensión que miente abre en el programa equivocado', () => {
    expect(extensionForFile(picked({ name: 'cinta', type: 'audio/x-raro' }))).toBeNull()
    expect(extensionForFile(picked({ name: 'cosa', type: '' }))).toBeNull()
    expect(documentObjectPath(DOCUMENT, picked({ name: 'cosa', type: '' }), 'eeee5555')).toBe(
      'archivo/ar-arch-0001_eeee5555',
    )
  })
})

describe('las cuatro columnas del fichero, juntas o ninguna', () => {
  /** `archive_documents_file_all_or_nothing`: half a file description does not exist. */
  it('se construyen de una vez, así que nunca pueden viajar tres', () => {
    const columns = fileColumns('archivo/x_aaaa.pdf', picked(), new Date('2026-08-04T10:00:00Z'))
    expect(columns).toEqual({
      file_path: 'archivo/x_aaaa.pdf',
      file_size_bytes: 3_355_443,
      mime_type: 'application/pdf',
      uploaded_at: '2026-08-04T10:00:00.000Z',
    })
    expect(Object.values(columns).every((value) => value !== null)).toBe(true)
  })

  /** `archive_documents_mime_type_shape` rejects the empty string. */
  it('un fichero que el navegador no clasifica no deja la columna en blanco', () => {
    expect(mimeForFile(picked({ type: '' }))).toBe('application/octet-stream')
    expect(mimeForFile(picked({ type: '   ' }))).toBe('application/octet-stream')
    expect(mimeForFile(picked())).toBe('application/pdf')
  })
})

describe('cuando el almacén dice no, medido contra el almacén local', () => {
  /**
   * All three arrive as HTTP 400 with the real status inside the body, which is
   * why the mapping looks at `statusCode` and not `status`. Provoked with a real
   * Cataloguer's token and with the anonymous one.
   */
  it('413 «The object exceeded the maximum allowed size» se lee con el número', () => {
    const said = describeStorageFailure({
      statusCode: '413',
      message: 'The object exceeded the maximum allowed size',
    })
    expect(said).toContain('60,0 MB')
    expect(said).not.toContain('exceeded')
  })

  it('409 «The resource already exists» dice que no se sobrescribe', () => {
    const said = describeStorageFailure({
      statusCode: '409',
      message: 'The resource already exists',
    })
    expect(said).toContain('no se sobrescribe')
    expect(said).not.toContain('already exists')
  })

  it('403 «new row violates row-level security policy» se lee como permiso', () => {
    const said = describeStorageFailure({
      statusCode: '403',
      message: 'new row violates row-level security policy',
    })
    expect(said).toContain('permiso')
    expect(said).not.toMatch(/row-level|policy/)
  })

  it('un corte de conexión se cuenta como lo que es, y dice que no hay nada a medias', () => {
    const said = describeStorageFailure({ message: 'TypeError: Failed to fetch' })
    expect(said).toContain('conexión')
    expect(said).toContain('No se ha registrado nada')
  })

  it('y un fallo sin mensaje tampoco deja el botón mudo', () => {
    expect(describeStorageFailure(null)).toContain('No se ha registrado nada')
  })
})

// ── The whole path: upload, register, link ────────────────────

function deps(over: Partial<UploadDocumentDeps> = {}) {
  const calls: string[] = []
  const base: UploadDocumentDeps = {
    upload: async (path) => {
      calls.push(`upload:${path}`)
      return null
    },
    insert: async (columns) => {
      calls.push(`insert:${JSON.stringify(columns.file_path ?? null)}`)
      return { id: 'doc-1' }
    },
    link: async (documentId, note) => {
      calls.push(`link:${documentId}:${note}`)
      return null
    },
    now: () => new Date('2026-08-04T10:00:00Z'),
    suffix: () => 'k3m9p2qz',
    ...over,
  }
  return { calls, base }
}

const PLAN = {
  catalogId: 'AR-0001',
  document: { ...DOCUMENT, title: 'Carta de la galería' },
  file: picked(),
  linkNote: '  reproducida en la página 3  ',
}

describe('subir, registrar y enlazar, en ese orden (RF-408, RF-516)', () => {
  /**
   * The order is the same one `uploadShot` argues and for the same reason: a stray
   * file in the store breaks nothing and can be cleaned up; a row claiming to have
   * a file that never arrived is a download button that fails forever.
   */
  it('los bytes primero, la fila después y el vínculo al final', async () => {
    const { calls, base } = deps()
    const steps: UploadStep[] = []
    const outcome = await runDocumentUpload(PLAN, { ...base, onStep: (step) => steps.push(step) })

    expect(outcome.ok).toBe(true)
    expect(calls).toEqual([
      'upload:archivo/ar-arch-0001_k3m9p2qz.pdf',
      'insert:"archivo/ar-arch-0001_k3m9p2qz.pdf"',
      'link:doc-1:reproducida en la página 3',
    ])
    expect(steps.map((step) => UPLOAD_STEP_TEXT[step])).toEqual([
      'Subiendo el fichero…',
      'Registrando el documento…',
      'Enlazando con la obra…',
    ])
  })

  it('la fila lleva las cuatro columnas del fichero y ninguna a medias', async () => {
    const insert = vi.fn(async () => ({ id: 'doc-1' }))
    const { base } = deps({ insert })
    await runDocumentUpload(PLAN, base)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Carta de la galería',
        file_path: 'archivo/ar-arch-0001_k3m9p2qz.pdf',
        file_size_bytes: 3_355_443,
        mime_type: 'application/pdf',
        uploaded_at: '2026-08-04T10:00:00.000Z',
      }),
    )
  })

  /** RF-408: a document that exists only on paper is a state of the archive, not an error. */
  it('sin fichero no se sube nada y el documento queda «sin digitalizar»', async () => {
    const { calls, base } = deps()
    const outcome = await runDocumentUpload({ ...PLAN, file: null }, base)
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['insert:null', 'link:doc-1:reproducida en la página 3'])
    expect(outcome.ok && outcome.notice).toContain('sin digitalizar')
  })

  it('un fichero imposible se rechaza antes de gastar la conexión', async () => {
    const { calls, base } = deps()
    const outcome = await runDocumentUpload(
      { ...PLAN, file: picked({ size: BUCKET_FILE_LIMIT_BYTES + 1 }) },
      base,
    )
    expect(outcome.ok).toBe(false)
    expect(calls).toEqual([])
    expect(!outcome.ok && outcome.problem).toContain('60,0 MB')
  })

  it('si el fichero no sube, no se registra nada y se puede repetir sin duplicar', async () => {
    const { calls, base } = deps({
      upload: async () => ({ statusCode: '403', message: 'new row violates row-level security policy' }),
    })
    const outcome = await runDocumentUpload(PLAN, base)
    expect(outcome.ok).toBe(false)
    expect(calls).toEqual([])
    expect(!outcome.ok && outcome.problem).toContain('permiso')
    expect(!outcome.ok && outcome.documentId).toBeUndefined()
  })

  it('si la fila no entra, se dice que el fichero se queda suelto y que no estorba', async () => {
    const { base } = deps({
      insert: async () => ({ error: 'Ya hay otro documento en el archivo con esa signatura.' }),
    })
    const outcome = await runDocumentUpload(PLAN, base)
    expect(outcome.ok).toBe(false)
    expect(!outcome.ok && outcome.problem).toContain('esa signatura')
    expect(!outcome.ok && outcome.problem).toContain('suelto en el almacén')
    expect(!outcome.ok && outcome.documentId).toBeUndefined()
  })

  it('sin fichero, ese mismo fallo no habla de ningún fichero suelto', async () => {
    const { base } = deps({ insert: async () => ({ error: 'No se ha podido registrar.' }) })
    const outcome = await runDocumentUpload({ ...PLAN, file: null }, base)
    expect(!outcome.ok && outcome.problem).toBe('No se ha podido registrar.')
  })

  /**
   * The case that decides whether the catalogue ends up with two copies of the same PDF: the
   * document is ALREADY in the archive and only the bridge is missing. Uploading it again
   * would duplicate the file and the record, so what is said is «enlázalo».
   */
  it('si solo falla el vínculo, el documento está en el archivo y NO se vuelve a subir', async () => {
    const { base } = deps({
      link: async () =>
        'La documentación de la obra AR-0001 consta investigada sin resultado y este vínculo la contradice.',
    })
    const outcome = await runDocumentUpload(PLAN, base)
    expect(outcome.ok).toBe(false)
    expect(!outcome.ok && outcome.documentId).toBe('doc-1')
    expect(!outcome.ok && outcome.problem).toContain('ya está en el archivo con su fichero')
    expect(!outcome.ok && outcome.problem).toContain('NO vuelvas a subirlo')
    expect(!outcome.ok && outcome.problem).toContain('Enlazar un documento del archivo')
    // And the base's sentence travels as is: it was written in Spanish and for her.
    expect(!outcome.ok && outcome.problem).toContain('consta investigada sin resultado')
  })
})

describe('lo que se dice cuando ha funcionado', () => {
  /**
   * Keeping quiet on success is a real failure on a phone: the sheet closes, the
   * page does not move and the tap looks like it did nothing.
   */
  it('nombra las dos cosas que se han hecho, porque son dos', () => {
    const said = uploadedNotice({ document: DOCUMENT, file: picked() })
    expect(said).toContain('«Carta de la galería»')
    expect(said).toContain('en el archivo')
    expect(said).toContain('enlazado con esta obra')
    expect(said).toContain('3,2 MB')
  })

  it('sin fichero dice lo que le importa: que consta solo en papel', () => {
    const said = uploadedNotice({ document: DOCUMENT, file: null })
    expect(said).toContain('sin digitalizar')
    expect(said).toContain('solo está en papel')
  })

  it('sin título no deja unas comillas vacías', () => {
    expect(uploadedNotice({ document: { title: '  ' }, file: null })).toMatch(/^El documento/)
  })
})

// ── The scan an already registered document was missing ───────

/**
 * `runAddScan` is the half the creation was missing: a document registered «sin
 * digitalizar» was a state with no way out, and the upload panel warned about it
 * before saving precisely because there was no screen that fixed it.
 *
 * What these tests pin down is the ORDER —the bytes before the row, for the same
 * reason as in the creation— and the failure that only exists here: that somebody has got
 * there first between the panel opening and the «Añadir».
 */
function scanDeps(over: Partial<AddScanDeps> = {}) {
  const calls: string[] = []
  const base: AddScanDeps = {
    upload: async (path) => {
      calls.push(`upload:${path}`)
      return null
    },
    attach: async (columns) => {
      calls.push(`attach:${columns.file_path}:${columns.file_size_bytes}:${columns.mime_type}`)
      return null
    },
    now: () => new Date('2026-08-05T10:00:00Z'),
    suffix: () => 'k3m9p2qz',
    ...over,
  }
  return { calls, base }
}

const REGISTERED = { id: 'doc-1', archive_code: 'AR-ARCH-0001', title: 'Carta de la galería' }

describe('añadir el escaneo a un documento que ya está en el archivo (RF-408)', () => {
  it('los bytes primero y la anotación después', async () => {
    const { calls, base } = scanDeps()
    const steps: ScanStep[] = []
    const outcome = await runAddScan(REGISTERED, picked(), {
      ...base,
      onStep: (step) => steps.push(step),
    })

    expect(outcome).toEqual({ ok: true, path: 'archivo/ar-arch-0001_k3m9p2qz.pdf' })
    expect(calls).toEqual([
      'upload:archivo/ar-arch-0001_k3m9p2qz.pdf',
      'attach:archivo/ar-arch-0001_k3m9p2qz.pdf:3355443:application/pdf',
    ])
    expect(steps.map((step) => SCAN_STEP_TEXT[step])).toEqual([
      'Subiendo el escaneo…',
      'Anotándolo en el documento…',
    ])
  })

  it('la ruta no lleva el identificador de la obra desde la que se sube', async () => {
    // The document belongs to the archive: one linked to three artworks cannot have three
    // names. It is the same decision the download took.
    const { calls, base } = scanDeps()
    await runAddScan(REGISTERED, picked(), base)
    expect(calls[0]).not.toContain('AR-0001')
    expect(calls[0]).toContain(`${ARCHIVE_PREFIX}/`)
  })

  it('un fichero vacío se rechaza antes de gastar la conexión', async () => {
    const { calls, base } = scanDeps()
    const outcome = await runAddScan(REGISTERED, picked({ size: 0 }), base)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.problem).toContain('0 bytes')
    // And nothing has been called: in a storeroom, uploading only to be told no costs
    // a quarter of an hour and somebody's data plan.
    expect(calls).toEqual([])
  })

  it('uno que no cabe tampoco sube', async () => {
    const { calls, base } = scanDeps()
    const outcome = await runAddScan(
      REGISTERED,
      picked({ size: BUCKET_FILE_LIMIT_BYTES + 1 }),
      base,
    )
    expect(outcome.ok).toBe(false)
    expect(calls).toEqual([])
  })

  it('si el fichero no sube, no se anota nada', async () => {
    const { calls, base } = scanDeps({
      upload: async () => ({ message: 'Payload too large', statusCode: '413' }),
    })
    const outcome = await runAddScan(REGISTERED, picked(), base)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.problem).toContain('tamaño')
    expect(calls).toEqual([])
  })

  it('si la anotación no entra, se dice lo que dijo la base y el fichero queda suelto', async () => {
    // It is the harmless failure: a file in the store no row points at does not
    // break anything. The opposite —a row promising a file that never arrived— is a
    // download button broken forever.
    const { base } = scanDeps({
      attach: async () => 'No se ha añadido el escaneo. Lo más probable es que ya tenga uno.',
    })
    const outcome = await runAddScan(REGISTERED, picked(), base)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.problem).toContain('ya tenga uno')
  })

  it('un documento sin signatura se nombra por el título', async () => {
    const { calls, base } = scanDeps()
    await runAddScan({ id: 'doc-2', archive_code: null, title: 'Recorte de prensa' }, picked(), base)
    expect(calls[0]).toBe('upload:archivo/recorte-de-prensa_k3m9p2qz.pdf')
  })
})
