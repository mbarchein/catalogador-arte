import { describe, expect, it } from 'vitest'
import { activeNames, groupByFund, planAddition, sortByName } from './masterTables'
import type { ArtistFund, ArtworkTypeEntry, SeriesEntry } from './types'

function type(name: string, active = true): ArtworkTypeEntry {
  return { id: `t-${name}`, name, active }
}

function series(artist: ArtistFund, name: string, active = true): SeriesEntry {
  return { id: `s-${artist}-${name}`, artist, name, active }
}

// The real vocabulary of the local catalog, plus a retired entry: «Escultura» can
// be retired because no artwork uses it, which is exactly the case the screen
// exists for.
const TYPES = [
  type('Pintura'),
  type('Técnica mixta'),
  type('Óleo'),
  type('Collage'),
  type('Escultura', false),
]

describe('sortByName (RF-1106: the order the maintenance screens read in)', () => {
  it('sorts with es-ES collation, so an accented name is not sent past the z', () => {
    expect(sortByName(TYPES).map((t) => t.name)).toEqual([
      'Collage',
      'Escultura',
      'Óleo',
      'Pintura',
      'Técnica mixta',
    ])
  })

  it('keeps a retired entry in its alphabetical place', () => {
    // Retired is shown greyed out, not moved: a name looked for alphabetically
    // and found at the bottom of the page is a name hidden twice.
    expect(sortByName(TYPES)[1]?.name).toBe('Escultura')
  })

  it('does not touch the array it is given', () => {
    const original = [type('B'), type('A')]
    sortByName(original)
    expect(original.map((t) => t.name)).toEqual(['B', 'A'])
  })
})

describe('planAddition (RF-213: what adding a name to the vocabulary means)', () => {
  it('a new name is an insert, trimmed', () => {
    // Trimmed here because the column checks that the name equals its own trim:
    // without this, «Acuarela » comes back as a PostgreSQL constraint error.
    expect(planAddition(TYPES, '  Acuarela ')).toEqual({ action: 'insert', name: 'Acuarela' })
  })

  it('blank text is not an addition', () => {
    expect(planAddition(TYPES, '   ')).toEqual({ action: 'blank' })
    expect(planAddition(TYPES, '')).toEqual({ action: 'blank' })
  })

  it('an equivalent active name is reused instead of duplicated', () => {
    // The unique index is case- and accent-sensitive, so the database would take
    // «pintura» next to «Pintura»: this is the only thing standing between the
    // vocabulary and that pair.
    expect(planAddition(TYPES, 'pintura')).toEqual({ action: 'reuse', entry: type('Pintura') })
    expect(planAddition(TYPES, 'tecnica MIXTA')).toEqual({
      action: 'reuse',
      entry: type('Técnica mixta'),
    })
  })

  it('RF-901: adding a retired name brings it back instead of failing', () => {
    // Nothing is ever really deleted, so the name is still in the table and the
    // insert would come back as a unique violation — which the ComboBox used to
    // treat as success, saying «added» and leaving the entry hidden.
    expect(planAddition(TYPES, 'escultura')).toEqual({
      action: 'restore',
      entry: type('Escultura', false),
    })
  })
})

describe('groupByFund (RF-213: a series belongs to a fund)', () => {
  const ENTRIES = [
    series('RUIZ_CAMPINS', 'Retratos del taller'),
    series('ROTILI', 'Paisajes de la sierra'),
    series('ROTILI', 'Espacio y Sonido'),
    series('RUIZ_CAMPINS', 'La Rábida', false),
  ]

  it('groups by fund in the declared order, sorted by name inside', () => {
    expect(
      groupByFund(ENTRIES).map((g) => [g.fund, g.entries.map((e) => e.name)]),
    ).toEqual([
      ['ROTILI', ['Espacio y Sonido', 'Paisajes de la sierra']],
      ['RUIZ_CAMPINS', ['La Rábida', 'Retratos del taller']],
    ])
  })

  it('leaves out a fund with no series, instead of an empty heading', () => {
    expect(groupByFund(ENTRIES).map((g) => g.fund)).not.toContain('TEST')
  })

  it('the same name in two funds stays two entries', () => {
    // They are two different series: the pair (fund, name) is what is unique,
    // and this is why the screen groups instead of listing names alone.
    const shared = [series('ROTILI', 'Homónima'), series('TEST', 'Homónima')]
    expect(groupByFund(shared).map((g) => g.entries.length)).toEqual([1, 1])
  })
})

describe('activeNames (RF-1106: what a record is still offered)', () => {
  it('leaves out what has been retired', () => {
    expect(activeNames(TYPES)).not.toContain('Escultura')
    expect(activeNames(TYPES)).toContain('Pintura')
  })
})
