/**
 * Ficha imprimible en PDF A5 con QR (RF-202: el identificador es una etiqueta
 * física; el QR la convierte en puerta de entrada a la ficha viva).
 *
 * Se genera íntegramente en el navegador: no hay servidor donde hacerlo, y así
 * funciona también desde el almacén. Este módulo se importa dinámicamente desde
 * la ficha para que pdf-lib no engorde el paquete inicial.
 */
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import QRCode from 'qrcode'
import { mostrarFecha } from './fechas'
import { mostrarMedidas, mostrarTitulo } from './titulo'
import {
  ETIQUETA_ARTISTA,
  ETIQUETA_CONSERVACION,
  ETIQUETA_EXISTENCIA,
  ETIQUETA_TRI_ESTADO,
  type Obra,
} from './tipos'

export interface LineaFicha {
  etiqueta: string
  valor: string
}

/** URL que codifica el QR: la ficha viva de la obra. */
export function urlFicha(idCatalogacion: string, origen?: string): string {
  const base =
    origen ?? (import.meta.env.VITE_APP_URL as string | undefined) ?? window.location.origin
  return `${base.replace(/\/+$/, '')}/obra/${idCatalogacion}`
}

/**
 * Los datos relevantes de la ficha, en el orden en que se imprimen. La regla
 * de la interfaz vale también en papel: nunca un hueco sin explicación.
 */
export function lineasFicha(obra: Obra): LineaFicha[] {
  const dato = (v: string) => v.trim() || 'Sin indicar'
  return [
    { etiqueta: 'Fondo', valor: ETIQUETA_ARTISTA[obra.artista] },
    { etiqueta: 'Tipo de obra', valor: dato(obra.tipo_obra) },
    { etiqueta: 'Fecha', valor: mostrarFecha(obra.fecha_ejecucion) },
    { etiqueta: 'Técnica', valor: dato(obra.tecnica) },
    { etiqueta: 'Soporte', valor: dato(obra.soporte) },
    { etiqueta: 'Medidas', valor: mostrarMedidas(obra) },
    {
      etiqueta: 'Firmada',
      valor:
        obra.firmada === 'SI' && obra.firma_descripcion
          ? `Sí, ${obra.firma_descripcion}`
          : ETIQUETA_TRI_ESTADO[obra.firmada],
    },
    { etiqueta: 'Conservación', valor: ETIQUETA_CONSERVACION[obra.estado_conservacion] },
    { etiqueta: 'Existencia', valor: ETIQUETA_EXISTENCIA[obra.estado_existencia] },
    { etiqueta: 'Ubicación', valor: dato(obra.ubicacion_fisica) },
  ]
}

/**
 * La Helvetica del PDF solo sabe WinAnsi (Latin-1 y poco más). Un carácter
 * fuera de ese repertorio rompería la generación entera, así que se sustituye
 * por «?»: un interrogante visible es mejor que una ficha que no se imprime.
 */
export function textoImprimible(texto: string): string {
  return texto.replace(/[^\u0020-\u007e\u00a0-\u00ff\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u2022\u20ac]/g, '?')
}

/** Parte un texto en líneas que caben en `anchoMax` puntos. */
function partirEnLineas(texto: string, fuente: PDFFont, tamano: number, anchoMax: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra
    if (fuente.widthOfTextAtSize(candidata, tamano) <= anchoMax || !actual) {
      actual = candidata
    } else {
      lineas.push(actual)
      actual = palabra
    }
  }
  if (actual) lineas.push(actual)
  return lineas.length > 0 ? lineas : ['']
}

const GRIS = rgb(0.45, 0.42, 0.4)
const TINTA = rgb(0.11, 0.1, 0.09)

export async function generarFichaPdf(obra: Obra, origen?: string): Promise<Blob> {
  const doc = await PDFDocument.create()
  const pagina = doc.addPage(PageSizes.A5) // 419,53 × 595,28 pt, vertical
  const { width: ancho, height: alto } = pagina.getSize()
  const margen = 36

  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const cursiva = await doc.embedFont(StandardFonts.HelveticaOblique)

  let y = alto - margen

  // ── Cabecera ────────────────────────────────────────────────
  pagina.drawText('INVENTARIO Y CATÁLOGO RAZONADO — ROTILI / RUIZ CAMPINS', {
    x: margen, y, size: 7, font: normal, color: GRIS,
  })
  y -= 24
  pagina.drawText(textoImprimible(obra.id_catalogacion), {
    x: margen, y, size: 24, font: negrita, color: TINTA,
  })
  y -= 15
  const subtitulo = `${ETIQUETA_ARTISTA[obra.artista]} · ${mostrarFecha(obra.fecha_ejecucion)}`
  pagina.drawText(textoImprimible(subtitulo), { x: margen, y, size: 10, font: normal, color: TINTA })
  y -= 18
  for (const linea of partirEnLineas(
    textoImprimible(mostrarTitulo(obra.titulo)), cursiva, 13, ancho - margen * 2,
  )) {
    pagina.drawText(linea, { x: margen, y, size: 13, font: cursiva, color: TINTA })
    y -= 16
  }
  y -= 4
  pagina.drawLine({
    start: { x: margen, y }, end: { x: ancho - margen, y },
    thickness: 0.8, color: GRIS,
  })
  y -= 16

  // ── Datos ───────────────────────────────────────────────────
  const xValor = margen + 92
  const anchoValor = ancho - margen - xValor
  for (const { etiqueta, valor } of lineasFicha(obra)) {
    const lineas = partirEnLineas(textoImprimible(valor), normal, 10, anchoValor)
    pagina.drawText(etiqueta, { x: margen, y, size: 8, font: normal, color: GRIS })
    for (const linea of lineas) {
      pagina.drawText(linea, { x: xValor, y, size: 10, font: normal, color: TINTA })
      y -= 13
    }
    y -= 4
  }

  // ── QR y pie ────────────────────────────────────────────────
  const url = urlFicha(obra.id_catalogacion, origen)
  const ladoQr = 108
  const qrPng = await QRCode.toDataURL(url, { margin: 0, width: ladoQr * 3 })
  const imagenQr = await doc.embedPng(qrPng)
  const xQr = ancho - margen - ladoQr
  pagina.drawImage(imagenQr, { x: xQr, y: margen + 12, width: ladoQr, height: ladoQr })
  pagina.drawText(textoImprimible(url), {
    x: margen, y: margen, size: 6.5, font: normal, color: GRIS,
  })

  const notaQr = 'El código abre esta misma ficha en la aplicación, con sus fotografías y su historial al día.'
  let yNota = margen + 12 + ladoQr - 8
  for (const linea of partirEnLineas(notaQr, normal, 8, xQr - margen - 14)) {
    pagina.drawText(linea, { x: margen, y: yNota, size: 8, font: normal, color: GRIS })
    yNota -= 10.5
  }
  pagina.drawText(
    `Ficha generada el ${new Date().toLocaleDateString('es-ES')}`,
    { x: margen, y: yNota - 6, size: 8, font: normal, color: GRIS },
  )

  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}
