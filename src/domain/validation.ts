import { getDestination } from '@/data/destinations'
import { CURRENCIES, CURRENCY_MAGNITUDE } from './money'
import { parseISODate, todayISO, tripLengthInDays } from './format'
import type { CurrencyCode, TripDraft, TripDraftErrors } from './types'

export const TRIP_LIMITS = {
  maxNameLength: 80,
  maxDays: 30,
  minDays: 1,
  maxTravelers: 12,
  minTravelers: 1,
  maxBudget: 1_000_000,
} as const

/** The budget ceiling in `currency`: `TRIP_LIMITS.maxBudget` euro-sized units, scaled. */
export function maxBudgetFor(currency: CurrencyCode): number {
  return TRIP_LIMITS.maxBudget * (CURRENCY_MAGNITUDE[currency] ?? 1)
}

/** The starting budget a new trip proposes in `currency`: 2,500 euro-sized units, scaled. */
export function defaultBudgetFor(currency: CurrencyCode): number {
  return DEFAULT_BUDGET * (CURRENCY_MAGNITUDE[currency] ?? 1)
}

const DEFAULT_BUDGET = 2500

export const NOTE_LIMITS = {
  maxTitleLength: 80,
  maxBodyLength: 2000,
  minBodyLength: 1,
} as const

export interface NoteDraft {
  title: string
  body: string
}

export type NoteDraftErrors = Partial<Record<keyof NoteDraft, string>>

export const TRAVEL_PACES = [
  { value: 'relaxed', label: 'Relaxed', hint: 'One anchor a day, plenty of breathing room' },
  { value: 'balanced', label: 'Balanced', hint: 'Two or three anchors a day' },
  { value: 'packed', label: 'Packed', hint: 'Fill every usable hour' },
] as const

/**
 * A default trip name: "London in October". Given a catalogue `destinationId`
 * it uses the city alone, because "London, United Kingdom in October" reads like
 * an address. Without one (a pre-catalogue trip, or a caller holding only text)
 * the destination text is used as given.
 */
