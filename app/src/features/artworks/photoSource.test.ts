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
 * De quién es la fotografía y de dónde salió (RF-417).
 *
 * Lo que se fija, y es la razón de que este módulo exista, es **el valor
 * dormido**: son dos columnas y la base no impide que las dos tengan texto —una
 * restricción cruzada haría fallar el cambio de procedencia por un dato que no
 * estorba—. Así que quien decide qué se enseña es esto, y equivocarse aquí es
 * atribuir la fotografía de un catálogo ajeno a quien no la hizo.
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
    // En 35 de las 39 tomas la hizo quien cataloga: obligar a teclearlo treinta y
    // cinco veces convertiría un crédito en un peaje.
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
    // Este es el caso que importa: si aquí saliera la autoría, la ficha impresa
    // de una reproducción ajena atribuiría la foto a quien no la hizo.
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
