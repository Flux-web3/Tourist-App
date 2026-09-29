import type { CurrencyCode } from './types'

export const CURRENCIES: readonly CurrencyCode[] = ['EUR', 'USD', 'GBP', 'NGN', 'JPY', 'AED']

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  EUR: '\u20ac',
  USD: '$',
  GBP: '\u00a3',
  NGN: '\u20a6',
  JPY: '\u00a5',
  // No single-glyph symbol in wide use; the ISO code is what Dubai prices show.
  AED: 'AED',
}

const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  EUR: 'en-IE',
  USD: 'en-US',
  GBP: 'en-GB',
  NGN: 'en-NG',
  JPY: 'en-JP',
  AED: 'en-AE',
}

/**
 * Digits in the smallest unit each currency actually has. Yen has none: there
 * is no such thing as half a yen, so `¥1,000.00` is not a tidier `¥1,000` but a
 * wrong number with two invented digits.
 *
 * This table drives both the display formatting and the integer conversion, so
 * a currency can never be formatted on one scale and totalled on another.
 */
export const CURRENCY_MINOR_UNITS: Record<CurrencyCode, number> = {
  EUR: 2,
  USD: 2,
  GBP: 2,
  NGN: 2,
  JPY: 0,
  AED: 2,
}

/**
 * The scale used when no currency is named. Every existing caller of
 * `toCents`/`fromCents`/`sumAmounts` passed no currency and meant hundredths,
 * so omitting one keeps that exact behaviour.
 */
const DEFAULT_MINOR_UNITS = 2

/** Minor-unit digits for `currency`, or the 2-digit default when it is absent. */
export function minorUnits(currency?: CurrencyCode): number {
  if (currency === undefined) return DEFAULT_MINOR_UNITS
  const units = CURRENCY_MINOR_UNITS[currency]
  return typeof units === 'number' ? units : DEFAULT_MINOR_UNITS
}

function shiftDecimalPlaces(value: number, places: number): number {
  const shifted = Number(`${value}e${places}`)
  return Number.isNaN(shifted) ? value * 10 ** places : shifted
}

/**
 * Converts a major-unit amount to an integer in the currency's smallest unit to
 * avoid float drift. Hundredths when no currency is named, so that
 * `toCents(amount)` keeps behaving exactly as it always has; whole yen for
 * `toCents(amount, 'JPY')`.
 */
export function toCents(amount: number, currency?: CurrencyCode): number {
  if (!Number.isFinite(amount)) return 0
  const shifted = shiftDecimalPlaces(amount, minorUnits(currency))
  const magnitude = Math.round(Math.abs(shifted))
  if (magnitude === 0) return 0
  return shifted < 0 ? -magnitude : magnitude
}

/** The inverse of `toCents` on the same scale. */
export function fromCents(cents: number, currency?: CurrencyCode): number {
  if (!Number.isFinite(cents)) return 0
  return shiftDecimalPlaces(cents, -minorUnits(currency))
}

/** Sums amounts exactly, then returns a major-unit number. */
export function sumAmounts(amounts: readonly number[], currency?: CurrencyCode): number {
  return fromCents(
    amounts.reduce<number>((total, amount) => total + toCents(amount, currency), 0),
    currency,
  )
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  options: { showCents?: boolean; showCode?: boolean } = {},
): string {
  const { showCents = true, showCode = true } = options
  const fractionDigits = showCents ? minorUnits(currency) : 0
  const formatter = new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
  const formatted = formatter.format(Number.isFinite(amount) ? amount : 0)
  return showCode ? `${formatted} ${currency}` : formatted
}

/** Compact form for dense tiles, e.g. `\u20ac2,500 EUR`. */
export function formatMoneyCompact(amount: number, currency: CurrencyCode): string {
  return formatMoney(amount, currency, { showCents: false, showCode: true })
}

/**
 * Whether the amount carries anything below a whole currency unit. Always
 * `false` for a zero-minor-unit currency such as JPY, where there is no such
 * thing as a fractional part to carry.
 */
export function hasFractionalPart(amount: number, currency: CurrencyCode): boolean {
  const units = minorUnits(currency)
  if (units === 0) return false
  return toCents(amount, currency) % 10 ** units !== 0
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
  return formatMoney(safe, currency, {
    showCents: hasFractionalPart(safe, currency),
    showCode: false,
  })
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
  if (!Number.isFinite(amount) || toCents(amount, currency) === 0) return freeLabel
  return formatAmount(amount, currency)
}

