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
 * Subir el fichero escaneado de un documento de archivo y enlazarlo con la obra
 * (RF-408, RF-110, RF-516, RF-517).
 *
 * Todo se decide sin navegador, que es la única manera de que esta batería lo
 * verifique: `File` es un tipo del DOM y aquí se usa su forma, y los tres bordes
 * impuros —subir, insertar, vincular— se inyectan.
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
   * 62 914 560 bytes = 60 MiB, leídos de `storage.buckets` de la base en marcha, que
   * es lo que puso `20260726010000_imagenes.sql` y no ha cambiado ninguna migración.
   * El almacén contesta a un byte más con HTTP 400 y
   * `{"statusCode":"413","message":"The object exceeded the maximum allowed size"}`,
   * en inglés y sin decir el número: por eso el número está aquí.
   */
  it('son 62 914 560 bytes, 60 MiB', () => {
    expect(BUCKET_FILE_LIMIT_BYTES).toBe(62_914_560)
    expect(BUCKET_FILE_LIMIT_BYTES).toBe(60 * 1_048_576)
  })

  it('un expediente escaneado en blanco y negro cabe holgado', () => {
    // ~200 páginas a 300 ppp en blanco y negro rondan los 12 MB.
    expect(documentFileProblem(picked({ size: 12 * 1_048_576 }))).toBeNull()
  })

  it('uno en color de unas decenas de páginas también, y avisa de su peso al bajarlo', () => {
    expect(documentFileProblem(picked({ size: 45 * 1_048_576 }))).toBeNull()
  })

  it('pasado el límite se dice antes de subir, con los dos números y qué hacer', () => {
    const problem = documentFileProblem(picked({ size: BUCKET_FILE_LIMIT_BYTES + 1 }))
    expect(problem).toContain('60,0 MB')
    expect(problem).toContain('blanco y negro')
    // Y sin el número real del fichero la frase no sirve para decidir.
    expect(problem).toContain('«expediente 1985.pdf»')
  })

  it('justo en el límite entra: el almacén acepta el límite, no lo rechaza', () => {
    expect(documentFileProblem(picked({ size: BUCKET_FILE_LIMIT_BYTES }))).toBeNull()
  })

  /** `archive_documents_file_size_positive`: un fichero de cero bytes es una subida fallida. */
  it('cero bytes es un escaneo que se cortó, y se dice así', () => {
    expect(documentFileProblem(picked({ size: 0 }))).toContain('vacío')
  })

  it('sin fichero no hay problema que avisar: registrar sin digitalizar es legítimo', () => {
    expect(documentFileProblem(null)).toBeNull()
    expect(documentFileProblem(undefined)).toBeNull()
  })

  /**
   * El bucket no declara `allowed_mime_types` —comprobado— y el archivo guarda
   * cartas, recortes, carteles y lo que aparezca. Una lista blanca aquí rechazaría
   * justo el formato que nadie previó.
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
   * EL ORIGINAL DE ARCHIVO DE UNA FOTOGRAFÍA ES INALTERABLE. Los ficheros de una
   * foto cuelgan de `<CATALOG_ID>/…`; aquí no entra ningún identificador de
   * catalogación, así que las dos familias de nombres no pueden coincidir por
   * aritmética y no por cuidado.
   */
  it('ninguna ruta lleva el código de la obra, así que no puede pisar una foto', () => {
    const path = documentObjectPath(
      { archive_code: null, title: 'Recorte sobre AR-0001' },
      picked(),
      'aaaa1111',
    )
    expect(path.startsWith(`${ARCHIVE_PREFIX}/`)).toBe(true)
    expect(path).toBe('archivo/recorte-sobre-ar-0001_aaaa1111.pdf')
    // La ruta de una foto es «AR-0001/AR-0001_xxxx_master.jpg»: sin barra dentro del
    // nombre, este fichero no puede caer en la carpeta de ninguna obra.
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
  /** `archive_documents_file_all_or_nothing`: media descripción de un fichero no existe. */
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

  /** `archive_documents_mime_type_shape` rechaza la cadena vacía. */
  it('un fichero que el navegador no clasifica no deja la columna en blanco', () => {
    expect(mimeForFile(picked({ type: '' }))).toBe('application/octet-stream')
    expect(mimeForFile(picked({ type: '   ' }))).toBe('application/octet-stream')
    expect(mimeForFile(picked())).toBe('application/pdf')
  })
})

describe('cuando el almacén dice no, medido contra el almacén local', () => {
  /**
   * Los tres llegan como HTTP 400 con el estado de verdad dentro del cuerpo, que es
   * por lo que el mapeo mira `statusCode` y no `status`. Provocados con el token de
   * un Catalogador real y con el anónimo.
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

// ── El camino entero: subir, registrar, enlazar ───────────────

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
   * El orden es el mismo que argumenta `uploadShot` y por lo mismo: un fichero
   * suelto en el almacén no rompe nada y se puede limpiar; una fila que dice tener
   * un fichero que no llegó es un botón de descarga que falla para siempre.
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

  /** RF-408: un documento que solo está en papel es un estado del archivo, no un error. */
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
   * El caso que decide si el catálogo acaba con dos copias del mismo PDF: el
   * documento YA está en el archivo y solo falta el puente. Volver a subirlo
   * duplicaría el fichero y la ficha, así que lo que se dice es «enlázalo».
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
    // Y la frase de la base viaja tal cual: la escribió en español y para ella.
    expect(!outcome.ok && outcome.problem).toContain('consta investigada sin resultado')
  })
})

describe('lo que se dice cuando ha funcionado', () => {
  /**
   * Callar en el éxito es un fallo de verdad en el móvil: la hoja se cierra, la
   * página no se mueve y el toque parece no haber hecho nada.
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

// ── El escaneo que le faltaba a un documento ya registrado ────

/**
 * `runAddScan` es la mitad que le faltaba al alta: un documento registrado «sin
 * digitalizar» era un estado del que no se salía, y el panel de subida lo advertía
 * antes de guardar precisamente porque no había ninguna pantalla que lo arreglara.
 *
 * Lo que estos tests fijan es el ORDEN —los bytes antes de la fila, por el mismo
 * motivo que en el alta— y el fallo que solo existe aquí: que alguien se haya
 * adelantado entre que el panel se abrió y el «Añadir».
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
    // El documento es del archivo: uno enlazado con tres obras no puede tener tres
    // nombres. Es la misma decisión que tomó la descarga.
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
    // Y no se ha llamado a nada: en un almacén, subir para que le digan que no cuesta
    // un cuarto de hora y el plan de datos de alguien.
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
    // Es el fallo inofensivo: un fichero en el almacén al que no apunta ninguna fila no
    // rompe nada. Lo contrario —una fila prometiendo un fichero que no llegó— es un
    // botón de descarga roto para siempre.
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
