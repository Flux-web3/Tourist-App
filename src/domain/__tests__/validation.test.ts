import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TRIP_LIMITS,
  TRAVEL_PACES,
  createEmptyDraft,
  suggestTripName,
  validateTripDraft,
} from '@/domain/validation'
import type { CurrencyCode, TripDraft } from '@/domain/types'

const FROZEN_NOW = '2025-03-01T09:30:00.000Z'

function freezeClock(): void {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FROZEN_NOW))
}

function validDraft(): TripDraft {
  return {
    name: 'Spring in Kyoto',
    origin: 'Lisbon',
    destination: 'Kyoto',
    startDate: '2025-03-10',
    endDate: '2025-03-14',
    travelers: 2,
    budget: 2500,
    currency: 'EUR',
    interests: ['food', 'culture'],
    pace: 'balanced',
    notes: '',
  }
}

function draftWith(patch: Partial<TripDraft>): TripDraft {
  return { ...validDraft(), ...patch }
}

function draftWithRawName(name: unknown): TripDraft {
  return { ...validDraft(), name } as TripDraft
}

afterEach(() => {
  vi.useRealTimers()
})

describe('TRIP_LIMITS', () => {
  it('caps a trip name at 80 characters', () => {
    expect(TRIP_LIMITS.maxNameLength).toBe(80)
  })

  it('caps trips at 30 days', () => {
    expect(TRIP_LIMITS.maxDays).toBe(30)
  })

  it('requires at least 1 day', () => {
    expect(TRIP_LIMITS.minDays).toBe(1)
  })

  it('allows up to 12 travellers', () => {
    expect(TRIP_LIMITS.maxTravelers).toBe(12)
  })

  it('requires at least 1 traveller', () => {
    expect(TRIP_LIMITS.minTravelers).toBe(1)
  })

  it('caps the budget at 1,000,000', () => {
    expect(TRIP_LIMITS.maxBudget).toBe(1_000_000)
  })
})

describe('TRAVEL_PACES', () => {
  it('offers exactly the three supported paces', () => {
    expect(TRAVEL_PACES.map((pace) => pace.value)).toEqual(['relaxed', 'balanced', 'packed'])
  })

  it('gives every pace a human label', () => {
    expect(TRAVEL_PACES.map((pace) => pace.label)).toEqual(['Relaxed', 'Balanced', 'Packed'])
  })

  it('gives every pace a hint', () => {
    for (const pace of TRAVEL_PACES) {
      expect(pace.hint.length).toBeGreaterThan(0)
    }
  })

  it('describes the balanced pace as two or three anchors a day', () => {
    expect(TRAVEL_PACES[1].hint).toBe('Two or three anchors a day')
  })
})

describe('createEmptyDraft', () => {
  it('starts with blank text fields', () => {
    const draft = createEmptyDraft()
    expect(draft.name).toBe('')
    expect(draft.origin).toBe('')
    expect(draft.destination).toBe('')
    expect(draft.startDate).toBe('')
    expect(draft.endDate).toBe('')
    expect(draft.notes).toBe('')
  })

  it('defaults to 2 travellers', () => {
    expect(createEmptyDraft().travelers).toBe(2)
  })

  it('defaults to a budget of 2500', () => {
    expect(createEmptyDraft().budget).toBe(2500)
  })

  it('defaults to EUR', () => {
    expect(createEmptyDraft().currency).toBe('EUR')
  })

  it('defaults to no interests', () => {
    expect(createEmptyDraft().interests).toEqual([])
  })

  it('defaults to a balanced pace', () => {
    expect(createEmptyDraft().pace).toBe('balanced')
  })

  it('returns a fresh object each call', () => {
    const first = createEmptyDraft()
    const second = createEmptyDraft()
    expect(first).not.toBe(second)
    expect(first.interests).not.toBe(second.interests)
  })
})

describe('validateTripDraft accepts', () => {
  it('accepts a fully valid draft', () => {
    freezeClock()
    expect(validateTripDraft(validDraft())).toEqual({ errors: {}, isValid: true })
  })

  it('accepts a same-day trip', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ startDate: '2025-03-10', endDate: '2025-03-10' }))
    expect(result.isValid).toBe(true)
  })

  it('accepts a 30-day trip at the limit', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ startDate: '2025-03-01', endDate: '2025-03-30' }))
    expect(result.isValid).toBe(true)
  })

  it('accepts a start date of today', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ startDate: '2025-03-01', endDate: '2025-03-04' }))
    expect(result.errors.startDate).toBeUndefined()
  })

  it('accepts 1 traveller at the minimum', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ travelers: 1 })).errors.travelers).toBeUndefined()
  })

  it('accepts 12 travellers at the maximum', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ travelers: 12 })).errors.travelers).toBeUndefined()
  })

  it('accepts a budget of exactly 1,000,000', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ budget: 1_000_000 })).errors.budget).toBeUndefined()
  })

  it('accepts the smallest positive budget', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ budget: 0.01 })).errors.budget).toBeUndefined()
  })

  it('accepts a single interest', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ interests: ['food'] }))
    expect(result.errors.interests).toBeUndefined()
  })

  it('accepts a name padded with surrounding whitespace', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ name: '  Kyoto  ' })).errors.name).toBeUndefined()
  })

  it('accepts every supported currency', () => {
    freezeClock()
    for (const currency of ['EUR', 'USD', 'GBP', 'NGN', 'JPY'] as CurrencyCode[]) {
      expect(validateTripDraft(draftWith({ currency })).errors.currency).toBeUndefined()
    }
  })
})

