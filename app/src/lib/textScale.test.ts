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
 * The text size of the whole application.
 *
 * What this suite pins down and is not visible looking at the screen: **that a stored value that is not
 * recognised cannot leave the application at an absurd size**. This runs before
 * React mounts, in `index.html`'s script, so it is the only place in the project
 * where a corrupt `localStorage` datum could prevent the screen from being painted.
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
    // A percentage is measured against whatever size the browser already has, which may come
    // changed by the system: two phones with «Grande» chosen would show
    // different sizes, and the setting would stop meaning anything.
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
    // Three and not four: they fit in a row of buttons with no dropdown, which is one gesture
    // fewer. And up to 130 %, which is where two-column grids run out of room
    // on a 390-point screen.
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
    // `catalogador.batch`, `catalogador.photo-source`… A key that is already set in
    // somebody's browser is not renamed without deciding compatibility, so it is best
    // to be born with the right shape.
    expect(TEXT_SCALE_KEY).toBe('catalogador.text-scale')
  })
})
