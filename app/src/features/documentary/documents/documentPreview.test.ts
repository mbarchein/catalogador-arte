import { describe, expect, it } from 'vitest'
import {
  documentPreviewKind,
  PREVIEW_BLOCKED_TEXT,
  PREVIEW_IMAGE_FAILED_TEXT,
  previewHint,
  previewLabel,
} from './documentPreview'

/**
 * Ver un documento del archivo sin bajárselo (RF-408, RF-411, RNF-106).
 *
 * Lo que fija esta batería es **la frontera**, que es donde este botón se rompe: ofrecer
 * «Ver» sobre algo que el navegador no pinta da un hueco negro con el icono de imagen
 * rota, y eso es peor que no ofrecer nada. Los dos casos que parecen imágenes y no lo son
 * a estos efectos —TIFF, que ningún navegador pinta y que es justo el formato de un
 * escaneado de archivo de verdad, y HEIC, que Safari pinta y Chrome no— tienen aquí su
 * test cada uno, porque los dos se colarían solos si la regla fuera «empieza por
 * image/».
 */

describe('documentPreviewKind, qué se puede ver y qué solo se descarga', () => {
  it('las imágenes que pinta cualquier navegador se ven dentro de la aplicación', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']) {
      expect(documentPreviewKind({ file_path: 'archivo/x.bin', mime_type: mime })).toBe('image')
    }
  })

  it('el tipo declarado se lee sin sus parámetros y sin importar las mayúsculas', () => {
    expect(
      documentPreviewKind({ file_path: 'archivo/x', mime_type: 'IMAGE/JPEG; charset=binary' }),
    ).toBe('image')
  })

  it('un TIFF no se ofrece, aunque sea una imagen: no lo pinta NINGÚN navegador', () => {
    // And it is the format of a real archive scan, so it is going to turn up.
    expect(documentPreviewKind({ file_path: 'archivo/x.tif', mime_type: 'image/tiff' })).toBeNull()
  })

  it('un HEIC tampoco: Safari lo pinta y Chrome no', () => {
    // A button that works on one phone and not on the one next to it stops being used on
    // both, and the failure does not look like a failure.
    expect(documentPreviewKind({ file_path: 'archivo/x.heic', mime_type: 'image/heic' })).toBeNull()
  })

  it('un PDF se abre aparte, en el visor del navegador', () => {
    expect(documentPreviewKind({ file_path: 'archivo/x.pdf', mime_type: 'application/pdf' })).toBe(
      'newTab',
    )
  })

  it('un documento de Word no se ve de ninguna forma: solo se descarga', () => {
    expect(
      documentPreviewKind({ file_path: 'archivo/x.docx', mime_type: 'application/msword' }),
    ).toBeNull()
  })

  it('sin fichero no hay nada que ver', () => {
    expect(documentPreviewKind({ file_path: null, mime_type: 'image/jpeg' })).toBeNull()
    expect(documentPreviewKind({ file_path: '   ', mime_type: 'image/jpeg' })).toBeNull()
  })
})

describe('documentPreviewKind, cuando el tipo declarado no sirve', () => {
  it('sin tipo, la extensión contesta', () => {
    // Pasa de verdad: hay caminos —un gestor de ficheros de Android, un adjunto
    // reenviado— que declaran `application/octet-stream` sobre un JPEG normal, y sin
    // esto el documento se quedaría sin «Ver» por un dato que no es suyo.
    expect(documentPreviewKind({ file_path: 'archivo/carta.JPG', mime_type: null })).toBe('image')
    expect(documentPreviewKind({ file_path: 'archivo/expediente.pdf', mime_type: '' })).toBe(
      'newTab',
    )
    expect(documentPreviewKind({ file_path: 'archivo/x.tif', mime_type: null })).toBeNull()
  })

  it('sin tipo y sin extensión, tampoco se adivina', () => {
    expect(documentPreviewKind({ file_path: 'archivo/carta', mime_type: null })).toBeNull()
  })

  it('pero el tipo declarado MANDA sobre la extensión', () => {
    // A file claiming to be TIFF and named `.jpg` is more likely a renamed TIFF
    // than a badly declared JPEG, and painting it would give the broken image.
    expect(documentPreviewKind({ file_path: 'archivo/x.jpg', mime_type: 'image/tiff' })).toBeNull()
  })
})

describe('lo que dicen el botón y su letra pequeña', () => {
  it('el peso va EN el botón, porque verlo cuesta los mismos datos que bajarlo', () => {
    expect(previewLabel('image', '3,2 MB')).toBe('Ver el documento (3,2 MB)')
    expect(previewLabel('newTab', '12,4 MB')).toBe('Abrir el PDF (12,4 MB)')
  })

  it('y sin peso registrado el botón no deja un paréntesis vacío', () => {
    expect(previewLabel('image', null)).toBe('Ver el documento')
    expect(previewLabel('newTab', null)).toBe('Abrir el PDF')
  })

  it('del PDF se avisa que se abre fuera; de la imagen no hay nada que avisar', () => {
    expect(previewHint('newTab')).toContain('fuera de la aplicación')
    expect(previewHint('image')).toBeNull()
  })

  it('y los dos fallos mandan a descargarlo, que es la salida que siempre funciona', () => {
    expect(PREVIEW_BLOCKED_TEXT).toContain('Descárgalo')
    expect(PREVIEW_IMAGE_FAILED_TEXT).toContain('Descárgala')
  })
})