describe('validateTripDraft leaves a blank name to the caller', () => {
  it('accepts an undefined name, because the caller names the trip', () => {
    freezeClock()
    expect(validateTripDraft(draftWithRawName(undefined)).errors.name).toBeUndefined()
  })

  it('accepts a null name, because the caller names the trip', () => {
    freezeClock()
    expect(validateTripDraft(draftWithRawName(null)).errors.name).toBeUndefined()
  })

  it('accepts a blank name, because the caller names the trip', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ name: '' })).errors.name).toBeUndefined()
  })

  it('accepts a whitespace-only name, because the caller names the trip', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ name: '   ' }))
    expect(result.errors.name).toBeUndefined()
    expect(result.isValid).toBe(true)
  })

  it('accepts a name of exactly the character limit', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ name: 'K'.repeat(TRIP_LIMITS.maxNameLength) }))
    expect(result.errors.name).toBeUndefined()
    expect(result.isValid).toBe(true)
  })

  it('rejects a name one character over the limit', () => {
    freezeClock()
    const result = validateTripDraft(
      draftWith({ name: 'K'.repeat(TRIP_LIMITS.maxNameLength + 1) }),
    )
    expect(result.errors.name).toBe('Keep the name to 80 characters or fewer.')
    expect(result.isValid).toBe(false)
  })

  it('rejects a name well over the limit', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ name: 'K'.repeat(500) }))
    expect(result.errors.name).toBe('Keep the name to 80 characters or fewer.')
  })

  it('measures the raw value, so a padded name over the limit is rejected', () => {
    freezeClock()
    const padded = `  ${'K'.repeat(TRIP_LIMITS.maxNameLength)}  `
    expect(validateTripDraft(draftWith({ name: padded })).errors.name).toBe(
      'Keep the name to 80 characters or fewer.',
    )
  })

  it('does not throw when the value is not a string', () => {
    freezeClock()
    const result = validateTripDraft(draftWithRawName(42))
    expect(result.errors.name).toBeUndefined()
    expect(result.isValid).toBe(true)
  })

  it('still reports the other field errors alongside a blank name', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ name: '', destination: '' }))
    expect(Object.keys(result.errors).sort()).toEqual(['destination'])
  })
})

describe('validateTripDraft rejects destination', () => {
  it('rejects a blank destination', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ destination: '' })).errors.destination).toBe(
      'Enter a destination with at least 2 characters.',
    )
  })

  it('rejects a whitespace-only destination', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ destination: '   ' })).errors.destination).toBeDefined()
  })

  it('rejects a single-character destination', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ destination: 'K' })).errors.destination).toBeDefined()
  })

  it('marks the draft invalid', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ destination: '' })).isValid).toBe(false)
  })
})

describe('validateTripDraft rejects origin', () => {
  it('rejects a blank origin', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ origin: '' })).errors.origin).toBe(
      'Enter where you are travelling from.',
    )
  })

  it('rejects a whitespace-only origin', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ origin: '  ' })).errors.origin).toBeDefined()
  })

  it('rejects a single-character origin', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ origin: 'L' })).errors.origin).toBeDefined()
  })
})

describe('validateTripDraft rejects dates', () => {
  it('rejects a start date in the past', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ startDate: '2025-02-28', endDate: '2025-03-04' }))
    expect(result.errors.startDate).toBe('Start date cannot be in the past.')
  })

  it('rejects a blank start date', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ startDate: '' })).errors.startDate).toBe(
      'Choose a start date.',
    )
  })

  it('rejects an unparseable start date', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ startDate: '10/03/2025' })).errors.startDate).toBe(
      'Choose a start date.',
    )
  })

  it('rejects a blank end date', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ endDate: '' })).errors.endDate).toBe('Choose an end date.')
  })

  it('rejects an end date before the start date', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ startDate: '2025-03-10', endDate: '2025-03-09' }))
    expect(result.errors.endDate).toBe('End date must be on or after the start date.')
  })

  it('rejects a trip longer than the day cap', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ startDate: '2025-03-01', endDate: '2025-03-31' }))
    expect(result.errors.endDate).toBe('Keep trips to 30 days or fewer.')
  })

  it('skips the ordering check when the start date cannot be parsed', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ startDate: 'nonsense', endDate: '2025-03-10' }))
    expect(result.errors.startDate).toBe('Choose a start date.')
    expect(result.errors.endDate).toBeUndefined()
  })
})

