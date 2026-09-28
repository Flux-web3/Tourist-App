import { afterEach, describe, expect, it, vi } from 'vitest'
import { createId, nowISO } from '@/domain/ids'

afterEach(() => {
  vi.useRealTimers()
})

describe('createId', () => {
  it('returns a non-empty string', () => {
    expect(typeof createId('trip')).toBe('string')
    expect(createId('trip').length).toBeGreaterThan(0)
  })

  it('keeps the supplied prefix at the start of the id', () => {
    expect(createId('trip').startsWith('trip_')).toBe(true)
  })

  it('keeps a multi-character prefix', () => {
    expect(createId('itm').startsWith('itm_')).toBe(true)
  })

  it('appends a single underscore after the prefix', () => {
    expect(createId('trip')).toMatch(/^trip_/)
    expect(createId('trip').indexOf('_')).toBe(4)
  })

  it('produces only lowercase alphanumeric characters after the prefix', () => {
    expect(createId('itm')).toMatch(/^itm_[0-9a-z]+$/)
  })

  it('produces the same character set for every supported prefix', () => {
    for (const prefix of ['usr', 'trip', 'exp', 'itm', 'day']) {
      expect(createId(prefix)).toMatch(new RegExp(`^${prefix}_[0-9a-z]+$`))
    }
  })

  it('never returns an id that is just the prefix', () => {
    expect(createId('x').length).toBeGreaterThan(2)
  })

  it('differs between prefixes', () => {
    expect(createId('trip').startsWith('exp_')).toBe(false)
  })

  it('is unique across 1000 calls', () => {
    const ids = new Set<string>()
    for (let index = 0; index < 1000; index += 1) {
      ids.add(createId('itm'))
    }
    expect(ids.size).toBe(1000)
  })

  it('is unique across repeated calls with the same prefix', () => {
    expect(createId('exp')).not.toBe(createId('exp'))
  })

  it('is unique even when every call lands in the same millisecond', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-01T09:30:00.000Z'))
    const ids = new Set<string>()
    for (let index = 0; index < 50; index += 1) {
      ids.add(createId('itm'))
    }
    expect(ids.size).toBe(50)
  })

  it('embeds the base-36 timestamp immediately after the prefix', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-01T09:30:00.000Z'))
    expect(createId('itm')).toMatch(/^itm_m7q044w0[0-9a-z]+$/)
  })

  it('produces a different id for a different prefix at the same instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-01T09:30:00.000Z'))
    expect(createId('trip')).not.toBe(createId('exp'))
  })
})

describe('nowISO', () => {
  it('returns the current instant as an ISO string', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-01T09:30:00.000Z'))
    expect(nowISO()).toBe('2025-03-01T09:30:00.000Z')
  })

  it('matches the ISO 8601 shape', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-01T09:30:00.000Z'))
    expect(nowISO()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('sorts lexicographically in chronological order', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-01T09:30:00.000Z'))
    const earlier = nowISO()
    vi.setSystemTime(new Date('2025-03-01T09:31:00.000Z'))
    const later = nowISO()
    expect(earlier < later).toBe(true)
  })
})
