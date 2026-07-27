import { describe, expect, it } from 'vitest'
import { generarFichaPdf, lineasFicha, textoImprimible, urlFicha } from './fichaPdf'
import type { Obra } from './tipos'

const OBRA: Obra = {
  id_catalogacion: 'TS-0001',
  artista: 'TEST',
  titulo: 'Bodegón de ensayo',
  titulo_atribuido: 'SI',
  tipo_obra: 'Pintura',
  fecha_ejecucion: 'c. 1980',
  anio_inicio: 1980,
  anio_fin: null,
  fecha_aproximada: true,
  fecha_sin_confirmar: false,
  fecha_nota: '',
  tecnica: 'Óleo',
  soporte: '',
  alto_cm: 50,
  ancho_cm: 40,
  profundidad_cm: null,
  firmada: 'SI',
  firma_descripcion: 'ángulo inferior derecho',
  fechada_en_obra: 'NO',
  estado_conservacion: 'BUENO',
  ubicacion_fisica: 'Almacén, estantería 3',
  estado_existencia: 'CONSERVADA',
  fotografiada: false,
  medidas_verificadas: false,
  fase_inventario_completada: false,
  fase_documentacion_completada: false,
  ficha_catalografica_completa: false,
  notas_proceso_inventario: '',
  fecha_actualizacion: '2026-07-27T00:00:00Z',
  fecha_actualizacion_basica: null,
  actualizado_por: null,
  activo: true,
}

// RF-202: el identificador es la etiqueta física pegada a la obra; la ficha
// imprimible lo lleva en grande y el QR abre la ficha viva.
describe('urlFicha', () => {
  it('compone la URL de la ficha desde el origen dado', () => {
    expect(urlFicha('TS-0001', 'https://catalogo.example')).toBe(
      'https://catalogo.example/obra/TS-0001',
    )
  })

  it('tolera la barra final del origen sin duplicarla', () => {
    expect(urlFicha('AR-0002', 'https://catalogo.example/')).toBe(
      'https://catalogo.example/obra/AR-0002',
    )
  })
})

describe('textoImprimible', () => {
  it('conserva el español y la puntuación tipográfica de WinAnsi', () => {
    const texto = 'Ñandú — «óleo», 50 × 40 cm… ¿seguro?'
    expect(textoImprimible(texto)).toBe(texto)
  })

  it('sustituye por «?» lo que Helvetica no puede imprimir', () => {
    expect(textoImprimible('flecha → y emoji 🎨')).toBe('flecha ? y emoji ??')
  })
})

describe('lineasFicha', () => {
  const lineas = lineasFicha(OBRA)
  const valorDe = (etiqueta: string) => lineas.find((l) => l.etiqueta === etiqueta)?.valor

  it('traduce los códigos a las etiquetas de la interfaz', () => {
    expect(valorDe('Fondo')).toBe('Pruebas')
    expect(valorDe('Conservación')).toBe('Bueno')
  })

  it('describe la firma cuando hay descripción', () => {
    expect(valorDe('Firmada')).toBe('Sí, ángulo inferior derecho')
  })

  it('nunca deja un hueco: el dato vacío se declara', () => {
    expect(valorDe('Soporte')).toBe('Sin indicar')
  })
})

describe('generarFichaPdf', () => {
  it('produce un PDF A5 de verdad, con el QR embebido', async () => {
    const blob = await generarFichaPdf(OBRA, 'https://catalogo.example')
    expect(blob.type).toBe('application/pdf')

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const cabecera = String.fromCharCode(...bytes.slice(0, 5))
    expect(cabecera).toBe('%PDF-')
    // Con el QR (PNG) embebido, la ficha pesa bastante más que un PDF vacío.
    expect(bytes.length).toBeGreaterThan(4000)
  })
})
