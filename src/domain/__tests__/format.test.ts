import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  addMinutesToTime,
  differenceInDays,
  eachDay,
  formatDate,
  formatDateRange,
  formatDuration,
  formatLongDate,
  formatRelativeDay,
  formatShortDate,
  formatTime,
  isValidTime,
  parseISODate,
  timeToMinutes,
  toISODate,
  todayISO,
  tripLengthInDays,
} from '@/domain/format'

const NOW = '2025-03-01T09:30:00.000Z'

function useFrozenClock(iso: string): void {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
})

function untrusted(value: unknown): string {
  return value as string
}

describe('parseISODate', () => {
  it('parses a well-formed date at UTC midnight', () => {
    expect(parseISODate('2025-03-05')?.toISOString()).toBe('2025-03-05T00:00:00.000Z')
  })

  it('rejects a single-digit month', () => {
    expect(parseISODate('2025-3-05')).toBeNull()
  })

  it('rejects an out-of-range month', () => {
    expect(parseISODate('2025-13-01')).toBeNull()
  })

  it('rejects month zero', () => {
    expect(parseISODate('2025-00-10')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(parseISODate('')).toBeNull()
  })

  it('rejects free text', () => {
    expect(parseISODate('not-a-date')).toBeNull()
  })

  it('rejects a full ISO timestamp', () => {
    expect(parseISODate('2025-03-05T00:00:00.000Z')).toBeNull()
  })

  it('rejects a single-digit month and day without padding', () => {
    expect(parseISODate('2025-1-1')).toBeNull()
  })

  it('rejects a day beyond the length of the month instead of rolling it forward', () => {
    expect(parseISODate('2025-01-32')).toBeNull()
    expect(parseISODate('2025-04-31')).toBeNull()
    expect(parseISODate('2025-02-30')).toBeNull()
    expect(parseISODate('2025-06-31')).toBeNull()
    expect(parseISODate('2025-09-31')).toBeNull()
    expect(parseISODate('2025-11-31')).toBeNull()
  })

  it('rejects a leap day in a non-leap year', () => {
    expect(parseISODate('2025-02-29')).toBeNull()
  })

  it('rejects a leap day two centuries after a leap year', () => {
    expect(parseISODate('2100-02-29')).toBeNull()
  })

  it('rejects null', () => {
    expect(parseISODate(untrusted(null))).toBeNull()
  })

  it('rejects undefined', () => {
    expect(parseISODate(untrusted(undefined))).toBeNull()
  })

  it('rejects non-string input', () => {
    expect(parseISODate(untrusted(20250305))).toBeNull()
    expect(parseISODate(untrusted({ year: 2025, month: 3, day: 5 }))).toBeNull()
    expect(parseISODate(untrusted(['2025-03-05']))).toBeNull()
  })

  it('accepts a real leap day', () => {
    expect(parseISODate('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z')
  })

  it('accepts the last day of December', () => {
    expect(parseISODate('2025-12-31')?.toISOString()).toBe('2025-12-31T00:00:00.000Z')
  })

  it('round-trips every accepted date back to the same ISO string', () => {
    for (const iso of [
      '2024-02-29',
      '2025-01-01',
      '2025-12-31',
      '2025-02-28',
      '2025-04-30',
      '2025-08-31',
      '2026-03-01',
    ]) {
      const date = parseISODate(iso)
      expect(date).not.toBeNull()
      expect(date ? toISODate(date) : null).toBe(iso)
    }
  })

  it('never resolves an input to a different calendar day', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= 31; day += 1) {
        const iso = `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const date = parseISODate(iso)
        if (date === null) continue
        expect(date.getUTCMonth() + 1).toBe(month)
        expect(date.getUTCDate()).toBe(day)
      }
    }
  })
})

describe('toISODate', () => {
  it('keeps only the date portion in UTC', () => {
    expect(toISODate(new Date('2025-03-05T23:59:59.999Z'))).toBe('2025-03-05')
  })
})

describe('todayISO', () => {
  it('matches the yyyy-mm-dd shape', () => {
    useFrozenClock(NOW)
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns the UTC date of the frozen clock', () => {
    useFrozenClock(NOW)
    expect(todayISO()).toBe('2025-03-01')
  })

  it('reports the next UTC day once the clock rolls past midnight UTC', () => {
    useFrozenClock('2025-03-01T23:59:59.999Z')
    expect(todayISO()).toBe('2025-03-01')
    vi.setSystemTime(new Date('2025-03-02T00:00:00.000Z'))
    expect(todayISO()).toBe('2025-03-02')
  })
})

describe('formatDate', () => {
  it('formats a mid-trip date', () => {
    expect(formatDate('2025-03-05')).toBe('5 Mar 2025')
  })

  it('formats the last day of December', () => {
    expect(formatDate('2025-12-31')).toBe('31 Dec 2025')
  })

  it('formats a leap day', () => {
    expect(formatDate('2024-02-29')).toBe('29 Feb 2024')
  })

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatDate('2025-3-5')).toBe('2025-3-5')
  })

  it('returns an empty string unchanged', () => {
    expect(formatDate('')).toBe('')
  })
})

describe('formatShortDate', () => {
  it('formats a Wednesday with the short weekday', () => {
    expect(formatShortDate('2025-03-05')).toBe('Wed 5 Mar')
  })

  it('formats a Thursday in January across the year boundary', () => {
    expect(formatShortDate('2026-01-01')).toBe('Thu 1 Jan')
  })

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatShortDate('nope')).toBe('nope')
  })
})

describe('formatLongDate', () => {
  it('formats a mid-trip date with the full weekday and month', () => {
    expect(formatLongDate('2025-03-05')).toBe('Wednesday 5 March')
  })

  it('formats New Year’s Day', () => {
    expect(formatLongDate('2026-01-01')).toBe('Thursday 1 January')
  })

  it('formats a leap day', () => {
    expect(formatLongDate('2024-02-29')).toBe('Thursday 29 February')
  })

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatLongDate('nope')).toBe('nope')
  })
})

describe('formatDateRange', () => {
  it('collapses a same-day range to a single date', () => {
    expect(formatDateRange('2025-03-05', '2025-03-05')).toBe('5 Mar 2025')
  })

  it('joins a multi-day range with a spaced hyphen', () => {
    expect(formatDateRange('2025-03-05', '2025-03-09')).toBe('5 Mar 2025 - 9 Mar 2025')
  })

  it('spans a year boundary with both years shown', () => {
    expect(formatDateRange('2025-12-28', '2026-01-03')).toBe('28 Dec 2025 - 3 Jan 2026')
  })

  it('falls back to the start date when the end is missing', () => {
    expect(formatDateRange('2025-03-05', '')).toBe('5 Mar 2025')
  })

  it('returns an empty string when the start is missing', () => {
    expect(formatDateRange('', '2025-03-09')).toBe('')
  })
})

describe('addDays', () => {
  it('returns the same date for a zero offset', () => {
    expect(addDays('2025-03-05', 0)).toBe('2025-03-05')
  })

  it('adds one day inside a month', () => {
    expect(addDays('2025-03-05', 1)).toBe('2025-03-06')
  })

  it('rolls over a month boundary', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01')
  })

  it('rolls over a year boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('handles a leap year', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('subtracts a day across a month boundary', () => {
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28')
  })

  it('adds a multi-day span across a year boundary', () => {
    expect(addDays('2025-12-30', 5)).toBe('2026-01-04')
  })

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(addDays('2025-3-5', 1)).toBe('2025-3-5')
  })
})

describe('differenceInDays', () => {
  it('counts whole days forwards', () => {
    expect(differenceInDays('2025-01-01', '2025-01-08')).toBe(7)
  })

  it('counts whole days backwards as a negative span', () => {
    expect(differenceInDays('2025-01-08', '2025-01-01')).toBe(-7)
  })

  it('returns 0 for the same day', () => {
    expect(differenceInDays('2025-01-01', '2025-01-01')).toBe(0)
  })

  it('counts across a year boundary', () => {
    expect(differenceInDays('2025-12-30', '2026-01-04')).toBe(5)
  })

  it('returns 0 when the start cannot be parsed', () => {
    expect(differenceInDays('2025-1-1', '2025-01-08')).toBe(0)
  })

  it('returns 0 when the end cannot be parsed', () => {
    expect(differenceInDays('2025-01-08', 'nope')).toBe(0)
  })
})

describe('eachDay', () => {
  it('includes both endpoints', () => {
    expect(eachDay('2025-03-05', '2025-03-07')).toEqual(['2025-03-05', '2025-03-06', '2025-03-07'])
  })

  it('returns a single day for a same-day range', () => {
    expect(eachDay('2025-03-05', '2025-03-05')).toEqual(['2025-03-05'])
  })

  it('returns an empty array for a backwards range', () => {
    expect(eachDay('2025-03-07', '2025-03-05')).toEqual([])
  })
})

describe('tripLengthInDays', () => {
  it('counts an inclusive single-day trip as 1', () => {
    expect(tripLengthInDays('2025-03-05', '2025-03-05')).toBe(1)
  })

  it('counts both endpoints of a six-night span as 7', () => {
    expect(tripLengthInDays('2025-01-01', '2025-01-07')).toBe(7)
  })

  it('counts a trip across a year boundary', () => {
    expect(tripLengthInDays('2025-12-30', '2026-01-02')).toBe(4)
  })

  it('returns a non-positive length for a backwards range', () => {
    expect(tripLengthInDays('2025-03-07', '2025-03-05')).toBe(-1)
  })
})

describe('formatTime', () => {
  it('renders midnight as 12 AM', () => {
    expect(formatTime('00:00')).toBe('12:00 AM')
  })

  it('renders 01:00 as 1 AM', () => {
    expect(formatTime('01:00')).toBe('1:00 AM')
  })

  it('renders 11:59 as 11:59 AM', () => {
    expect(formatTime('11:59')).toBe('11:59 AM')
  })

  it('renders noon as 12 PM', () => {
    expect(formatTime('12:00')).toBe('12:00 PM')
  })

  it('wraps 13:05 to 1:05 PM', () => {
    expect(formatTime('13:05')).toBe('1:05 PM')
  })

  it('wraps 23:59 to 11:59 PM', () => {
    expect(formatTime('23:59')).toBe('11:59 PM')
  })

  it('keeps the zero minutes suffix in 12-hour labels', () => {
    expect(formatTime('09:05')).toBe('9:05 AM')
  })

  it('returns null for a single-digit hour', () => {
    expect(formatTime('9:30')).toBeNull()
  })

  it('returns null for a single-digit minute', () => {
    expect(formatTime('09:5')).toBeNull()
  })

  it('returns null for free text', () => {
    expect(formatTime('lunchtime')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(formatTime('')).toBeNull()
  })

  it('returns null for hour 24 rather than rolling into the next day', () => {
    expect(formatTime('24:00')).toBeNull()
    expect(formatTime('24:30')).toBeNull()
    expect(formatTime('25:00')).toBeNull()
  })

  it('returns null for minute 60 rather than rolling into the next hour', () => {
    expect(formatTime('09:60')).toBeNull()
    expect(formatTime('12:60')).toBeNull()
  })

  it('returns null for a non-numeric time', () => {
    expect(formatTime('ab:cd')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(formatTime(untrusted(null))).toBeNull()
    expect(formatTime(untrusted(undefined))).toBeNull()
    expect(formatTime(untrusted(905))).toBeNull()
  })

  it('never renders a clock time other than the input', () => {
    for (let hours = 0; hours < 24; hours += 1) {
      for (const minutes of [0, 5, 30, 59]) {
        const iso = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
        const label = formatTime(iso)
        expect(label).not.toBeNull()
        const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(label ?? '')
        expect(match).not.toBeNull()
        expect(match?.[2]).toBe(iso.slice(3))
        expect(match?.[3]).toBe(hours >= 12 ? 'PM' : 'AM')
        expect(Number(match?.[1]) % 12).toBe(hours % 12)
      }
    }
  })

  it('renders every minute of the day without drifting onto another minute', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
      const hours = Math.floor(minutes / 60)
      const rest = minutes % 60
      const iso = `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
      const label = formatTime(iso)
      const match = label === null ? null : /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(label)
      expect(match?.[2]).toBe(iso.slice(3))
      expect(Number(match?.[1]) % 12).toBe(hours % 12)
    }
  })

  it('returns null for every input isValidTime rejects', () => {
    for (const invalid of [
      '',
      'lunchtime',
      '9:30',
      '9:5',
      '09:5',
      'ab:cd',
      '24:00',
      '24:30',
      '25:00',
      '99:99',
      '12:60',
      '00:60',
      '-1:00',
      '12:5a',
      '12:00:00',
      ' 12:00',
      '12:00 ',
    ]) {
      expect(isValidTime(invalid)).toBe(false)
      expect(formatTime(invalid)).toBeNull()
    }
  })

  it('returns a label for every input isValidTime accepts', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
      const hours = Math.floor(minutes / 60)
      const rest = minutes % 60
      const iso = `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
      expect(isValidTime(iso)).toBe(true)
      expect(formatTime(iso)).not.toBeNull()
    }
  })
})

describe('timeToMinutes', () => {
  it('converts a 24h time to minutes from midnight', () => {
    expect(timeToMinutes('09:30')).toBe(570)
  })

  it('converts midnight to zero', () => {
    expect(timeToMinutes('00:00')).toBe(0)
  })

  it('returns 0 for an unparseable time', () => {
    expect(timeToMinutes('lunchtime')).toBe(0)
  })
})

describe('formatDuration', () => {
  it('returns Flexible for zero', () => {
    expect(formatDuration(0)).toBe('Flexible')
  })

  it('returns Flexible for a negative duration', () => {
    expect(formatDuration(-30)).toBe('Flexible')
  })

  it('returns Flexible for NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('Flexible')
  })

  it('returns Flexible for Infinity', () => {
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('Flexible')
  })

  it('formats a sub-hour duration in minutes', () => {
    expect(formatDuration(45)).toBe('45 min')
  })

  it('formats a single minute', () => {
    expect(formatDuration(1)).toBe('1 min')
  })

  it('formats an exact hour without minutes', () => {
    expect(formatDuration(60)).toBe('1 hr')
  })

  it('formats hours and leftover minutes', () => {
    expect(formatDuration(90)).toBe('1 hr 30 min')
  })

  it('formats a long duration', () => {
    expect(formatDuration(1440)).toBe('24 hr')
  })
})

describe('formatRelativeDay', () => {
  it('labels the trip start as Day 1', () => {
    expect(formatRelativeDay('2025-03-05', '2025-03-05')).toBe('Day 1')
  })

  it('labels the second day as Day 2', () => {
    expect(formatRelativeDay('2025-03-06', '2025-03-05')).toBe('Day 2')
  })

  it('labels a date before the start as Day 1', () => {
    expect(formatRelativeDay('2025-03-04', '2025-03-05')).toBe('Day 1')
  })
})

describe('isValidTime', () => {
  it('accepts midnight', () => {
    expect(isValidTime('00:00')).toBe(true)
  })

  it('accepts the last minute of the day', () => {
    expect(isValidTime('23:59')).toBe(true)
  })

  it('accepts midday', () => {
    expect(isValidTime('12:00')).toBe(true)
  })

  it('rejects hour 24', () => {
    expect(isValidTime('24:00')).toBe(false)
  })

  it('rejects minute 60', () => {
    expect(isValidTime('12:60')).toBe(false)
  })

  it('rejects a single-digit hour', () => {
    expect(isValidTime('9:30')).toBe(false)
  })

  it('rejects a single-digit minute', () => {
    expect(isValidTime('09:5')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidTime('')).toBe(false)
  })

  it('rejects free text', () => {
    expect(isValidTime('morning')).toBe(false)
  })
})

describe('addMinutesToTime', () => {
  it('adds an exact number of minutes', () => {
    expect(addMinutesToTime('09:00', 90)).toBe('10:30')
  })

  it('returns the same time for a zero offset', () => {
    expect(addMinutesToTime('09:00', 0)).toBe('09:00')
  })

  it('rounds a fractional offset up', () => {
    expect(addMinutesToTime('09:00', 30.6)).toBe('09:31')
  })

  it('rounds a fractional offset down', () => {
    expect(addMinutesToTime('09:00', 30.4)).toBe('09:30')
  })

  it('clamps a negative offset to zero', () => {
    expect(addMinutesToTime('09:00', -30)).toBe('09:00')
  })

  it('clamps a midnight overflow to 23:59 instead of wrapping to the next day', () => {
    expect(addMinutesToTime('23:30', 60)).toBe('23:59')
  })

  it('clamps an exact end-of-day addition to 23:59', () => {
    expect(addMinutesToTime('23:59', 30)).toBe('23:59')
  })

  it('treats an unparseable time as midnight', () => {
    expect(addMinutesToTime('not-a-time', 30)).toBe('00:30')
  })

  it('crosses the hour boundary while staying in the same day', () => {
    expect(addMinutesToTime('23:00', 45)).toBe('23:45')
  })
})