export interface BudgetSummary {
  /** The traveller's own ceiling for the trip. */
  tripBudget: number
  /**
   * Sum of the planned itinerary estimates. Always a projection, and never part
   * of `remaining`. Counts only the stops already in `currency` — see
   * `mixedEstimateCurrency`.
   */
  itineraryEstimate: number
  /**
   * Sum of logged expenses. The only settled figure. Counts only the expenses
   * already in `currency` — see `mixedCurrency`.
   */
  actualSpent: number
  /** `tripBudget - actualSpent`. May be negative. */
  remaining: number
  /** `itineraryEstimate - actualSpent`. */
  estimateVariance: number
  isOverBudget: boolean
  currency: CurrencyCode
  /**
   * At least one logged expense is in a currency other than `currency`, so the
   * figures above describe part of the spend rather than all of it. Screens
   * showing a total must say so; there are no exchange rates in this app.
   */
  mixedCurrency: boolean
  /**
   * The other currency codes found, deduped and sorted alphabetically so the
   * list renders in the same order every time.
   */
  otherCurrencies: CurrencyCode[]
  /** How many expenses `actualSpent` leaves out for that reason. */
  uncountedExpenseCount: number
  /**
   * The itinerary counterpart of `mixedCurrency`: at least one planned stop is
   * priced in a currency other than `currency`, so `itineraryEstimate` covers
   * part of the plan rather than all of it. Typically a catalogue stop saved in
   * EUR sitting in a trip the traveller later switched to another currency.
   */
  mixedEstimateCurrency: boolean
  /** The other currency codes found among the estimates, deduped and sorted. */
  otherEstimateCurrencies: CurrencyCode[]
  /** How many planned stops `itineraryEstimate` leaves out for that reason. */
  uncountedEstimateCount: number
}

/**
 * Splits amounts into the ones genuinely in `currency` and the foreign codes
 * found among the rest.
 *
 * An amount with no code at the matching index is taken to be in `currency`
 * already, which is what lets a caller pass only amounts and get the behaviour
 * it always got. Shared by the expense and the itinerary-estimate paths so the
 * two can never drift into treating a mismatch differently.
 */
function partitionByCurrency(
  amounts: readonly number[],
  codes: readonly CurrencyCode[] | undefined,
  currency: CurrencyCode,
): { counted: number[]; otherCodes: CurrencyCode[]; uncountedCount: number } {
  const counted: number[] = []
  const otherCodes = new Set<CurrencyCode>()

  amounts.forEach((amount, index) => {
    const amountCurrency = codes?.[index] ?? currency
    if (amountCurrency === currency) {
      counted.push(amount)
      return
    }
    otherCodes.add(amountCurrency)
  })

  return {
    counted,
    otherCodes: [...otherCodes].sort(),
    uncountedCount: amounts.length - counted.length,
  }
}

/**
 * Totals a trip's money on a single scale: the trip's own currency.
 *
 * `expenseCurrencies` is optional and positionally aligned with
 * `expenseAmounts`; `itineraryEstimateCurrencies` is the exact counterpart for
 * `itineraryEstimates`. Any amount without a code is taken to be in the trip
 * currency already, so a caller that passes only amounts gets exactly the
 * behaviour it always got, `mixedCurrency` and `mixedEstimateCurrency` included
 * (both `false`).
 *
 * When a code is present and differs, the amount is left out of the total rather
 * than added to it. Folding ¥1,000 into a EUR total and labelling the result EUR
 * does not produce a slightly wrong number, it produces a number that means
 * nothing; the mismatch is reported through `mixedCurrency` /
 * `mixedEstimateCurrency` and their companion fields instead.
 *
 * `remaining` is `tripBudget - actualSpent` and nothing else. The estimate is a
 * projection and never touches it, so no itinerary stop — matched or mismatched
 * — can move what the traveller has left.
 */
export function summariseBudget(input: {
  tripBudget: number
  itineraryEstimates: readonly number[]
  expenseAmounts: readonly number[]
  currency: CurrencyCode
  /** Positionally aligned with `expenseAmounts`. Omit to assume the trip currency. */
  expenseCurrencies?: readonly CurrencyCode[]
  /** Positionally aligned with `itineraryEstimates`. Omit to assume the trip currency. */
  itineraryEstimateCurrencies?: readonly CurrencyCode[]
}): BudgetSummary {
  const { currency } = input
  const expenses = partitionByCurrency(input.expenseAmounts, input.expenseCurrencies, currency)
  const estimates = partitionByCurrency(
    input.itineraryEstimates,
    input.itineraryEstimateCurrencies,
    currency,
  )

  const tripBudget = fromCents(toCents(input.tripBudget, currency), currency)
  const itineraryEstimate = sumAmounts(estimates.counted, currency)
  const actualSpent = sumAmounts(expenses.counted, currency)
  const remaining = fromCents(
    toCents(tripBudget, currency) - toCents(actualSpent, currency),
    currency,
  )
  return {
    tripBudget,
    itineraryEstimate,
    actualSpent,
    remaining,
    estimateVariance: fromCents(
      toCents(itineraryEstimate, currency) - toCents(actualSpent, currency),
      currency,
    ),
    isOverBudget: toCents(remaining, currency) < 0,
    currency,
    mixedCurrency: expenses.otherCodes.length > 0,
    otherCurrencies: expenses.otherCodes,
    uncountedExpenseCount: expenses.uncountedCount,
    mixedEstimateCurrency: estimates.otherCodes.length > 0,
    otherEstimateCurrencies: estimates.otherCodes,
    uncountedEstimateCount: estimates.uncountedCount,
  }
}
