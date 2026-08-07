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
 * El perímetro de la subida por partes, comprobado desde aquí.
 *
 * Igual que `signFilePaths.test.ts`, y por el mismo motivo: no hay Deno en este
 * entorno, así que lo que se quede dentro de la función Edge no lo verifica nadie —
 * y esta es la ruta por la que se escribe el máster, que es el documento de archivo.
 * Lo que decide y lo que construye vive en un módulo sin API de Deno para que la
 * batería que sí corre pueda cubrirlo.
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
    // Vuelve del almacén y va derecho a una cadena de consulta y al cuerpo XML de la
    // terminación. Esta función firma con credenciales que el cliente no ve nunca, así
    // que un identificador con «&» o con «<» sería una forma de moldear una petición
    // desde fuera. Los de verdad son testigos opacos: el juego se deja estrecho.
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
    // Terminar con la parte 2 perdida guarda un objeto más corto que el original y lo
    // deja registrado como almacenado. Para el documento de archivo es el peor final
    // posible de todo este camino, porque no se nota.
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
    // S3 mantiene la conexión abierta mientras ensambla el objeto y solo entonces
    // escribe el cuerpo, así que la línea de estado ya salió cuando se sabe el
    // resultado: un fallo llega como un documento <Error> bajo un 200. Fiarse del
    // estado aquí es cómo un máster truncado o inexistente queda registrado como
    // guardado, y eso no se nota hasta que alguien abre el fichero años después.
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
    // «No lo sé» no puede leerse como «está bien»: es la última comprobación que
    // separa un máster truncado de uno registrado como guardado.
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
    // Backblaze documenta 5 MB y AWS 5 MiB. Se coge el mayor: quedarse corto produce
    // subidas que el almacén rechaza AL TERMINAR, cuando ya se han mandado todos los
    // bytes, que es el peor momento posible para enterarse.
    expect(MULTIPART_MIN_PART_BYTES).toBe(5_242_880)
    expect(MULTIPART_MIN_PART_BYTES).toBeGreaterThanOrEqual(5_000_000)
  })
})
