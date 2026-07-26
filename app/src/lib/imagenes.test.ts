import { describe, expect, it } from 'vitest'
import { BYTES_MAXIMOS, NIVELES, calcularDestino, validarArchivo } from './imagenes'

describe('calcularDestino', () => {
  it('reduce el borde largo al objetivo conservando la proporción', () => {
    // Foto de móvil típica en horizontal.
    expect(calcularDestino(4032, 3024, 2000)).toEqual({ ancho: 2000, alto: 1500 })
  })

  it('funciona igual en vertical', () => {
    expect(calcularDestino(3024, 4032, 2000)).toEqual({ ancho: 1500, alto: 2000 })
  })

  it('nunca amplía una imagen pequeña', () => {
    // Estirar una foto de 300 px a 2000 solo pesaría más y aparentaría una
    // calidad que no tiene, que en un catálogo es peor que ser pequeña.
    expect(calcularDestino(300, 200, 2000)).toEqual({ ancho: 300, alto: 200 })
    expect(calcularDestino(1, 1, 400)).toEqual({ ancho: 1, alto: 1 })
  })

  it('deja intacta la imagen que ya mide justo el objetivo', () => {
    expect(calcularDestino(2000, 1000, 2000)).toEqual({ ancho: 2000, alto: 1000 })
  })

  it('no devuelve nunca una dimensión de cero', () => {
    // Una imagen muy alargada podría redondear el lado corto a cero y el lienzo
    // fallaría al dibujar.
    const r = calcularDestino(8000, 3, 400)
    expect(r.alto).toBeGreaterThanOrEqual(1)
    expect(r.ancho).toBe(400)
  })

  it('produce una miniatura mucho más ligera que la derivada', () => {
    const mini = calcularDestino(4032, 3024, NIVELES.miniatura.bordeLargo)
    const der = calcularDestino(4032, 3024, NIVELES.derivada.bordeLargo)
    // El área es lo que manda en el peso final; la miniatura debe ser un orden de
    // magnitud menor para que el índice en mosaico cargue en móvil.
    expect(mini.ancho * mini.alto).toBeLessThan((der.ancho * der.alto) / 10)
  })
})

describe('validarArchivo', () => {
  const archivo = (nombre: string, tipo: string, bytes: number) =>
    new File([new Uint8Array(1)], nombre, { type: tipo }) &&
    // File no permite fijar `size` directamente: se simula con un objeto que
    // cumple lo que la función usa.
    ({ name: nombre, type: tipo, size: bytes } as File)

  it('acepta una imagen normal', () => {
    expect(validarArchivo(archivo('obra.jpg', 'image/jpeg', 8_000_000))).toBeNull()
  })

  it('rechaza lo que no es una imagen, nombrando el fichero', () => {
    const error = validarArchivo(archivo('procedencia.pdf', 'application/pdf', 1000))
    expect(error).toContain('procedencia.pdf')
    expect(error).toContain('no es una imagen')
  })

  it('rechaza lo que pasa del tope y dice cuánto pesa', () => {
    const error = validarArchivo(archivo('escaneo.tif', 'image/tiff', BYTES_MAXIMOS + 1))
    expect(error).toContain('escaneo.tif')
    // Decir «pesa 60.0 MB y el máximo es 60 MB» es más útil que «archivo
    // demasiado grande»: se sabe cuánto hay que recortar.
    expect(error).toMatch(/MB/)
  })

  it('acepta justo el tamaño límite', () => {
    expect(validarArchivo(archivo('justo.jpg', 'image/jpeg', BYTES_MAXIMOS))).toBeNull()
  })
})
