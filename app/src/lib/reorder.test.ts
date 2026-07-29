import { describe, expect, it } from 'vitest'
import { moveItem } from './reorder'

describe('moveItem (RF-401: rearranging the photos of an artwork)', () => {
  const items = ['a', 'b', 'c', 'd']

  it('moves forward: the rest close the gap', () => {
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves backward', () => {
    expect(moveItem(items, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moving onto itself changes nothing', () => {
    expect(moveItem(items, 2, 2)).toEqual(items)
  })

  it('does not mutate the input', () => {
    moveItem(items, 0, 3)
    expect(items).toEqual(['a', 'b', 'c', 'd'])
  })

  it('clamps a drag that ends past the edge', () => {
    expect(moveItem(items, 0, 99)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveItem(items, 3, -5)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('an empty list is an empty list', () => {
    expect(moveItem([], 0, 1)).toEqual([])
  })
})
