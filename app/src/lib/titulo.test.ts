import { describe, expect, it } from 'vitest'
import {
  avisoExistencia,
  avisoTituloAtribuido,
  esTituloMarcador,
  mostrarMedidas,
  mostrarTitulo,
} from './titulo'

describe('mostrarTitulo (RF-209)', () => {
  it('muestra el marcador entre corchetes si la obra no tiene título', () => {
    expect(mostrarTitulo('')).toBe('[Sin título]')
    expect(mostrarTitulo('   ')).toBe('[Sin título]')
  })

  it('distingue la obra que el artista tituló literalmente «Sin título»', () => {
    // Este es el caso que motivó la convención: los corchetes son lo único que
    // separa «no tiene título» de «se titula Sin título».
    expect(mostrarTitulo('Sin título')).toBe('Sin título')
    expect(esTituloMarcador('Sin título')).toBe(false)
  })

  it('respeta cualquier otro título', () => {
    expect(mostrarTitulo('Paisaje de invierno')).toBe('Paisaje de invierno')
  })
})

describe('avisoTituloAtribuido (RF-307)', () => {
  it('avisa de un nombre de conveniencia', () => {
    expect(avisoTituloAtribuido('SI')).toBe('Nombre atribuido, no del artista')
  })

  it('avisa de que la autoría del título está sin confirmar', () => {
    expect(avisoTituloAtribuido('SIN_REVISAR')).toBe('Autoría del título sin confirmar')
  })

  it('no avisa cuando el título es del artista o no aplica', () => {
    expect(avisoTituloAtribuido('NO')).toBeNull()
    expect(avisoTituloAtribuido('NO_APLICA')).toBeNull()
  })
})

describe('avisoExistencia (RF-306)', () => {
  it('destaca la obra destruida y la de paradero desconocido', () => {
    expect(avisoExistencia({ estado_existencia: 'DESTRUIDA' })).toBe('Obra destruida')
    expect(avisoExistencia({ estado_existencia: 'PERDIDA' })).toBe('Paradero desconocido')
  })

  it('no destaca nada si la obra está conservada o sin revisar', () => {
    expect(avisoExistencia({ estado_existencia: 'CONSERVADA' })).toBeNull()
    expect(avisoExistencia({ estado_existencia: 'SIN_REVISAR' })).toBeNull()
  })
})

describe('mostrarMedidas', () => {
  it('compone alto por ancho', () => {
    expect(mostrarMedidas({ alto_cm: 73, ancho_cm: 60, profundidad_cm: null })).toBe('73 × 60 cm')
  })

  it('añade la profundidad solo cuando aplica', () => {
    expect(mostrarMedidas({ alto_cm: 30, ancho_cm: 20, profundidad_cm: 15 })).toBe('30 × 20 × 15 cm')
  })

  it('marca la medida que falta en vez de fingir que no existe', () => {
    expect(mostrarMedidas({ alto_cm: 42, ancho_cm: null, profundidad_cm: null })).toBe('42 × ? cm')
  })

  it('dice que la obra está sin medir si no hay ninguna medida', () => {
    expect(mostrarMedidas({ alto_cm: null, ancho_cm: null, profundidad_cm: null })).toBe('Sin medir')
  })

  it('no arrastra decimales vacíos', () => {
    expect(mostrarMedidas({ alto_cm: 29.7, ancho_cm: 21, profundidad_cm: null })).toBe('29.7 × 21 cm')
  })
})
