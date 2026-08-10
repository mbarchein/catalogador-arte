import { describe, expect, it } from 'vitest'
import {
  BASE_FONT_PX,
  normalizeTextScale,
  TEXT_SCALE_KEY,
  TEXT_SCALE_LABEL,
  TEXT_SCALE_PERCENT,
  TEXT_SCALES,
  textScaleFontSize,
  textScaleNotice,
  textScaleOptionText,
} from './textScale'

/**
 * El tamaño de letra de toda la aplicación.
 *
 * Lo que fija esta batería y no se ve mirando la pantalla: **que un valor guardado que no
 * se reconozca no pueda dejar la aplicación en un tamaño absurdo**. Esto se ejecuta antes
 * de que React monte, en el script de `index.html`, así que es el único sitio del proyecto
 * donde un dato de `localStorage` corrupto podría impedir que la pantalla se pinte.
 */

describe('normalizeTextScale, lo guardado no manda a ciegas', () => {
  it('los tres escalones se reconocen', () => {
    for (const scale of TEXT_SCALES) {
      expect(normalizeTextScale(scale)).toBe(scale)
    }
  })

  it('y cualquier otra cosa es «Normal»', () => {
    // From another version, from a browser extension, from a half-done save, or from
    // somebody typing in the console. None of them can leave the screen unreadable.
    const basura = [null, undefined, '', '   ', 'GIGANTE', 'normal', '130', '{}', 'NORMAL '] as const
    for (const raw of basura) {
      expect(normalizeTextScale(raw), String(raw)).toBe('NORMAL')
    }
  })
})

describe('textScaleFontSize, lo que se le pone a la raíz', () => {
  it('«Normal» es el tamaño base, sin tocar nada', () => {
    expect(textScaleFontSize('NORMAL')).toBe(`${BASE_FONT_PX}px`)
  })

  it('y los otros dos suben lo que dicen', () => {
    expect(textScaleFontSize('LARGE')).toBe('18.4px')
    expect(textScaleFontSize('LARGER')).toBe('20.8px')
  })

  it('en PÍXELES y no en porcentaje, que es lo que lo hace igual en dos teléfonos', () => {
    // Un porcentaje se mide contra el tamaño que el navegador ya tenga, que puede venir
    // cambiado por el sistema: dos móviles con «Grande» elegido enseñarían tamaños
    // distintos, y el ajuste dejaría de significar algo.
    for (const scale of TEXT_SCALES) {
      expect(textScaleFontSize(scale)).toMatch(/^[\d.]+px$/)
    }
  })

  it('sin decimales de arrastre', () => {
    for (const scale of TEXT_SCALES) {
      expect(textScaleFontSize(scale)).not.toMatch(/\d{3,}px$/)
    }
  })
})

describe('los escalones, tal como se leen', () => {
  it('tres, y de menor a mayor', () => {
    // Tres y no cuatro: caben en una fila de botones sin desplegable, que es un gesto
    // menos. Y hasta 130 %, que es donde las rejillas de dos columnas se quedan sin sitio
    // en una pantalla de 390 puntos.
    expect(TEXT_SCALES).toEqual(['NORMAL', 'LARGE', 'LARGER'])
    const percents = TEXT_SCALES.map((s) => TEXT_SCALE_PERCENT[s])
    expect(percents).toEqual([100, 115, 130])
    expect([...percents].sort((a, b) => a - b)).toEqual(percents)
  })

  it('cada uno tiene nombre y porcentaje, y el botón lleva los dos', () => {
    for (const scale of TEXT_SCALES) {
      expect(TEXT_SCALE_LABEL[scale].trim()).not.toBe('')
      expect(textScaleOptionText(scale)).toContain(TEXT_SCALE_LABEL[scale])
      expect(textScaleOptionText(scale)).toContain(String(TEXT_SCALE_PERCENT[scale]))
    }
    expect(textScaleOptionText('LARGE')).toBe('Grande · 115%')
  })
})

describe('textScaleNotice, la consecuencia que no se ve desde el perfil', () => {
  it('sin tocar el ajuste no hay nada que explicar', () => {
    expect(textScaleNotice('NORMAL')).toBeNull()
  })

  it('y agrandándolo se cuenta lo que cuesta, y lo que se queda igual', () => {
    for (const scale of ['LARGE', 'LARGER'] as const) {
      const text = textScaleNotice(scale)!
      expect(text).toContain('cabe menos')
      expect(text).toContain('editor de fotografía')
    }
  })
})

describe('la clave de localStorage', () => {
  it('sigue la forma de las demás de la aplicación', () => {
    // `catalogador.batch`, `catalogador.photo-source`… Una clave que ya está puesta en el
    // navegador de alguien no se renombra sin decidir la compatibilidad, así que conviene
    // nacer con la forma correcta.
    expect(TEXT_SCALE_KEY).toBe('catalogador.text-scale')
  })
})
