import { describe, expect, it } from 'vitest'
import {
  MULTIPART_MIN_PART_BYTES,
  completeXml,
  completedOk,
  partsInOrder,
  sizeMatches,
  uploadIdFrom,
  validPartNumber,
  validUploadId,
} from '../../../supabase/functions/sign-file/multipart'

/**
 * The multipart upload's perimeter, checked from here.
 *
 * Same as `signFilePaths.test.ts`, and for the same reason: there is no Deno in this
 * environment, so whatever stays inside the Edge function is verified by nobody —
 * and this is the route the master is written by, which is the archive document.
 * What decides and what builds lives in a module with no Deno API so the
 * suite that does run can cover it.
 */

describe('lo que se acepta de fuera', () => {
  it('el número de parte es un entero de 1 a 10 000', () => {
    expect(validPartNumber(1)).toBe(true)
    expect(validPartNumber(10_000)).toBe(true)
    expect(validPartNumber(0)).toBe(false)
    expect(validPartNumber(10_001)).toBe(false)
    expect(validPartNumber(1.5)).toBe(false)
    expect(validPartNumber('1')).toBe(false)
    expect(validPartNumber(Number.NaN)).toBe(false)
    expect(validPartNumber(undefined)).toBe(false)
  })

  it('el identificador de subida se comprueba, no se escapa', () => {
    // It comes back from the store and goes straight into a query string and into the XML body of the
    // completion. This function signs with credentials the client never sees, so
    // an identifier with «&» or with «<» would be a way of shaping a request
    // from outside. The real ones are opaque tokens: the set is kept narrow.
    expect(validUploadId('4_z27c88f1d182b150597c105_f200ec353a2184825_d2019')).toBe(true)
    expect(validUploadId('a.b~c-d_e')).toBe(true)
    expect(validUploadId('')).toBe(false)
    expect(validUploadId('con espacio')).toBe(false)
    expect(validUploadId('a&b')).toBe(false)
    expect(validUploadId('a<b')).toBe(false)
    expect(validUploadId('../otra/ruta')).toBe(false)
    expect(validUploadId('x'.repeat(513))).toBe(false)
    expect(validUploadId(42)).toBe(false)
  })
})

describe('la lista de partes que se manda a terminar', () => {
  const part = (n: number) => ({ partNumber: n, etag: `"e${n}"` })

  it('las ordena, que es como S3 las exige', () => {
    expect(partsInOrder([part(3), part(1), part(2)])?.map((p) => p.partNumber)).toEqual([1, 2, 3])
  })

  it('rechaza un hueco, que es un fichero truncado con buena pinta', () => {
    // Finishing with part 2 lost stores an object shorter than the original and
    // leaves it recorded as stored. For the archive document it is the worst possible ending
    // of this whole path, because it is not noticed.
    expect(partsInOrder([part(1), part(3)])).toBeNull()
  })

  it('rechaza una lista vacía y una parte sin etiqueta', () => {
    expect(partsInOrder([])).toBeNull()
    expect(partsInOrder([{ partNumber: 1, etag: '' }])).toBeNull()
    expect(partsInOrder([{ partNumber: 0, etag: '"e"' }])).toBeNull()
  })
})

describe('el cuerpo de la terminación', () => {
  it('lleva cada parte con su número y su etiqueta', () => {
    const xml = completeXml([
      { partNumber: 1, etag: '"aaa"' },
      { partNumber: 2, etag: '"bbb"' },
    ])
    expect(xml).toContain('<PartNumber>1</PartNumber><ETag>"aaa"</ETag>')
    expect(xml).toContain('<PartNumber>2</PartNumber><ETag>"bbb"</ETag>')
    expect(xml.startsWith('<CompleteMultipartUpload ')).toBe(true)
  })

  it('escapa lo que rompería el XML en vez de tirarlo', () => {
    expect(completeXml([{ partNumber: 1, etag: 'a&b<c>d' }])).toContain('a&amp;b&lt;c&gt;d')
  })
})

describe('lo que contesta el almacén', () => {
  it('saca el identificador de la respuesta de creación', () => {
    expect(
      uploadIdFrom('<?xml version="1.0"?><InitiateMultipartUploadResult><UploadId> 4_z27 </UploadId></InitiateMultipartUploadResult>'),
    ).toBe('4_z27')
  })

  it('contesta null cuando no viene, en vez de inventarlo', () => {
    expect(uploadIdFrom('<Error><Code>AccessDenied</Code></Error>')).toBeNull()
    expect(uploadIdFrom('')).toBeNull()
  })

  it('UN 200 CON UN <Error> DENTRO NO ES UNA TERMINACIÓN CORRECTA', () => {
    // S3 keeps the connection open while it assembles the object and only then
    // writes the body, so the status line has already gone out when the result is
    // known: a failure arrives as an <Error> document under a 200. Trusting the
    // status here is how a truncated or non-existent master ends up recorded as
    // stored, and that is not noticed until somebody opens the file years later.
    expect(
      completedOk(200, '<?xml version="1.0"?><Error><Code>InternalError</Code></Error>'),
    ).toBe(false)
  })

  it('exige el documento de resultado y no solo la ausencia de error', () => {
    expect(completedOk(200, '')).toBe(false)
    expect(completedOk(200, '<html>vaya</html>')).toBe(false)
    expect(
      completedOk(200, '<CompleteMultipartUploadResult><ETag>"x-3"</ETag></CompleteMultipartUploadResult>'),
    ).toBe(true)
  })

  it('un estado de error tampoco pasa', () => {
    expect(completedOk(500, '<CompleteMultipartUploadResult/>')).toBe(false)
  })
})

describe('el peso del fichero ya montado', () => {
  it('tiene que coincidir con lo que se mandó', () => {
    expect(sizeMatches(12_582_912, '12582912')).toBe(true)
    expect(sizeMatches(12_582_912, '10485760')).toBe(false)
  })

  it('sin cabecera no se da por bueno', () => {
    // «I do not know» cannot read as «it is fine»: it is the last check that
    // separates a truncated master from one recorded as stored.
    expect(sizeMatches(100, null)).toBe(false)
  })

  it('un tamaño que no es un entero tampoco pasa', () => {
    expect(sizeMatches(undefined, '100')).toBe(false)
    expect(sizeMatches('100', '100')).toBe(false)
    expect(sizeMatches(1.5, '1.5')).toBe(false)
    expect(sizeMatches(-1, '-1')).toBe(false)
    expect(sizeMatches(100, 'cien')).toBe(false)
  })
})

describe('el tamaño mínimo de parte', () => {
  it('es 5 MiB, que satisface a la vez a Backblaze y a AWS', () => {
    // Backblaze documents 5 MB and AWS 5 MiB. The larger is taken: falling short produces
    // uploads the store rejects ON FINISHING, when every byte has already been
    // sent, which is the worst possible moment to find out.
    expect(MULTIPART_MIN_PART_BYTES).toBe(5_242_880)
    expect(MULTIPART_MIN_PART_BYTES).toBeGreaterThanOrEqual(5_000_000)
  })
})