/**
 * A start date in the past is refused when it is being chosen and allowed when it
 * is being carried over. Without the distinction a trip became permanently
 * uneditable the day it began: its budget, notes, interests, pace and name were
 * all frozen behind a start date the traveller had no way to make valid again.
 */
describe('validateTripDraft and a trip that has already started', () => {
  const STARTED = '2025-02-20'

  it('accepts an in-progress trip whose start date is unchanged', () => {
    freezeClock()
    const result = validateTripDraft(
      draftWith({ startDate: STARTED, endDate: '2025-03-05' }),
      { previousStartDate: STARTED },
    )
    expect(result.errors.startDate).toBeUndefined()
    expect(result.isValid).toBe(true)
  })

  it('lets the rest of an in-progress trip be edited', () => {
    freezeClock()
    const result = validateTripDraft(
      draftWith({ startDate: STARTED, endDate: '2025-03-05', budget: 4000, notes: 'Extra night' }),
      { previousStartDate: STARTED },
    )
    expect(result.isValid).toBe(true)
  })

  it('still refuses a different start date that is in the past', () => {
    freezeClock()
    const result = validateTripDraft(
      draftWith({ startDate: '2025-02-10', endDate: '2025-03-05' }),
      { previousStartDate: STARTED },
    )
    expect(result.errors.startDate).toBe('Start date cannot be in the past.')
  })

  it('still refuses an unchanged start date that is not a real calendar date', () => {
    freezeClock()
    const result = validateTripDraft(
      draftWith({ startDate: '2025-02-30', endDate: '2025-03-05' }),
      { previousStartDate: '2025-02-30' },
    )
    expect(result.errors.startDate).toBe('Choose a start date.')
  })

  it('still applies the ordering and length rules to an in-progress trip', () => {
    freezeClock()
    const tooShort = validateTripDraft(
      draftWith({ startDate: STARTED, endDate: '2025-02-19' }),
      { previousStartDate: STARTED },
    )
    expect(tooShort.errors.endDate).toBe('End date must be on or after the start date.')

    const tooLong = validateTripDraft(
      draftWith({ startDate: STARTED, endDate: '2025-04-30' }),
      { previousStartDate: STARTED },
    )
    expect(tooLong.errors.endDate).toBe('Keep trips to 30 days or fewer.')
  })

  it('keeps the rule firm for creation, where there is no previous value', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ startDate: STARTED, endDate: '2025-03-05' }))
    expect(result.errors.startDate).toBe('Start date cannot be in the past.')
  })

  it('keeps the rule firm when the context is supplied but empty', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ startDate: STARTED, endDate: '2025-03-05' }), {})
    expect(result.errors.startDate).toBe('Start date cannot be in the past.')
  })

  it('does not excuse a past start date just because some other value matches', () => {
    freezeClock()
    const result = validateTripDraft(
      draftWith({ startDate: STARTED, endDate: '2025-03-05' }),
      { previousStartDate: '2025-03-10' },
    )
    expect(result.errors.startDate).toBe('Start date cannot be in the past.')
  })
})

describe('validateTripDraft rejects travellers', () => {
  it('rejects 0 travellers', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ travelers: 0 })).errors.travelers).toBe(
      'At least 1 traveller is required.',
    )
  })

  it('rejects a negative traveller count', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ travelers: -3 })).errors.travelers).toBeDefined()
  })

  it('rejects a fractional traveller count', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ travelers: 2.5 })).errors.travelers).toBe(
      'At least 1 traveller is required.',
    )
  })

  it('rejects NaN travellers', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ travelers: Number.NaN })).errors.travelers).toBeDefined()
  })

  it('rejects 13 travellers', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ travelers: 13 })).errors.travelers).toBe(
      'Up to 12 travellers.',
    )
  })
})

describe('validateTripDraft rejects budget', () => {
  it('rejects a zero budget', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ budget: 0 })).errors.budget).toBe(
      'Enter a budget greater than 0.',
    )
  })

  it('rejects a negative budget', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ budget: -100 })).errors.budget).toBe(
      'Enter a budget greater than 0.',
    )
  })

  it('rejects a NaN budget', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ budget: Number.NaN })).errors.budget).toBeDefined()
  })

  it('rejects a budget above 1,000,000', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ budget: 1_000_001 })).errors.budget).toBe(
      'That budget looks unrealistic. Enter a lower amount.',
    )
  })
})

