import { describe, expect, it } from 'vitest'
import {
  buildPlaceTree,
  findPlaceByPath,
  flattenPlaces,
  placeAncestry,
  placeKey,
  placePathText,
  placesInside,
  splitPlacePath,
} from './places'
import type { PhysicalPlace } from './types'

function place(
  id: string,
  name: string,
  parent_id: string | null = null,
  active = true,
): PhysicalPlace {
  return { id, parent_id, name, active }
}

// The tree of the migrated catalog, with its real shape: mostly one level, one
// branch two deep, and names still lowercase because that is how the old text
// was stored.
const CASTELAR = place('p1', 'Castelar 4')
const MESA = place('p2', 'mesa de Mario', 'p1')
const CAJON = place('p3', 'cajón de arriba', 'p2')
const VILLAFRANCA = place('p4', 'Villafranca de los Barros')
const COLON = place('p5', 'c/Colón 11-1C', 'p4')
const AVILA = place('p6', 'Ávila')
const RETIRADA = place('p7', 'balda vaciada', 'p1', false)

const PLACES = [MESA, CAJON, CASTELAR, COLON, VILLAFRANCA, AVILA, RETIRADA]

describe('placeKey (RF-215)', () => {
  it('lowercases and strips accents', () => {
    expect(placeKey('Habitación Amarilla')).toBe('habitacion amarilla')
    expect(placeKey('  Ávila  ')).toBe('avila')
  })

  // The ñ is a letter, not an accent: the whole reason place_key uses translate
  // in SQL instead of unaccent.
  it('keeps the ñ', () => {
    expect(placeKey('Muñeca')).toBe('muñeca')
    expect(placeKey('Familia Hormeño')).toBe('familia hormeño')
  })

  // Mirrors public.place_key, whose translate list has no cedilla: normalizing
  // it here would make the client and the database disagree about whether a
  // place already exists.
  it('leaves the cedilla standing, like the SQL function', () => {
    expect(placeKey('Provença')).toBe('provença')
  })

  it('two names that differ only in capitals and accents share a key', () => {
    expect(placeKey('MUSEO de Bellas Artes')).toBe(placeKey('museo de bellas artes'))
  })
})

describe('buildPlaceTree (RF-215)', () => {
  it('groups roots under null and children under their parent', () => {
    const tree = buildPlaceTree(PLACES)
    expect(tree.childrenOf.get(null)?.map((p) => p.name)).toEqual([
      'Ávila',
      'Castelar 4',
      'Villafranca de los Barros',
    ])
    expect(tree.childrenOf.get('p1')?.map((p) => p.name)).toEqual(['balda vaciada', 'mesa de Mario'])
  })

  // es-ES collation, decided here and not in the query: the database's own
  // collation may sort accented names after z.
  it('sorts siblings with Spanish collation', () => {
    const tree = buildPlaceTree([place('a', 'Zamora'), place('b', 'Ávila'), place('c', 'Burgos')])
    expect(tree.childrenOf.get(null)?.map((p) => p.name)).toEqual(['Ávila', 'Burgos', 'Zamora'])
  })

  // Never a blank space: a node whose parent did not arrive is shown as a root
  // rather than dropped.
  it('treats a node with an unknown parent as a root', () => {
    const tree = buildPlaceTree([place('x', 'huérfana', 'no-existe')])
    expect(tree.childrenOf.get(null)?.map((p) => p.name)).toEqual(['huérfana'])
  })

  it('does not hang on a corrupt hierarchy', () => {
    const tree = buildPlaceTree([place('a', 'a', 'b'), place('b', 'b', 'a')])
    expect(placeAncestry(tree, 'a').length).toBeLessThanOrEqual(100)
    expect(flattenPlaces(tree).length).toBeLessThan(1000)
  })
})

describe('placePathText (RF-215, RF-1002)', () => {
  const tree = buildPlaceTree(PLACES)

  // What the record and the printed PDF read: the ADR keeps «Castelar 4, mesa
  // de Mario» on screen even though the comma is no longer syntax.
  it('reads from the outside in, separated by commas', () => {
    expect(placePathText(tree, 'p3')).toBe('Castelar 4, mesa de Mario, cajón de arriba')
    expect(placePathText(tree, 'p1')).toBe('Castelar 4')
  })

  // An artwork with no place is legitimate (RF-215): it answers empty, and it is
  // the caller who decides what to write in the gap.
  it('an artwork with no place reads empty', () => {
    expect(placePathText(tree, null)).toBe('')
    expect(placePathText(tree, 'no-existe')).toBe('')
  })
})

