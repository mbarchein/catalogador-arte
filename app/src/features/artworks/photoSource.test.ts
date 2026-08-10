import { describe, expect, it } from 'vitest'
import {
  cleanPhotoSource,
  photoSourceColumn,
  photoSourceField,
  photoSourceHint,
  photoSourceLabel,
  photoSourceOf,
} from './photoSource'

/**
 * Whose the photograph is and where it came from (RF-417).
 *
 * What is pinned down, and it is the reason this module exists, is **the dormant
 * value**: they are two columns and the base does not prevent both from having text —a
 * cross constraint would make the provenance change fail over a datum that is not in the
 * way—. So the one that decides what is shown is this, and getting it wrong here is
 * attributing somebody else's catalogue photograph to whoever did not take it.
 */

const row = (over: Partial<{ photo_credit: string; provenance_source: string }> = {}) => ({
  photo_credit: '',
  provenance_source: '',
  ...over,
})

describe('qué se pregunta en cada procedencia', () => {
  it('en una propia, quién la hizo', () => {
    expect(photoSourceField('OWN')).toBe('credit')
    expect(photoSourceLabel('OWN')).toBe('Autoría de la fotografía')
    expect(photoSourceColumn('OWN')).toBe('photo_credit')
  })

  it('en las que vienen de fuera, de dónde salió', () => {
    for (const provenance of ['OTHER_CATALOG', 'THIRD_PARTY'] as const) {
      expect(photoSourceField(provenance)).toBe('source')
      expect(photoSourceLabel(provenance)).toBe('De dónde salió')
      expect(photoSourceColumn(provenance)).toBe('provenance_source')
    }
  })

  it('las dos se dicen opcionales, que es lo que son', () => {
    // In 35 of the 39 shots it was taken by whoever catalogues: forcing them to type it
    // thirty-five times would turn a credit into a toll.
    expect(photoSourceHint('OWN')).toContain('Opcional')
    expect(photoSourceHint('THIRD_PARTY')).toContain('Opcional')
  })

  it('y la de fuera admite texto libre, no solo una dirección', () => {
    expect(photoSourceHint('OTHER_CATALOG')).toContain('me la pasó la familia')
  })
})

describe('el valor dormido no se cuela', () => {
  it('una propia con las dos escritas enseña la autoría', () => {
    const both = row({ photo_credit: 'Mario Barchéin', provenance_source: 'Web del MACVA' })
    expect(photoSourceOf(both, 'OWN')).toBe('Mario Barchéin')
  })

  it('y la misma fila, marcada como ajena, enseña el origen', () => {
    // This is the case that matters: if the authorship showed up here, the printed record
    // of somebody else's reproduction would attribute the photo to whoever did not take it.
    const both = row({ photo_credit: 'Mario Barchéin', provenance_source: 'Web del MACVA' })
    expect(photoSourceOf(both, 'OTHER_CATALOG')).toBe('Web del MACVA')
  })

  it('lo que está en blanco es null, no una cadena vacía', () => {
    expect(photoSourceOf(row(), 'OWN')).toBeNull()
    expect(photoSourceOf(row({ photo_credit: '   ' }), 'OWN')).toBeNull()
  })
})

describe('lo que se guarda', () => {
  it('va recortado', () => {
    expect(cleanPhotoSource('  Ana Ruiz  ')).toBe('Ana Ruiz')
  })
})