describe('validateTripDraft rejects interests and currency', () => {
  it('rejects zero selected interests', () => {
    freezeClock()
    expect(validateTripDraft(draftWith({ interests: [] })).errors.interests).toBe(
      'Choose at least one interest so the draft matches you.',
    )
  })

  it('rejects an unsupported currency', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ currency: 'CHF' as CurrencyCode }))
    expect(result.errors.currency).toBe('Choose a supported currency.')
  })

  it('rejects a lowercase currency code', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ currency: 'eur' as CurrencyCode }))
    expect(result.errors.currency).toBeDefined()
  })
})

describe('validateTripDraft error aggregation', () => {
  it('collects every invalid field at once', () => {
    freezeClock()
    const result = validateTripDraft({
      ...createEmptyDraft(),
      origin: '',
      destination: '',
      travelers: 0,
      budget: 0,
      currency: 'CHF' as CurrencyCode,
      interests: [],
    })
    expect(Object.keys(result.errors).sort()).toEqual([
      'budget',
      'currency',
      'destination',
      'endDate',
      'interests',
      'origin',
      'startDate',
      'travelers',
    ])
  })

  it('marks a multi-error draft invalid', () => {
    freezeClock()
    const result = validateTripDraft({ ...createEmptyDraft(), origin: '', destination: '' })
    expect(result.isValid).toBe(false)
  })

  it('leaves valid fields out of the error map', () => {
    freezeClock()
    const result = validateTripDraft(draftWith({ destination: '' }))
    expect(Object.keys(result.errors)).toEqual(['destination'])
  })
})

describe('validateTripDraft rejects the empty draft', () => {
  it('is invalid', () => {
    freezeClock()
    expect(validateTripDraft(createEmptyDraft()).isValid).toBe(false)
  })

  it('leaves the blank name for the caller to fill in', () => {
    freezeClock()
    expect(validateTripDraft(createEmptyDraft()).errors.name).toBeUndefined()
  })

  it('flags the blank location fields', () => {
    freezeClock()
    const { errors } = validateTripDraft(createEmptyDraft())
    expect(errors.origin).toBeDefined()
    expect(errors.destination).toBeDefined()
  })

  it('flags the blank dates', () => {
    freezeClock()
    const { errors } = validateTripDraft(createEmptyDraft())
    expect(errors.startDate).toBe('Choose a start date.')
    expect(errors.endDate).toBe('Choose an end date.')
  })

  it('flags the empty interest list', () => {
    freezeClock()
    expect(validateTripDraft(createEmptyDraft()).errors.interests).toBeDefined()
  })

  it('does not flag the default traveller count', () => {
    freezeClock()
    expect(validateTripDraft(createEmptyDraft()).errors.travelers).toBeUndefined()
  })

  it('does not flag the default budget', () => {
    freezeClock()
    expect(validateTripDraft(createEmptyDraft()).errors.budget).toBeUndefined()
  })
})

describe('suggestTripName', () => {
  it('combines the destination with the month of the start date', () => {
    expect(suggestTripName('Kyoto', '2025-03-10')).toBe('Kyoto in March')
  })

  it('names January trips', () => {
    expect(suggestTripName('Oslo', '2026-01-01')).toBe('Oslo in January')
  })

  it('names December trips', () => {
    expect(suggestTripName('Oslo', '2025-12-31')).toBe('Oslo in December')
  })

  it('trims surrounding whitespace from the destination', () => {
    expect(suggestTripName('  Kyoto  ', '2025-03-10')).toBe('Kyoto in March')
  })

  it('falls back to Untitled trip for an empty destination', () => {
    expect(suggestTripName('', '2025-03-10')).toBe('Untitled trip')
  })

  it('falls back to Untitled trip for a whitespace-only destination', () => {
    expect(suggestTripName('    ', '2025-03-10')).toBe('Untitled trip')
  })

  it('prefers the empty-destination fallback even with an unparseable date', () => {
    expect(suggestTripName('', 'nonsense')).toBe('Untitled trip')
  })

  it('drops the month when the start date cannot be parsed', () => {
    expect(suggestTripName('Kyoto', 'nonsense')).toBe('Trip to Kyoto')
  })

  it('drops the month when the start date is blank', () => {
    expect(suggestTripName('Kyoto', '')).toBe('Trip to Kyoto')
  })

  it('uses the start date month, not the end date', () => {
    expect(suggestTripName('Kyoto', '2025-11-30')).toBe('Kyoto in November')
  })
})