describe('placesInside (RF-215, RF-604)', () => {
  const tree = buildPlaceTree(PLACES)

  // The filter of the storage room: asking for a place brings everything under
  // it, at any depth.
  it('a place answers for everything inside it', () => {
    expect(placesInside(tree, ['p1'])).toEqual(new Set(['p1', 'p2', 'p3', 'p7']))
  })

  it('a leaf answers only for itself', () => {
    expect(placesInside(tree, ['p3'])).toEqual(new Set(['p3']))
  })

  it('several places add up without repeating', () => {
    expect(placesInside(tree, ['p2', 'p4'])).toEqual(new Set(['p2', 'p3', 'p4', 'p5']))
  })

  // A link shared months ago may name a place that no longer exists. It filters
  // by nothing instead of by everything: showing the whole catalog would answer
  // a question nobody asked.
  it('an unknown place contributes nothing', () => {
    expect(placesInside(tree, ['no-existe'])).toEqual(new Set())
    expect(placesInside(tree, [])).toEqual(new Set())
  })
})

describe('flattenPlaces (RF-215, RF-1106)', () => {
  const tree = buildPlaceTree(PLACES)

  it('walks depth first, each node under its parent', () => {
    expect(flattenPlaces(tree).map((f) => `${'  '.repeat(f.depth)}${f.place.name}`)).toEqual([
      'Ávila',
      'Castelar 4',
      '  balda vaciada',
      '  mesa de Mario',
      '    cajón de arriba',
      'Villafranca de los Barros',
      '  c/Colón 11-1C',
    ])
  })

  it('carries the full branch as text', () => {
    const cajon = flattenPlaces(tree).find((f) => f.place.id === 'p3')
    expect(cajon?.path).toBe('Castelar 4, mesa de Mario, cajón de arriba')
  })

  it('hides what the caller does not keep, and the branch under it', () => {
    const active = flattenPlaces(tree, (p) => p.active)
    expect(active.map((f) => f.place.name)).not.toContain('balda vaciada')
    expect(active.map((f) => f.place.name)).toContain('mesa de Mario')
  })

  it('a hidden parent takes its children with it', () => {
    const tree2 = buildPlaceTree([
      place('r', 'raíz', null, false),
      place('h', 'hija', 'r', true),
    ])
    expect(flattenPlaces(tree2, (p) => p.active)).toEqual([])
  })
})

describe('findPlaceByPath (RF-215)', () => {
  const tree = buildPlaceTree(PLACES)

  it('finds a place by its whole branch', () => {
    expect(findPlaceByPath(tree, ['Castelar 4', 'mesa de Mario'])?.id).toBe('p2')
  })

  // Typing on a phone, and legacy links: the stored text was lowercase and
  // without accents, and it still has to find its place.
  it('ignores capitals and accents', () => {
    expect(findPlaceByPath(tree, ['castelar 4', 'MESA de mario'])?.id).toBe('p2')
    expect(findPlaceByPath(tree, ['avila'])?.id).toBe('p6')
  })

  // A comma inside a level is content and not a separator: the address really
  // is called «c/Colón 11-1C» and lives under the town.
  it('finds a level that contains a slash', () => {
    expect(findPlaceByPath(tree, ['Villafranca de los Barros', 'c/Colón 11-1C'])?.id).toBe('p5')
  })

  it('answers null when a level of the path does not exist', () => {
    expect(findPlaceByPath(tree, ['Castelar 4', 'estantería que no hay'])).toBeNull()
    expect(findPlaceByPath(tree, [])).toBeNull()
  })

  // The same name under another parent is another place: «balda 2» exists in
  // every shelf.
  it('does not confuse two places with the same name under different parents', () => {
    const tree2 = buildPlaceTree([
      place('e1', 'Estantería 1'),
      place('e2', 'Estantería 2'),
      place('b1', 'Balda 2', 'e1'),
      place('b2', 'Balda 2', 'e2'),
    ])
    expect(findPlaceByPath(tree2, ['Estantería 1', 'Balda 2'])?.id).toBe('b1')
    expect(findPlaceByPath(tree2, ['Estantería 2', 'Balda 2'])?.id).toBe('b2')
  })
})

describe('splitPlacePath (RF-215)', () => {
  it('closes a level on every comma', () => {
    expect(splitPlacePath('Castelar 4, mesa de Mario')).toEqual(['Castelar 4', 'mesa de Mario'])
  })

  it('drops the stray spaces and the empty levels', () => {
    expect(splitPlacePath('  Edificio A ,,  Balda 2 , ')).toEqual(['Edificio A', 'Balda 2'])
  })

  // What is typed is stored: the name keeps its capitals and its accents, and
  // only the comparison is normalized.
  it('does not touch capitals or accents', () => {
    expect(splitPlacePath('Museo de Bellas Artes de Badajoz (MUBA)')).toEqual([
      'Museo de Bellas Artes de Badajoz (MUBA)',
    ])
  })

  it('nothing typed is no levels', () => {
    expect(splitPlacePath('')).toEqual([])
    expect(splitPlacePath(' , , ')).toEqual([])
  })
})
