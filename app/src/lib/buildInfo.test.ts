import { describe, expect, it } from 'vitest'
import { apiHost, cleanRange, formatBuildDate } from './buildInfo'

describe('cleanRange (the declared range, readable)', () => {
  it('drops the range prefix', () => {
    expect(cleanRange('^7.18.1')).toBe('7.18.1')
    expect(cleanRange('~1.2.0')).toBe('1.2.0')
    expect(cleanRange('18.3.1')).toBe('18.3.1')
  })

  it('survives a missing dependency instead of printing "undefined"', () => {
    expect(cleanRange(undefined)).toBe('')
  })
})

describe('formatBuildDate', () => {
  it('writes the date in Spanish and Madrid time', () => {
    // Noon UTC in July is 14:00 in Madrid (CEST).
    const shown = formatBuildDate('2026-07-29T12:00:00.000Z')
    expect(shown).toContain('2026')
    expect(shown).toContain('14:00')
  })

  it('says nothing rather than "Invalid Date"', () => {
    expect(formatBuildDate('no es una fecha')).toBe('—')
  })
})

describe('apiHost (production or the local stack, at a glance)', () => {
  it('keeps only the host', () => {
    expect(apiHost('https://abcdef.supabase.co')).toBe('abcdef.supabase.co')
    expect(apiHost('http://localhost:8321')).toBe('localhost:8321')
  })

  it('does not break with an unconfigured URL', () => {
    expect(apiHost('')).toBe('—')
  })
})
