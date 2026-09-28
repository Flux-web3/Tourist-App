import type { CurrencyCode } from './types'

export const CURRENCIES: readonly CurrencyCode[] = ['EUR', 'USD', 'GBP', 'NGN', 'JPY']

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  EUR: '\u20ac',
  USD: '$',
  GBP: '\u00a3',
  NGN: '\u20a6',
  JPY: '\u00a5',
}

const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  EUR: 'en-IE',
  USD: 'en-US',
  GBP: 'en-GB',
  NGN: 'en-NG',
  JPY: 'en-JP',
}

function shiftDecimalPlaces(value: number, places: number): number {
  const shifted = Number(`${value}e${places}`)
  return Number.isNaN(shifted) ? value * 10 ** places : shifted
}

/** Converts a major-unit amount to integer cents to avoid float drift. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  const shifted = shiftDecimalPlaces(amount, 2)
  const magnitude = Math.round(Math.abs(shifted))
  if (magnitude === 0) return 0
  return shifted < 0 ? -magnitude : magnitude
}

export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0
  return shiftDecimalPlaces(cents, -2)
}

/** Sums amounts exactly, then returns a major-unit number. */
export function sumAmounts(amounts: readonly number[]): number {
  return fromCents(amounts.reduce<number>((total, amount) => total + toCents(amount), 0))
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  options: { showCents?: boolean; showCode?: boolean } = {},
): string {
  const { showCents = true, showCode = true } = options
  const formatter = new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    style: 'currency',
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  })
  const formatted = formatter.format(Number.isFinite(amount) ? amount : 0)
  return showCode ? `${formatted} ${currency}` : formatted
}

/** Compact form for dense tiles, e.g. `\u20ac2,500 EUR`. */
export function formatMoneyCompact(amount: number, currency: CurrencyCode): string {
  return formatMoney(amount, currency, { showCents: false, showCode: true })
}

function hasFractionalPart(amount: number): boolean {
  return toCents(amount) % 100 !== 0
}

/**
 * Display form for a figure shown inside a screen that already states its
 * currency: symbol only, and cents only when they carry information.
 *
 * `\u20ac2,500` rather than `\u20ac2,500.00 EUR`. The currency code is disclosed once
 * per screen instead of being repeated against every number, which is what
 * made the earlier budget and itinerary screens read like a ledger.
 */
export function formatAmount(amount: number, currency: CurrencyCode): string {
  const safe = Number.isFinite(amount) ? amount : 0
  return formatMoney(safe, currency, { showCents: hasFractionalPart(safe), showCode: false })
}

/**
 * Display form for the price of a single stop. Zero reads as `Free`, because
 * `\u20ac0.00` against a public park looks like missing data rather than a fact.
 */
export function formatPrice(
  amount: number,
  currency: CurrencyCode,
  options: { freeLabel?: string } = {},
): string {
  const { freeLabel = 'Free' } = options
  if (!Number.isFinite(amount) || toCents(amount) === 0) return freeLabel
  return formatAmount(amount, currency)
}

export interface BudgetSummary {
  /** The traveller's own ceiling for the trip. */
  tripBudget: number
  /** Sum of every planned itinerary estimate. Always a projection. */
  itineraryEstimate: number
  /** Sum of logged expenses. The only settled figure. */
  actualSpent: number
  /** `tripBudget - actualSpent`. May be negative. */
  remaining: number
  /** `itineraryEstimate - actualSpent`. */
  estimateVariance: number
  isOverBudget: boolean
  currency: CurrencyCode
}

export function summariseBudget(input: {
  tripBudget: number
  itineraryEstimates: readonly number[]
  expenseAmounts: readonly number[]
  currency: CurrencyCode
}): BudgetSummary {
  const tripBudget = fromCents(toCents(input.tripBudget))
  const itineraryEstimate = sumAmounts(input.itineraryEstimates)
  const actualSpent = sumAmounts(input.expenseAmounts)
  const remaining = fromCents(toCents(tripBudget) - toCents(actualSpent))
  return {
    tripBudget,
    itineraryEstimate,
    actualSpent,
    remaining,
    estimateVariance: fromCents(toCents(itineraryEstimate) - toCents(actualSpent)),
    isOverBudget: toCents(remaining) < 0,
    currency: input.currency,
  }
}
