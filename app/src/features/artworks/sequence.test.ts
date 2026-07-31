import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, type ListView } from './listView'
import {
  decideSwipe,
  dragOffset,
  navigationSequence,
  positionOf,
  sequenceOf,
  swipeAxis,
} from './sequence'

/**
 * Minimal listed artwork, same shape as the one in listView.test.ts: each test
 * overrides only the fields it exercises.
 */
const stub = (over: Partial<Parameters<typeof sequenceOf>[0][number]> = {}) => ({
  catalog_id: 'AR-0001',
  title: '',
  artist: 'ROTILI' as const,
  artwork_type: '',
  series: '',
  physical_location: '',
  inventory_phase_completed: false,
  documentation_phase_completed: false,
  catalog_record_complete: false,
  photographed: false,
  start_year: null,
  updated_at: '2026-07-28T10:00:00+00:00',
  ...over,
})

const ids = (rows: readonly { catalog_id: string }[]) => rows.map((r) => r.catalog_id)

describe('sequenceOf (RF-311: the filtered list is the sequence)', () => {
  const rows = [
    stub({ catalog_id: 'AR-0003', title: 'Zambra', photographed: true, start_year: 1970 }),
    stub({ catalog_id: 'AR-0001', title: 'Ánfora', photographed: false, start_year: 1980 }),
    stub({ catalog_id: 'AR-0002', title: '', photographed: false, start_year: null }),
  ]

  it('follows the order of the view, not the order of the rows', () => {
    expect(ids(sequenceOf(rows, { ...DEFAULT_VIEW, order: 'CATALOG_ID' }))).toEqual([
      'AR-0001',
      'AR-0002',
      'AR-0003',
    ])
    // Same rows, another queue: the untitled last, like the list shows them.
    expect(ids(sequenceOf(rows, { ...DEFAULT_VIEW, order: 'TITLE' }))).toEqual([
      'AR-0001',
      'AR-0003',
      'AR-0002',
    ])
    // And the undated last, which is pending research, not «older than all».
    expect(ids(sequenceOf(rows, { ...DEFAULT_VIEW, order: 'CHRONOLOGICAL' }))).toEqual([
      'AR-0003',
      'AR-0001',
      'AR-0002',
    ])
  })

  it('leaves out what the filters leave out: the queue is what was on screen', () => {
    const pending: ListView = { ...DEFAULT_VIEW, status: 'UNPHOTOGRAPHED', order: 'CATALOG_ID' }
    expect(ids(sequenceOf(rows, pending))).toEqual(['AR-0001', 'AR-0002'])
  })

  it('respects the search term too (RF-610): swiping walks what was searched', () => {
    const searched: ListView = { ...DEFAULT_VIEW, search: 'anfora' }
    expect(ids(sequenceOf(rows, searched))).toEqual(['AR-0001'])
  })

  it('ties break by code, so the sequence never swaps under the finger', () => {
    // Same timestamp for both: with RECENT order the only thing left to order
    // them by is the code, and it has to be decided, not left to chance.
    const tied = [
      stub({ catalog_id: 'AR-0009', updated_at: '2026-07-28T10:00:00+00:00' }),
      stub({ catalog_id: 'AR-0004', updated_at: '2026-07-28T10:00:00+00:00' }),
    ]
    expect(ids(sequenceOf(tied, DEFAULT_VIEW))).toEqual(['AR-0004', 'AR-0009'])
  })

  it('does not mutate the mirror it receives', () => {
    const original = ids(rows)
    sequenceOf(rows, { ...DEFAULT_VIEW, order: 'TITLE' })
    expect(ids(rows)).toEqual(original)
  })
})

describe('positionOf (RF-311: where the record sits, and no wrapping around)', () => {
  const queue = ['AR-0001', 'AR-0002', 'AR-0003']

  it('answers both neighbors and the place in the queue', () => {
    expect(positionOf(queue, 'AR-0002')).toEqual({
      previous: 'AR-0001',
      next: 'AR-0003',
      index: 2,
      total: 3,
    })
  })

  it('the ends have no neighbor: the control goes inactive, it does not wrap', () => {
    expect(positionOf(queue, 'AR-0001')).toEqual({
      previous: null,
      next: 'AR-0002',
      index: 1,
      total: 3,
    })
    expect(positionOf(queue, 'AR-0003')).toEqual({
      previous: 'AR-0002',
      next: null,
      index: 3,
      total: 3,
    })
  })

  it('a queue of one artwork has no neighbors at all', () => {
    expect(positionOf(['AR-0001'], 'AR-0001')).toEqual({
      previous: null,
      next: null,
      index: 1,
      total: 1,
    })
  })

  it('an artwork outside the queue is nowhere: index 0, no neighbors', () => {
    expect(positionOf(queue, 'AR-0099')).toEqual({
      previous: null,
      next: null,
      index: 0,
      total: 3,
    })
    expect(positionOf(queue, undefined)).toEqual({
      previous: null,
      next: null,
      index: 0,
      total: 0,
    })
  })
})

