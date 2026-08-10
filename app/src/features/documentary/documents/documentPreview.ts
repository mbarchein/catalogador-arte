/**
 * Ver un documento del archivo sin bajárselo, cuando el formato lo permite
 * (RF-408, RF-411, RNF-106).
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────
 *
 * Hasta ahora un documento digitalizado solo tenía una salida: descargarlo. Y eso, con
 * una obra delante y en un almacén, es tres pasos para leer una carta —tocar, esperar,
 * buscar el fichero en las descargas del teléfono— y un fichero suelto en el móvil que
 * nadie va a borrar. Para una fotografía de archivo o un recorte escaneado en JPEG, que
 * el navegador pinta sin ayuda de nadie, es un camino absurdo.
 *
 * ── LA FRONTERA, Y POR QUÉ NO ES «LO QUE EL NAVEGADOR SEPA» ──
 *
 * Solo se enseña dentro de la aplicación lo que **todos** los navegadores de la gama
 * declarada pintan en un `<img>`: JPEG, PNG, WebP, GIF y AVIF. Fuera se quedan dos que
 * parecen imágenes y no lo son a estos efectos:
 *
 *   · **TIFF**, que es el formato de un escaneado de archivo de verdad y que **ningún**
 *     navegador pinta. Ofrecer «Ver» sobre un TIFF daría un hueco negro con el icono de
 *     imagen rota, que es peor que no ofrecer nada.
 *   · **HEIC**, que Safari pinta y Chrome no. Un botón que funciona en un teléfono y no
 *     en el de al lado es un botón que se deja de usar en los dos.
 *
 * Y el **PDF** —que es lo que más hay en el archivo, porque un expediente de varias
 * hojas se sube como un solo PDF (RF-408)— se abre **aparte**, en el visor del propio
 * navegador, y no dentro de la aplicación. Un `<iframe>` con un PDF en el Safari de un
 * iPhone enseña la primera página, escalada y sin poder pasar de ella: para un
 * expediente de doce hojas eso no es verlo, es aparentar que se ve. El visor del sistema
 * pasa páginas, busca texto y hace zoom, y esas tres cosas no se van a reimplementar
 * aquí.
 *
 * ── EL PESO SIGUE CONTANDO ──────────────────────────────────
 *
 * Verlo cuesta los mismos bytes que bajarlo, así que el aviso de peso vale igual para el
 * botón de ver. Lo decide `weightWarning`, que ya estaba.
 *
 * Todo se decide sin navegador: la batería corre en node.
 */

import { storedExtension } from '../../artworks/archiveDownloads'

/**
 * Cómo se puede ver este fichero sin descargarlo.
 *
 * - `image`: la aplicación lo pinta ella misma, a pantalla completa y sin salir de la
 *   aplicación — que en la PWA instalada es la diferencia entre mirar un documento y
 *   perder de vista la ficha.
 * - `newTab`: lo abre el visor del navegador, que para un PDF hace tres cosas que esto
 *   no va a hacer.
 */
export type DocumentPreviewKind = 'image' | 'newTab'

/** The types painted in an `<img>` across the whole declared range of browsers. */
const INLINE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])

/**
 * Las extensiones equivalentes, para cuando el tipo declarado no sirve.
 *
 * Hace falta de verdad y no es cinturón y tirantes: `mime_type` es lo que el navegador
 * dijo al subir el fichero, y hay caminos —algunos gestores de ficheros de Android, un
 * fichero llegado por Bluetooth, un adjunto reenviado— que declaran
 * `application/octet-stream` sobre un JPEG perfectamente normal. Con la extensión hay
 * respuesta; sin ella, el documento se quedaría con el botón de descargar por un dato
 * que no es suyo.
 */
const INLINE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])

/** The declared type, without its parameters and in lower case. Empty string if it says nothing. */
function bareType(mime: string | null | undefined): string {
  if (typeof mime !== 'string') return ''
  return mime.split(';')[0]?.trim().toLowerCase() ?? ''
}

/**
 * Cómo se puede ver este documento, o null cuando la única salida es descargarlo.
 *
 * El tipo declarado manda, y la extensión solo entra cuando el tipo no contesta: un
 * fichero que dice ser `image/tiff` y se llama `.jpg` es más probablemente un TIFF
 * renombrado que un JPEG mal declarado, y pintarlo daría la imagen rota.
 */
export function documentPreviewKind(file: {
  file_path: string | null
  mime_type: string | null
}): DocumentPreviewKind | null {
  const path = (file.file_path ?? '').trim()
  if (path === '') return null

  const type = bareType(file.mime_type)
  if (type !== '') {
    if (INLINE_IMAGE_TYPES.has(type)) return 'image'
    if (type === 'application/pdf') return 'newTab'
    // Un tipo declarado que no está en ninguna de las dos listas es una respuesta, no
    // un silencio: `image/tiff` y `image/heic` llegan aquí y se quedan sin «Ver» a
    // propósito.
    return null
  }

  const extension = storedExtension(path)
  if (extension === null) return null
  if (INLINE_IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (extension === 'pdf') return 'newTab'
  return null
}

/**
 * Lo que dice el botón de ver, con el peso dentro.
 *
 * El peso va **en el botón** por lo mismo que en el de descargar: verlo se trae el
 * fichero entero, así que cuesta los mismos datos, y lo que cuesta tiene que leerse en
 * la misma mirada que lo que hace (RNF-106).
 */
export function previewLabel(kind: DocumentPreviewKind, sizeText: string | null): string {
  const verb = kind === 'image' ? 'Ver el documento' : 'Abrir el PDF'
  return sizeText === null ? verb : `${verb} (${sizeText})`
}

/**
 * Lo que se lee debajo del botón de ver, o null cuando no hay nada que advertir.
 *
 * El PDF se abre fuera, y decirlo antes evita el desconcierto de que la aplicación
 * desaparezca de la pantalla —en la PWA instalada, además, se va a otra ventana—. Para
 * una imagen no hay nada que avisar: se abre encima y se cierra con el botón de atrás.
 */
export function previewHint(kind: DocumentPreviewKind): string | null {
  if (kind === 'image') return null
  return 'Se abre en el visor del navegador, fuera de la aplicación.'
}

/**
 * Lo que se dice cuando el visor del navegador no se ha abierto.
 *
 * Pasa de verdad: un bloqueador de ventanas emergentes puede pararlo, y el navegador no
 * avisa de nada. Sin esta frase el toque parece no haber hecho nada, y el camino que
 * siempre funciona —descargarlo— está justo al lado y no se ve.
 */
export const PREVIEW_BLOCKED_TEXT =
  'El navegador no ha dejado abrir el visor: puede tener bloqueadas las ventanas nuevas. ' +
  'Descárgalo con el botón de al lado y se abrirá con el visor del teléfono.'

/**
 * Lo que se dice cuando la imagen no se ha podido pintar, ya con el permiso concedido.
 *
 * Es el caso raro de verdad: el fichero está, la firma entró y el navegador no ha podido
 * con el contenido —un fichero corrupto, o un tipo declarado que miente—. Se manda a
 * descargarlo, que es la salida que no depende de que el navegador sepa pintarlo.
 */
export const PREVIEW_IMAGE_FAILED_TEXT =
  'Esta imagen no se ha podido mostrar aquí. Descárgala y ábrela con el visor del teléfono: ' +
  'puede que el fichero esté dañado o que no sea del formato que dice ser.'
