import { describe, expect, it } from 'vitest'
import {
  documentPreviewKind,
  PREVIEW_BLOCKED_TEXT,
  PREVIEW_IMAGE_FAILED_TEXT,
  previewHint,
  previewLabel,
} from './documentPreview'

/**
 * Seeing an archive document without downloading it (RF-408, RF-411, RNF-106).
 *
 * What this suite pins down is **the boundary**, which is where this button breaks: offering
 * «Ver» over something the browser does not paint gives a black gap with the broken-image
 * icon, and that is worse than offering nothing. The two cases that look like images and are not
 * for these purposes —TIFF, which no browser paints and which is precisely the format of a real
 * archive scan, and HEIC, which Safari paints and Chrome does not— each have their
 * test here, because both would slip through on their own if the rule were «starts with
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
    // It really happens: there are paths —an Android file manager, a forwarded
    // attachment— that declare `application/octet-stream` over a normal JPEG, and without
    // this the document would be left with no «Ver» over a datum that is not its own.
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