export function suggestTripName(
  destination: string,
  startISO: string,
  destinationId?: string | null,
): string {
  const place = (getDestination(destinationId)?.city ?? destination).trim()
  if (!place) return 'Untitled trip'
  if (!parseISODate(startISO)) return `Trip to ${place}`
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${startISO}T00:00:00Z`),
  )
  return `${place} in ${month}`
}

/**
 * Extra facts about *where the draft came from*, which the rules need in order
 * to stay honest about a trip that has already begun.
 */
export interface TripDraftContext {
  /**
   * The `startDate` already stored on the trip being edited.
   *
   * A start date in the past is refused when it is being *chosen*, because
   * nobody plans a trip backwards. It must not be refused when it is merely
   * being *carried over*: once a trip begins, its own start date is in the past
   * for the rest of the trip, and treating that as an error freezes the budget,
   * the notes, the interests, the pace and the name for good. Leave this unset
   * for trip creation, where there is no previous value and the rule is firm.
   */
  previousStartDate?: string
  /**
   * The destination already stored on the trip being edited.
   *
   * A new destination has to come from the catalogue. A trip saved before the
   * catalogue existed may hold a city it does not cover ("Lisbon", with a null
   * `destinationId`); refusing that on edit would force the traveller to change
   * city just to fix a typo in the notes. So an unlisted destination is accepted
   * only while it is carried over unchanged from a trip that was already
   * unlisted. Leave this unset for trip creation, where the rule is firm.
   */
  previousDestination?: { destination: string; destinationId: string | null }
}

export const DESTINATION_REQUIRED_MESSAGE = 'Choose a destination from the list.'

function isCarriedOverUnlistedDestination(draft: TripDraft, context: TripDraftContext): boolean {
  const previous = context.previousDestination
  // `?? null` because a snapshot or caller from before the field existed has it undefined.
  if (!previous || (previous.destinationId ?? null) !== null || (draft.destinationId ?? null) !== null) {
    return false
  }
  const text = draft.destination.trim()
  return text !== '' && text === previous.destination.trim()
}

export function validateTripDraft(
  draft: TripDraft,
  context: TripDraftContext = {},
): { errors: TripDraftErrors; isValid: boolean } {
  const errors: TripDraftErrors = {}

  const name = typeof draft.name === 'string' ? draft.name : ''
  if (name.length > TRIP_LIMITS.maxNameLength) {
    errors.name = `Keep the name to ${TRIP_LIMITS.maxNameLength} characters or fewer.`
  }

  if (!getDestination(draft.destinationId) && !isCarriedOverUnlistedDestination(draft, context)) {
    errors.destination = DESTINATION_REQUIRED_MESSAGE
  }

  if (draft.origin.trim().length < 2) {
    errors.origin = 'Enter where you are travelling from.'
  }

  const start = parseISODate(draft.startDate)
  const startUnchanged =
    context.previousStartDate !== undefined && draft.startDate === context.previousStartDate
  if (!start) {
    errors.startDate = 'Choose a start date.'
  } else if (!startUnchanged && draft.startDate < todayISO()) {
    errors.startDate = 'Start date cannot be in the past.'
  }

  const end = parseISODate(draft.endDate)
  if (!end) {
    errors.endDate = 'Choose an end date.'
  } else if (start && draft.endDate < draft.startDate) {
    errors.endDate = 'End date must be on or after the start date.'
  } else if (start && end) {
    const length = tripLengthInDays(draft.startDate, draft.endDate)
    if (length < TRIP_LIMITS.minDays) {
      errors.endDate = 'A trip must be at least 1 day.'
    } else if (length > TRIP_LIMITS.maxDays) {
      errors.endDate = `Keep trips to ${TRIP_LIMITS.maxDays} days or fewer.`
    }
  }

  if (!Number.isInteger(draft.travelers) || draft.travelers < TRIP_LIMITS.minTravelers) {
    errors.travelers = 'At least 1 traveller is required.'
  } else if (draft.travelers > TRIP_LIMITS.maxTravelers) {
    errors.travelers = `Up to ${TRIP_LIMITS.maxTravelers} travellers.`
  }

  if (!Number.isFinite(draft.budget) || draft.budget <= 0) {
    errors.budget = 'Enter a budget greater than 0.'
  } else if (draft.budget > maxBudgetFor(draft.currency)) {
    errors.budget = 'That budget looks unrealistic. Enter a lower amount.'
  }

  if (!CURRENCIES.includes(draft.currency)) {
    errors.currency = 'Choose a supported currency.'
  }

  if (draft.interests.length === 0) {
    errors.interests = 'Choose at least one interest so the draft matches you.'
  }

  return { errors, isValid: Object.keys(errors).length === 0 }
}

export function createEmptyDraft(): TripDraft {
  return {
    name: '',
    origin: '',
    destination: '',
    destinationId: null,
    startDate: '',
    endDate: '',
    travelers: 2,
    budget: DEFAULT_BUDGET,
    currency: 'EUR',
    interests: [],
    pace: 'balanced',
    notes: '',
  }
}

/**
 * A note needs a body, but the title is optional: a first line of the body is
 * enough to identify it, and forcing a title makes quick notes a chore.
 */
export function validateNoteDraft(draft: NoteDraft): { errors: NoteDraftErrors; isValid: boolean } {
  const errors: NoteDraftErrors = {}

  const title = typeof draft.title === 'string' ? draft.title : ''
  if (title.length > NOTE_LIMITS.maxTitleLength) {
    errors.title = `Keep the title to ${NOTE_LIMITS.maxTitleLength} characters or fewer.`
  }

  const body = typeof draft.body === 'string' ? draft.body : ''
  if (body.trim().length < NOTE_LIMITS.minBodyLength) {
    errors.body = 'Write something before saving the note.'
  } else if (body.length > NOTE_LIMITS.maxBodyLength) {
    errors.body = `Keep notes to ${NOTE_LIMITS.maxBodyLength} characters or fewer.`
  }

  return { errors, isValid: Object.keys(errors).length === 0 }
}

export function createEmptyNoteDraft(): NoteDraft {
  return { title: '', body: '' }
}