describe('navigationSequence (RF-311: which queue the record walks)', () => {
  const rows = [
    stub({ catalog_id: 'AR-0001', photographed: true }),
    stub({ catalog_id: 'AR-0002', photographed: false }),
    stub({ catalog_id: 'AR-0003', photographed: true }),
  ]
  const pending: ListView = { ...DEFAULT_VIEW, status: 'UNPHOTOGRAPHED', order: 'CATALOG_ID' }

  it('is the list one arrived from when the artwork belongs to it', () => {
    expect(navigationSequence(rows, pending, 'AR-0002')).toEqual({
      ids: ['AR-0002'],
      fromList: true,
    })
  })

  it('falls back to the whole catalog by code when the artwork is not in the list', () => {
    // A shared link with filters that exclude it, or the QR of a piece outside
    // them: better a queue that works and says what it is than a dead control.
    expect(navigationSequence(rows, pending, 'AR-0003')).toEqual({
      ids: ['AR-0001', 'AR-0002', 'AR-0003'],
      fromList: false,
    })
  })

  it('an artwork the mirror does not hold ends up in no sequence', () => {
    // Deactivated, or a catalog nobody has downloaded on this device yet.
    const { ids: fallback } = navigationSequence(rows, DEFAULT_VIEW, 'AR-0404')
    expect(positionOf(fallback, 'AR-0404').index).toBe(0)
    expect(positionOf(fallback, 'AR-0404').previous).toBeNull()
  })

  it('with an empty mirror there is nothing to walk', () => {
    expect(navigationSequence([], DEFAULT_VIEW, 'AR-0001')).toEqual({ ids: [], fromList: false })
  })
})

describe('swipeAxis (RF-311: the gesture commits to one axis)', () => {
  it('is undecided while the movement is too small to read', () => {
    expect(swipeAxis(0, 0)).toBeNull()
    expect(swipeAxis(6, 4)).toBeNull()
  })

  it('a mostly sideways movement is horizontal; a mostly downwards one is not', () => {
    expect(swipeAxis(40, 12)).toBe('horizontal')
    expect(swipeAxis(-40, 12)).toBe('horizontal')
    expect(swipeAxis(12, 40)).toBe('vertical')
    // Reading the record while the thumb drifts sideways must keep scrolling.
    expect(swipeAxis(20, 30)).toBe('vertical')
  })
})

describe('decideSwipe (RF-311: what counts as passing to another artwork)', () => {
  const slow = { dy: 0, elapsed: 800, width: 400 }

  it('a long drag passes, a short one comes back', () => {
    expect(decideSwipe({ dx: -120, ...slow })).toBe('next')
    expect(decideSwipe({ dx: 120, ...slow })).toBe('previous')
    expect(decideSwipe({ dx: -50, ...slow })).toBeNull()
  })

  it('dragging to the right brings the previous one, like turning a page back', () => {
    expect(decideSwipe({ dx: 200, ...slow })).toBe('previous')
    expect(decideSwipe({ dx: -200, ...slow })).toBe('next')
  })

  it('a quick flick is enough, even if it is short', () => {
    expect(decideSwipe({ dx: -40, dy: 0, elapsed: 120, width: 400 })).toBe('next')
    // Same distance taken slowly is an indecisive drag, not a flick.
    expect(decideSwipe({ dx: -40, dy: 0, elapsed: 900, width: 400 })).toBeNull()
  })

  it('a vertical gesture never passes of artwork, however long', () => {
    expect(decideSwipe({ dx: 30, dy: 300, elapsed: 200, width: 400 })).toBeNull()
  })

  it('the threshold follows the screen, capped so a tablet is not a workout', () => {
    // A quarter of a narrow phone is less than the cap...
    expect(decideSwipe({ dx: -80, dy: 0, elapsed: 900, width: 320 })).toBe('next')
    expect(decideSwipe({ dx: -60, dy: 0, elapsed: 900, width: 320 })).toBeNull()
    // ...and on a wide screen the cap is what applies, not a fifth of 1200 px.
    expect(decideSwipe({ dx: -100, dy: 0, elapsed: 900, width: 1200 })).toBe('next')
  })
})

describe('dragOffset (RF-311: the end of the queue is felt in the hand)', () => {
  it('follows the finger when there is a neighbor to bring in', () => {
    expect(dragOffset(-90, true, 400)).toBe(-90)
  })

  it('barely moves when there is none: a rubber band, not a dead screen', () => {
    const resisted = dragOffset(-90, false, 400)
    expect(Math.abs(resisted)).toBeLessThan(20)
    expect(resisted).toBeLessThan(0)
  })

  it('never travels farther than the screen', () => {
    expect(dragOffset(-9999, true, 400)).toBe(-400)
    expect(dragOffset(9999, true, 400)).toBe(400)
  })
})
