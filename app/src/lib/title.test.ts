import { describe, expect, it } from 'vitest'
import {
  existenceNotice,
  attributedTitleNotice,
  isPlaceholderTitle,
  displayMeasurements,
  displayTitle,
} from './title'

describe('displayTitle (RF-209)', () => {
  it('shows the bracketed placeholder when the artwork has no title', () => {
    expect(displayTitle('')).toBe('[Sin título]')
    expect(displayTitle('   ')).toBe('[Sin título]')
  })

  it('distinguishes the artwork the artist literally titled «Sin título»', () => {
    // This is the case that motivated the convention: the brackets are the
    // only thing separating "has no title" from "is titled Sin título".
    expect(displayTitle('Sin título')).toBe('Sin título')
    expect(isPlaceholderTitle('Sin título')).toBe(false)
  })

  it('respects any other title', () => {
    expect(displayTitle('Paisaje de invierno')).toBe('Paisaje de invierno')
  })
})

describe('attributedTitleNotice (RF-307)', () => {
  it('warns about a convenience name', () => {
    expect(attributedTitleNotice('YES')).toBe('Nombre atribuido, no del artista')
  })

  it('warns that the title authorship is unconfirmed', () => {
    expect(attributedTitleNotice('UNCONFIRMED')).toBe('Autoría del título sin confirmar')
  })

  it('does not warn when the title is the artist\'s or does not apply', () => {
    expect(attributedTitleNotice('NO')).toBeNull()
    expect(attributedTitleNotice('NOT_APPLICABLE')).toBeNull()
  })

  it('does not warn while the blank title is pending investigation', () => {
    // The header already shows [Sin título]: a notice would repeat it.
    expect(attributedTitleNotice('UNREVIEWED')).toBeNull()
  })
})

describe('existenceNotice (RF-306)', () => {
  it('highlights the destroyed and the missing artwork', () => {
    expect(existenceNotice({ existence_status: 'DESTROYED' })).toBe('Obra destruida')
    expect(existenceNotice({ existence_status: 'LOST' })).toBe('Paradero desconocido')
  })

  it('highlights nothing when the artwork is preserved or unreviewed', () => {
    expect(existenceNotice({ existence_status: 'PRESERVED' })).toBeNull()
    expect(existenceNotice({ existence_status: 'UNREVIEWED' })).toBeNull()
  })
})

describe('displayMeasurements', () => {
  it('composes height by width', () => {
    expect(displayMeasurements({ height_cm: 73, width_cm: 60, depth_cm: null })).toBe('73 × 60 cm')
  })

  it('adds the depth only when it applies', () => {
    expect(displayMeasurements({ height_cm: 30, width_cm: 20, depth_cm: 15 })).toBe('30 × 20 × 15 cm')
  })

  it('marks the missing measurement instead of pretending it does not exist', () => {
    expect(displayMeasurements({ height_cm: 42, width_cm: null, depth_cm: null })).toBe('42 × ? cm')
  })

  it('says the artwork is unmeasured when there is no measurement at all', () => {
    expect(displayMeasurements({ height_cm: null, width_cm: null, depth_cm: null })).toBe('Sin medir')
  })

  it('does not drag empty decimals', () => {
    expect(displayMeasurements({ height_cm: 29.7, width_cm: 21, depth_cm: null })).toBe('29.7 × 21 cm')
  })
})
