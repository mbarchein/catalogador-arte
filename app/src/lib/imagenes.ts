import { supabase } from './supabase'

/**
 * Tres niveles por toma (ADR-002). Las derivadas se generan **en el navegador
 * antes de subir**: una foto de móvil son 4-12 MB, y subirla tres veces desde un
 * almacén con mala cobertura no es viable. Además, en este stack no hay servidor
 * propio donde redimensionar.
 */
export const NIVELES = {
  miniatura: { bordeLargo: 400, calidad: 0.72 },
  derivada: { bordeLargo: 2000, calidad: 0.82 },
} as const

export const BUCKET = 'obras'

/** 60 MB, el mismo tope que el bucket. */
export const BYTES_MAXIMOS = 62_914_560

export type NivelImagen = keyof typeof NIVELES

export interface TomaPreparada {
  /** Fichero original, sin recodificar: es el máster de archivo. */
  master: File
  miniatura: Blob
  derivada: Blob
  anchoOriginal: number
  altoOriginal: number
  /** URL local para la previsualización. Hay que revocarla al descartar la toma. */
  previsualizacion: string
}

/**
 * Dimensiones de destino conservando la proporción.
 *
 * **Nunca amplía.** Una foto de 300 px no mejora estirándola a 2000: solo pesaría
 * más y aparentaría una calidad que no tiene, que en un catálogo es peor que ser
 * pequeña.
 */
export function calcularDestino(
  ancho: number,
  alto: number,
  bordeLargo: number,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto)
  if (mayor <= bordeLargo) return { ancho, alto }
  const factor = bordeLargo / mayor
  return {
    ancho: Math.max(1, Math.round(ancho * factor)),
    alto: Math.max(1, Math.round(alto * factor)),
  }
}

/** Comprueba lo que se puede comprobar sin decodificar la imagen. */
export function validarArchivo(archivo: File): string | null {
  if (!archivo.type.startsWith('image/')) {
    return `«${archivo.name}» no es una imagen.`
  }
  if (archivo.size > BYTES_MAXIMOS) {
    const mb = (archivo.size / 1_048_576).toFixed(1)
    return `«${archivo.name}» pesa ${mb} MB y el máximo es 60 MB.`
  }
  return null
}

async function reducir(
  bitmap: ImageBitmap,
  nivel: NivelImagen,
): Promise<Blob> {
  const { bordeLargo, calidad } = NIVELES[nivel]
  const destino = calcularDestino(bitmap.width, bitmap.height, bordeLargo)

  const lienzo = document.createElement('canvas')
  lienzo.width = destino.ancho
  lienzo.height = destino.alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no ha dado un contexto de dibujo')
  ctx.drawImage(bitmap, 0, 0, destino.ancho, destino.alto)

  return new Promise((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo codificar la imagen'))),
      'image/webp',
      calidad,
    )
  })
}

/**
 * Caso raro pero real que conviene conocer: con una imagen que ya comprime muy
 * bien en su formato original —un dibujo de línea escaneado, una captura de
 * pantalla, un PNG de tonos planos— la derivada en WebP puede acabar pesando más
 * que el máster. No se corrige porque con fotografía de obra no ocurre, y añadir
 * una rama para elegir el menor de los dos complicaría el flujo por un caso que
 * no afecta al catálogo. Si algún día el archivo se llena de escaneos de línea,
 * aquí está el sitio donde mirar.
 */
export async function prepararToma(archivo: File): Promise<TomaPreparada> {
  // `imageOrientation: 'from-image'` aplica la orientación EXIF. Sin esto, una
  // foto tomada en vertical con el móvil se guardaría girada en las derivadas
  // mientras el máster se ve bien, que es el tipo de incoherencia que nadie
  // entiende después.
  const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  try {
    const [miniatura, derivada] = await Promise.all([
      reducir(bitmap, 'miniatura'),
      reducir(bitmap, 'derivada'),
    ])
    return {
      master: archivo,
      miniatura,
      derivada,
      anchoOriginal: bitmap.width,
      altoOriginal: bitmap.height,
      previsualizacion: URL.createObjectURL(miniatura),
    }
  } finally {
    bitmap.close()
  }
}

function extension(nombre: string): string {
  const punto = nombre.lastIndexOf('.')
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : 'bin'
}

/**
 * Rutas dentro del bucket, agrupadas por obra para que el almacenamiento se pueda
 * recorrer a mano y se entienda qué hay dentro.
 *
 * El sufijo es aleatorio y no el ordinal `_v1` que recomienda el esquema, porque
 * el ordinal lo asigna la base al insertar la fila y aquí los ficheros se suben
 * antes: subir primero y registrar después evita que quede una fila apuntando a
 * un fichero que nunca llegó. Renombrar los tres objetos después costaría tres
 * peticiones más por foto, y en el almacén las peticiones son el recurso escaso.
 * DP-06 sigue abierta y una migración podría alinear los nombres más adelante.
 */
export function rutas(idCatalogacion: string, master: File) {
  const sufijo = crypto.randomUUID().slice(0, 8)
  const base = `${idCatalogacion}/${idCatalogacion}_${sufijo}`
  return {
    miniatura: `${base}_min.webp`,
    derivada: `${base}_der.webp`,
    master: `${base}_master.${extension(master.name)}`,
  }
}

export interface ResultadoSubida {
  id_imagen: string
}

/**
 * Sube los tres niveles y registra la fila. En este orden a propósito: si algo
 * falla a mitad, quedan ficheros huérfanos en el bucket —que no rompen nada y se
 * pueden limpiar— en vez de una ficha con imágenes que no existen.
 */
export async function subirToma(
  idCatalogacion: string,
  toma: TomaPreparada,
  opciones: { tipoToma: string; esIndice: boolean },
): Promise<ResultadoSubida> {
  const destino = rutas(idCatalogacion, toma.master)

  const subidas: [string, Blob | File][] = [
    [destino.miniatura, toma.miniatura],
    [destino.derivada, toma.derivada],
    [destino.master, toma.master],
  ]

  for (const [ruta, cuerpo] of subidas) {
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, cuerpo, {
      contentType: cuerpo instanceof File ? cuerpo.type : 'image/webp',
      upsert: false,
    })
    if (error) throw new Error(`Subiendo ${ruta}: ${error.message}`)
  }

  const { data, error } = await supabase
    .from('imagenes')
    .insert({
      id_catalogacion: idCatalogacion,
      ruta_miniatura: destino.miniatura,
      ruta_derivada: destino.derivada,
      ruta_master: destino.master,
      tipo_toma: opciones.tipoToma,
      imagen_indice: opciones.esIndice,
      bytes_master: toma.master.size,
      fecha_fotografia: new Date().toISOString().slice(0, 10),
    })
    .select('id_imagen')
    .single()

  if (error) throw new Error(`Registrando la imagen: ${error.message}`)
  return data as ResultadoSubida
}

/**
 * URL firmada para ver un fichero. RF-412: **todo acceso a imágenes pasa por
 * aquí**, para que cambiar de proveedor de almacenamiento sea un cambio en un solo
 * sitio. Y RF-110: el bucket es privado, no hay URL pública.
 */
export async function urlFirmada(ruta: string, segundos = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, segundos)
  return error ? null : data.signedUrl
}
