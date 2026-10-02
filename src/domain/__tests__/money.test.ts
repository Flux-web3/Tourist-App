import { describe, expect, it } from 'vitest'
import {
  CURRENCIES,
  CURRENCY_MINOR_UNITS,
  CURRENCY_SYMBOLS,
  formatAmount,
  formatMoney,
  formatMoneyCompact,
  formatPrice,
  fromCents,
  hasFractionalPart,
  minorUnits,
  partitionByCurrency,
  sumAmounts,
  summariseBudget,
  toCents,
} from '@/domain/money'
import type { CurrencyCode } from '@/domain/types'

/**
 * JPY has no minor unit, so every JPY expectation below is the whole-yen form.
 * `¥1,234.50` is not a JPY figure at all, and 1234.5 yen rounds to 1235.
 *
 * AED has no glyph, so Intl prints its code as the symbol, separated from the
 * number by a no-break space (U+00A0) rather than a plain one. That code already
 * names the currency, so it is never appended a second time.
 */
const WITH_CENTS: Record<CurrencyCode, string> = {
  EUR: '€1,234.50 EUR',
  USD: '$1,234.50 USD',
  GBP: '£1,234.50 GBP',
  NGN: '₦1,234.50 NGN',
  JPY: '¥1,235 JPY',
  AED: 'AED 1,234.50',
}

const WITHOUT_CENTS: Record<CurrencyCode, string> = {
  EUR: '€1,235 EUR',
  USD: '$1,235 USD',
  GBP: '£1,235 GBP',
  NGN: '₦1,235 NGN',
  JPY: '¥1,235 JPY',
  AED: 'AED 1,235',
}

const SYMBOL_ONLY: Record<CurrencyCode, string> = {
  EUR: '€1,234.50',
  USD: '$1,234.50',
  GBP: '£1,234.50',
  NGN: '₦1,234.50',
  JPY: '¥1,235',
  AED: 'AED 1,234.50',
}

const ZERO_WITH_CODE: Record<CurrencyCode, string> = {
  EUR: '€0.00 EUR',
  USD: '$0.00 USD',
  GBP: '£0.00 GBP',
  NGN: '₦0.00 NGN',
  JPY: '¥0 JPY',
  AED: 'AED 0.00',
}

const NEGATIVE_WITH_CODE: Record<CurrencyCode, string> = {
  EUR: '-€1,234.50 EUR',
  USD: '-$1,234.50 USD',
  GBP: '-£1,234.50 GBP',
  NGN: '-₦1,234.50 NGN',
  JPY: '-¥1,235 JPY',
  AED: '-AED 1,234.50',
}

const COMPACT_TWO_THOUSAND_FIVE_HUNDRED: Record<CurrencyCode, string> = {
  EUR: '€2,500 EUR',
  USD: '$2,500 USD',
  GBP: '£2,500 GBP',
  NGN: '₦2,500 NGN',
  JPY: '¥2,500 JPY',
  AED: 'AED 2,500',
}

describe('CURRENCIES', () => {
  it('exposes exactly the six supported currency codes', () => {
    expect([...CURRENCIES]).toEqual(['EUR', 'USD', 'GBP', 'NGN', 'JPY', 'AED'])
  })

  it('has a symbol entry for every supported currency', () => {
    for (const currency of CURRENCIES) {
      expect(CURRENCY_SYMBOLS[currency]).toBeTypeOf('string')
      expect(CURRENCY_SYMBOLS[currency].length).toBeGreaterThan(0)
    }
  })

  it('exposes the expected symbols', () => {
    expect(CURRENCY_SYMBOLS).toEqual({
      EUR: '€',
      USD: '$',
      GBP: '£',
      NGN: '₦',
      JPY: '¥',
      AED: 'AED',
    })
  })
})

describe('CURRENCY_MINOR_UNITS', () => {
  it('gives JPY no minor unit and every other currency two', () => {
    expect(CURRENCY_MINOR_UNITS).toEqual({ EUR: 2, USD: 2, GBP: 2, NGN: 2, JPY: 0, AED: 2 })
  })

  it('has an entry for every supported currency', () => {
    for (const currency of CURRENCIES) {
      expect(CURRENCY_MINOR_UNITS[currency]).toBeTypeOf('number')
    }
  })
})

describe('minorUnits', () => {
  it('reads the table for a named currency', () => {
    expect(minorUnits('EUR')).toBe(2)
    expect(minorUnits('JPY')).toBe(0)
  })

  it('falls back to hundredths when no currency is named', () => {
    expect(minorUnits()).toBe(2)
    expect(minorUnits(undefined)).toBe(2)
  })
})

describe('toCents', () => {
  it('converts whole major units to cents', () => {
    expect(toCents(24)).toBe(2400)
  })

  it('converts fractional major units to cents', () => {
    expect(toCents(24.5)).toBe(2450)
  })

  it('converts zero to zero', () => {
    expect(toCents(0)).toBe(0)
  })

  it('rounds to the nearest whole cent', () => {
    expect(toCents(1.239)).toBe(124)
    expect(toCents(1.234)).toBe(123)
  })

  it('neutralises 0.1 + 0.2 float drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it('rounds a half cent away from zero instead of following the float representation', () => {
    expect(1.005 * 100).toBe(100.49999999999999)
    expect(toCents(1.005)).toBe(101)
  })

  it('rounds a positive half cent up regardless of the float representation', () => {
    expect(toCents(1.015)).toBe(102)
    expect(toCents(0.145)).toBe(15)
    expect(toCents(2.675)).toBe(268)
    expect(toCents(1.235)).toBe(124)
  })

  it('rounds a negative half cent away from zero symmetrically', () => {
    expect(-1.005 * 100).toBe(-100.49999999999999)
    expect(toCents(-1.005)).toBe(-101)
    expect(toCents(-0.145)).toBe(-15)
  })

  it('keeps the sign of a negative amount', () => {
    expect(toCents(-1.239)).toBe(-124)
    expect(toCents(-1.234)).toBe(-123)
  })

  it('converts an exact cent value', () => {
    expect(toCents(19.99)).toBe(1999)
  })

  it('never produces a negative zero', () => {
    expect(Object.is(toCents(-0), 0)).toBe(true)
    expect(Object.is(toCents(-0.001), 0)).toBe(true)
    expect(Object.is(toCents(-0.004), 0)).toBe(true)
    expect(Object.is(fromCents(-0), 0)).toBe(true)
  })

  it('handles negative amounts symmetrically', () => {
    expect(toCents(-24.5)).toBe(-2450)
    expect(toCents(-0.1)).toBe(-10)
  })

  it('handles large amounts without precision loss', () => {
    expect(toCents(1_000_000)).toBe(100_000_000)
    expect(toCents(1e9)).toBe(100_000_000_000)
  })

  it('returns 0 for NaN', () => {
    expect(toCents(Number.NaN)).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('returns 0 for -Infinity', () => {
    expect(toCents(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('rounds every half cent away from zero across a sweep of tricky values', () => {
    expect(toCents(0.005)).toBe(1)
    expect(toCents(0.015)).toBe(2)
    expect(toCents(0.025)).toBe(3)
    expect(toCents(0.125)).toBe(13)
    expect(toCents(0.375)).toBe(38)
    expect(toCents(-0.005)).toBe(-1)
    expect(toCents(-0.125)).toBe(-13)
  })

  it('keeps hundredths for a currency that has them', () => {
    for (const currency of ['EUR', 'USD', 'GBP', 'NGN', 'AED'] as CurrencyCode[]) {
      expect(toCents(24.5, currency)).toBe(2450)
      expect(toCents(24.5, currency)).toBe(toCents(24.5))
    }
  })

  it('treats JPY as whole units rather than hundredths', () => {
    expect(toCents(1000, 'JPY')).toBe(1000)
    expect(toCents(1234, 'JPY')).toBe(1234)
    expect(toCents(-1000, 'JPY')).toBe(-1000)
    expect(toCents(0, 'JPY')).toBe(0)
  })

  it('rounds a JPY amount to the nearest whole yen', () => {
    expect(toCents(1000.4, 'JPY')).toBe(1000)
    expect(toCents(1000.5, 'JPY')).toBe(1001)
    expect(toCents(-1000.5, 'JPY')).toBe(-1001)
    expect(toCents(0.4, 'JPY')).toBe(0)
  })
})

describe('fromCents', () => {
  it('converts cents to major units', () => {
    expect(fromCents(2450)).toBe(24.5)
  })

  it('converts zero cents to zero', () => {
    expect(fromCents(0)).toBe(0)
  })

  it('converts negative cents to a negative amount', () => {
    expect(fromCents(-2450)).toBe(-24.5)
  })

  it('round-trips through toCents', () => {
    expect(fromCents(toCents(19.99))).toBe(19.99)
  })

  it('returns 0 for non-finite cents', () => {
    expect(fromCents(Number.NaN)).toBe(0)
    expect(fromCents(Number.POSITIVE_INFINITY)).toBe(0)
    expect(fromCents(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('round-trips every cent-exact value back to itself', () => {
    for (const value of [
      0,
      0.01,
      0.07,
      0.1,
      0.29,
      0.3,
      0.7,
      1.05,
      1.5,
      2.5,
      19.99,
      24.5,
      100,
      123.45,
      1234.56,
      1000,
      1e6,
      1e9,
      -0.01,
      -0.07,
      -2.5,
      -19.99,
      -24.5,
      -123.45,
    ]) {
      expect(fromCents(toCents(value))).toBe(value)
    }
  })

  it('round-trips whole yen through the JPY scale', () => {
    for (const value of [0, 1, 7, 100, 1000, 1234, 1_000_000, 1e9, -1, -1000, -123_456]) {
      expect(fromCents(toCents(value, 'JPY'), 'JPY')).toBe(value)
    }
  })

  it('does not rescale a JPY figure by a hundred in either direction', () => {
    expect(fromCents(1000, 'JPY')).toBe(1000)
    expect(fromCents(toCents(1000, 'JPY'))).toBe(10)
    expect(fromCents(toCents(1000), 'JPY')).toBe(100_000)
  })
})

describe('sumAmounts', () => {
  it('returns 0 for an empty array', () => {
    expect(sumAmounts([])).toBe(0)
  })

  it('sums whole amounts', () => {
    expect(sumAmounts([10, 20, 30])).toBe(60)
  })

  it('sums fractional amounts without float drift', () => {
    expect(sumAmounts([10, 20.5, 0.1, 0.2])).toBe(30.8)
  })

  it('sums three tenths to exactly 0.6', () => {
    expect(0.1 + 0.2 + 0.3).not.toBe(0.6)
    expect(sumAmounts([0.1, 0.2, 0.3])).toBe(0.6)
  })

  it('sums 19.99 and 0.01 to 20 without cent drift', () => {
    expect(sumAmounts([19.99, 0.01])).toBe(20)
  })

  it('sums 1.005 and 2.005 to 3.02', () => {
    expect(sumAmounts([1.005, 2.005])).toBe(3.02)
  })

  it('sums mixed signs to a negative total', () => {
    expect(sumAmounts([-10, 4.5])).toBe(-5.5)
  })

  it('sums large amounts exactly', () => {
    expect(sumAmounts([1e9, 1e9])).toBe(2_000_000_000)
  })

  it('treats non-finite entries as zero', () => {
    expect(sumAmounts([10, Number.NaN, 5])).toBe(15)
  })

  it('sums JPY as whole yen without gaining or losing precision', () => {
    expect(sumAmounts([1000, 2500, 340], 'JPY')).toBe(3840)
    expect(sumAmounts([1000, 2500, 340], 'JPY')).toBe(sumAmounts([1000, 2500, 340]))
    expect(sumAmounts([], 'JPY')).toBe(0)
  })

  it('rounds each JPY amount to whole yen before summing', () => {
    expect(sumAmounts([1000.5, 1000.5], 'JPY')).toBe(2002)
    expect(sumAmounts([0.4, 0.4, 0.4], 'JPY')).toBe(0)
  })

  it('keeps a large JPY total exact', () => {
    expect(sumAmounts([1_000_000, 2_500_000, 1], 'JPY')).toBe(3_500_001)
  })
})

describe('formatMoney', () => {
  it('defaults to cents and the currency code', () => {
    expect(formatMoney(1234.5, 'EUR')).toBe(WITH_CENTS.EUR)
  })

  for (const currency of CURRENCIES) {
    it(`formats 1234.5 with its own minor units and the code for ${currency}`, () => {
      expect(formatMoney(1234.5, currency, { showCents: true, showCode: true })).toBe(
        WITH_CENTS[currency],
      )
    })

    it(`formats 1234.5 without cents for ${currency}`, () => {
      expect(formatMoney(1234.5, currency, { showCents: false })).toBe(WITHOUT_CENTS[currency])
    })

    it(`formats 1234.5 without the code for ${currency}`, () => {
      expect(formatMoney(1234.5, currency, { showCode: false })).toBe(SYMBOL_ONLY[currency])
    })

    it(`formats zero with the code for ${currency}`, () => {
      expect(formatMoney(0, currency)).toBe(ZERO_WITH_CODE[currency])
    })

    it(`formats a negative amount with the code for ${currency}`, () => {
      expect(formatMoney(-1234.5, currency)).toBe(NEGATIVE_WITH_CODE[currency])
    })
  }

  it('does not repeat the code when the symbol already is the code', () => {
    expect(formatMoney(1234.5, 'AED')).toBe(SYMBOL_ONLY.AED)
    expect(formatMoney(1234.5, 'AED', { showCode: true })).not.toMatch(/AED.*AED/)
    expect(formatMoney(1234.5, 'AED', { showCents: false })).not.toMatch(/AED.*AED/)
    expect(formatMoney(-1234.5, 'AED')).not.toMatch(/AED.*AED/)
    expect(formatMoney(1234.5, 'AED')).toContain('1,234.50')
  })

  it('keeps the code suffix for every currency whose symbol is a glyph', () => {
    expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50 EUR')
    expect(formatMoney(1234.5, 'GBP')).toBe('£1,234.50 GBP')
    expect(formatMoney(1234.5, 'NGN')).toBe('₦1,234.50 NGN')
    expect(formatMoney(1234.5, 'JPY')).toBe('¥1,235 JPY')
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50 USD')
  })

  it('appends the currency code as a space-separated suffix', () => {
    expect(formatMoney(1, 'USD')).toBe('$1.00 USD')
  })

  it('drops only the code suffix when showCode is false', () => {
    for (const currency of CURRENCIES) {
      expect(formatMoney(1234.5, currency, { showCode: false })).toBe(
        formatMoney(1234.5, currency).replace(` ${currency}`, ''),
      )
    }
  })

  it('drops only the decimals when showCents is false', () => {
    expect(formatMoney(1234.5, 'EUR', { showCents: false })).toBe('€1,235 EUR')
  })

  it('treats an empty options object as the defaults', () => {
    expect(formatMoney(1234.5, 'GBP', {})).toBe(WITH_CENTS.GBP)
  })

  it('treats NaN as zero', () => {
    expect(formatMoney(Number.NaN, 'EUR')).toBe('€0.00 EUR')
  })

  it('treats Infinity as zero', () => {
    expect(formatMoney(Number.POSITIVE_INFINITY, 'EUR')).toBe('€0.00 EUR')
  })

  it('formats a large amount with thousands separators', () => {
    expect(formatMoney(1_234_567.89, 'EUR')).toBe('€1,234,567.89 EUR')
  })

  it('never shows decimals for JPY, which has no minor unit', () => {
    expect(formatMoney(1000, 'JPY')).toBe('¥1,000 JPY')
    expect(formatMoney(1000, 'JPY', { showCents: true })).toBe('¥1,000 JPY')
    expect(formatMoney(1000, 'JPY', { showCode: false })).toBe('¥1,000')
    expect(formatMoney(1_234_567, 'JPY')).toBe('¥1,234,567 JPY')
    expect(formatMoney(0, 'JPY')).toBe('¥0 JPY')
  })

  it('does not invent two decimal places on a JPY figure', () => {
    expect(formatMoney(1000, 'JPY')).not.toContain('.')
    expect(formatMoney(1000, 'JPY')).not.toBe('¥1,000.00 JPY')
  })

  it('keeps showing decimals for every currency that has a minor unit', () => {
    for (const currency of CURRENCIES) {
      const hasMinorUnit = CURRENCY_MINOR_UNITS[currency] > 0
      expect(formatMoney(1000, currency).includes('.')).toBe(hasMinorUnit)
    }
  })
})

describe('hasFractionalPart', () => {
  it('is true for an amount carrying cents', () => {
    expect(hasFractionalPart(24.5, 'EUR')).toBe(true)
    expect(hasFractionalPart(0.01, 'USD')).toBe(true)
    expect(hasFractionalPart(-19.99, 'GBP')).toBe(true)
  })

  it('is false for a whole amount', () => {
    expect(hasFractionalPart(24, 'EUR')).toBe(false)
    expect(hasFractionalPart(0, 'NGN')).toBe(false)
  })

  it('is false for every JPY amount, fractional-looking or not', () => {
    for (const amount of [0, 1, 1000, 1000.5, 1234.56, -1000.5, 0.4]) {
      expect(hasFractionalPart(amount, 'JPY')).toBe(false)
    }
  })
})

describe('formatAmount', () => {
  it('names the currency on request, without repeating a code the symbol already is', () => {
    expect(formatAmount(129, 'EUR', { showCode: true })).toBe('€129 EUR')
    expect(formatAmount(1234.5, 'GBP', { showCode: true })).toBe('£1,234.50 GBP')
    expect(formatAmount(1235, 'JPY', { showCode: true })).toBe('¥1,235 JPY')
    expect(formatAmount(1234.5, 'AED', { showCode: true })).toBe(SYMBOL_ONLY.AED)
    expect(formatAmount(1234, 'AED', { showCode: true })).toBe('AED 1,234')
    expect(formatAmount(1234.5, 'AED')).toBe(SYMBOL_ONLY.AED)
  })

  it('shows cents only when they carry information', () => {
    expect(formatAmount(2500, 'EUR')).toBe('€2,500')
    expect(formatAmount(2500.5, 'EUR')).toBe('€2,500.50')
  })

  it('never shows a minor unit for JPY', () => {
    expect(formatAmount(1000, 'JPY')).toBe('¥1,000')
    expect(formatAmount(1000.5, 'JPY')).toBe('¥1,001')
  })

  it('treats a non-finite amount as zero', () => {
    expect(formatAmount(Number.NaN, 'EUR')).toBe('€0')
    expect(formatAmount(Number.NaN, 'JPY')).toBe('¥0')
  })
})

describe('formatPrice', () => {
  it('renders zero as Free', () => {
    expect(formatPrice(0, 'EUR')).toBe('Free')
    expect(formatPrice(0, 'JPY')).toBe('Free')
  })

  it('honours a custom free label', () => {
    expect(formatPrice(0, 'EUR', { freeLabel: 'No charge' })).toBe('No charge')
  })

  it('renders a real price through formatAmount', () => {
    expect(formatPrice(19.99, 'EUR')).toBe('€19.99')
    expect(formatPrice(1000, 'JPY')).toBe('¥1,000')
  })

  it('treats a sub-yen price as free rather than rounding it up to a yen', () => {
    expect(formatPrice(0.4, 'JPY')).toBe('Free')
    expect(formatPrice(0.004, 'EUR')).toBe('Free')
  })
})

describe('formatMoneyCompact', () => {
  for (const currency of CURRENCIES) {
    it(`formats 2500 without cents and with the code for ${currency}`, () => {
      expect(formatMoneyCompact(2500, currency)).toBe(COMPACT_TWO_THOUSAND_FIVE_HUNDRED[currency])
    })
  }

  it('matches formatMoney with showCents off and showCode on', () => {
    for (const currency of CURRENCIES) {
      expect(formatMoneyCompact(2500, currency)).toBe(
        formatMoney(2500, currency, { showCents: false, showCode: true }),
      )
    }
  })

  it('does not repeat the code for AED', () => {
    expect(formatMoneyCompact(1234.5, 'AED')).toBe(WITHOUT_CENTS.AED)
    expect(formatMoneyCompact(1234.5, 'AED')).not.toMatch(/AED.*AED/)
  })

  it('rounds to whole currency units', () => {
    expect(formatMoneyCompact(1234.5, 'EUR')).toBe('€1,235 EUR')
  })

  it('keeps a negative sign', () => {
    expect(formatMoneyCompact(-2500, 'USD')).toBe('-$2,500 USD')
  })
})

describe('summariseBudget', () => {
  it('computes remaining as tripBudget minus actualSpent', () => {
    const summary = summariseBudget({
      tripBudget: 2500,
      itineraryEstimates: [45.5, 60, 12.25],
      expenseAmounts: [100, 50.5],
      currency: 'EUR',
    })
    expect(summary.remaining).toBe(2349.5)
  })

  it('sums every itinerary estimate as a projection', () => {
    const summary = summariseBudget({
      tripBudget: 2500,
      itineraryEstimates: [45.5, 60, 12.25],
      expenseAmounts: [],
      currency: 'EUR',
    })
    expect(summary.itineraryEstimate).toBe(117.75)
  })

  it('sums logged expenses as the settled figure', () => {
    const summary = summariseBudget({
      tripBudget: 2500,
      itineraryEstimates: [],
      expenseAmounts: [100, 50.5],
      currency: 'EUR',
    })
    expect(summary.actualSpent).toBe(150.5)
  })

  it('computes estimateVariance as itineraryEstimate minus actualSpent', () => {
    const summary = summariseBudget({
      tripBudget: 2500,
      itineraryEstimates: [45.5, 60, 12.25],
      expenseAmounts: [100, 50.5],
      currency: 'EUR',
    })
    expect(summary.estimateVariance).toBe(-32.75)
  })

  it('reports a negative remaining when over budget', () => {
    const summary = summariseBudget({
      tripBudget: 100,
      itineraryEstimates: [10, 20],
      expenseAmounts: [150],
      currency: 'GBP',
    })
    expect(summary.remaining).toBe(-50)
  })

  it('flags an over-budget trip', () => {
    const summary = summariseBudget({
      tripBudget: 100,
      itineraryEstimates: [10, 20],
      expenseAmounts: [150],
      currency: 'GBP',
    })
    expect(summary.isOverBudget).toBe(true)
  })

  it('does not flag a trip that is exactly on budget', () => {
    const summary = summariseBudget({
      tripBudget: 100,
      itineraryEstimates: [],
      expenseAmounts: [40, 60],
      currency: 'EUR',
    })
    expect(summary.remaining).toBe(0)
    expect(summary.isOverBudget).toBe(false)
  })

  it('does not flag a trip with budget to spare', () => {
    const summary = summariseBudget({
      tripBudget: 2500,
      itineraryEstimates: [45.5, 60],
      expenseAmounts: [100],
      currency: 'EUR',
    })
    expect(summary.isOverBudget).toBe(false)
  })

  it('returns zeroes for empty estimates and expenses', () => {
    const summary = summariseBudget({
      tripBudget: 0,
      itineraryEstimates: [],
      expenseAmounts: [],
      currency: 'JPY',
    })
    expect(summary).toEqual({
      tripBudget: 0,
      itineraryEstimate: 0,
      actualSpent: 0,
      remaining: 0,
      estimateVariance: 0,
      isOverBudget: false,
      currency: 'JPY',
      mixedCurrency: false,
      otherCurrencies: [],
      uncountedExpenseCount: 0,
      mixedEstimateCurrency: false,
      otherEstimateCurrencies: [],
      uncountedEstimateCount: 0,
    })
  })

  it('is cent-safe when the budget itself is float-drifted', () => {
    const summary = summariseBudget({
      tripBudget: 0.1 + 0.2,
      itineraryEstimates: [],
      expenseAmounts: [0.1, 0.2],
      currency: 'USD',
    })
    expect(summary.tripBudget).toBe(0.3)
    expect(summary.actualSpent).toBe(0.3)
    expect(summary.remaining).toBe(0)
  })

  it('flags a trip that is over budget by half a cent', () => {
    const summary = summariseBudget({
      tripBudget: 10,
      itineraryEstimates: [],
      expenseAmounts: [10.005],
      currency: 'EUR',
    })
    expect(summary.remaining).toBe(-0.01)
    expect(summary.isOverBudget).toBe(true)
  })

  it('does not flag a trip that is half a cent under budget', () => {
    const summary = summariseBudget({
      tripBudget: 10,
      itineraryEstimates: [],
      expenseAmounts: [9.995],
      currency: 'EUR',
    })
    expect(summary.remaining).toBe(0)
    expect(summary.isOverBudget).toBe(false)
  })

  it('normalises the trip budget to whole cents', () => {
    const summary = summariseBudget({
      tripBudget: 1000.005,
      itineraryEstimates: [],
      expenseAmounts: [],
      currency: 'NGN',
    })
    expect(summary.tripBudget).toBe(1000.01)
  })

  it('passes the currency through unchanged', () => {
    const summary = summariseBudget({
      tripBudget: 10,
      itineraryEstimates: [],
      expenseAmounts: [],
      currency: 'JPY',
    })
    expect(summary.currency).toBe('JPY')
  })

  it('totals a JPY trip in whole yen', () => {
    const summary = summariseBudget({
      tripBudget: 150_000,
      itineraryEstimates: [1200, 3400],
      expenseAmounts: [1000, 2500],
      currency: 'JPY',
    })
    expect(summary.tripBudget).toBe(150_000)
    expect(summary.itineraryEstimate).toBe(4600)
    expect(summary.actualSpent).toBe(3500)
    expect(summary.remaining).toBe(146_500)
    expect(summary.estimateVariance).toBe(1100)
  })
})

describe('summariseBudget and a mixed-currency trip', () => {
  it('reports no mixing when the currencies are not supplied at all', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [],
      expenseAmounts: [100, 50.5],
      currency: 'EUR',
    })
    expect(summary.mixedCurrency).toBe(false)
    expect(summary.otherCurrencies).toEqual([])
    expect(summary.uncountedExpenseCount).toBe(0)
    expect(summary.actualSpent).toBe(150.5)
  })

  it('reports no mixing when every supplied currency matches the trip', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [],
      expenseAmounts: [100, 50.5],
      expenseCurrencies: ['EUR', 'EUR'],
      currency: 'EUR',
    })
    expect(summary.mixedCurrency).toBe(false)
    expect(summary.otherCurrencies).toEqual([])
    expect(summary.uncountedExpenseCount).toBe(0)
    expect(summary.actualSpent).toBe(150.5)
  })

  it('behaves identically whether matching currencies are supplied or omitted', () => {
    const withCodes = summariseBudget({
      tripBudget: 2500,
      itineraryEstimates: [45.5, 60, 12.25],
      expenseAmounts: [100, 50.5],
      expenseCurrencies: ['EUR', 'EUR'],
      currency: 'EUR',
    })
    const withoutCodes = summariseBudget({
      tripBudget: 2500,
      itineraryEstimates: [45.5, 60, 12.25],
      expenseAmounts: [100, 50.5],
      currency: 'EUR',
    })
    expect(withCodes).toEqual(withoutCodes)
  })

  it('flags the mismatch and keeps the foreign amount out of actualSpent', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [],
      expenseAmounts: [100, 1000],
      expenseCurrencies: ['EUR', 'JPY'],
      currency: 'EUR',
    })
    expect(summary.mixedCurrency).toBe(true)
    expect(summary.otherCurrencies).toEqual(['JPY'])
    expect(summary.uncountedExpenseCount).toBe(1)
    expect(summary.actualSpent).toBe(100)
    expect(summary.remaining).toBe(900)
  })

  it('does not let a foreign amount push the trip over budget', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [],
      expenseAmounts: [100, 500_000],
      expenseCurrencies: ['EUR', 'NGN'],
      currency: 'EUR',
    })
    expect(summary.actualSpent).toBe(100)
    expect(summary.remaining).toBe(900)
    expect(summary.isOverBudget).toBe(false)
    expect(summary.mixedCurrency).toBe(true)
  })

  it('keeps estimateVariance on the trip currency alone', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [200],
      expenseAmounts: [50, 1000],
      expenseCurrencies: ['EUR', 'JPY'],
      currency: 'EUR',
    })
    expect(summary.estimateVariance).toBe(150)
  })

  it('counts every mismatched expense and dedupes the codes it reports', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [],
      expenseAmounts: [10, 20, 30, 40],
      expenseCurrencies: ['USD', 'JPY', 'JPY', 'EUR'],
      currency: 'EUR',
    })
    expect(summary.uncountedExpenseCount).toBe(3)
    expect(summary.otherCurrencies).toEqual(['JPY', 'USD'])
    expect(summary.actualSpent).toBe(40)
  })

  it('sorts the reported codes deterministically whatever order they arrive in', () => {
    const codes: CurrencyCode[] = ['USD', 'NGN', 'JPY', 'GBP']
    const forwards = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [],
      expenseAmounts: codes.map(() => 5),
      expenseCurrencies: codes,
      currency: 'EUR',
    })
    const backwards = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [],
      expenseAmounts: codes.map(() => 5),
      expenseCurrencies: [...codes].reverse(),
      currency: 'EUR',
    })
    expect(forwards.otherCurrencies).toEqual(['GBP', 'JPY', 'NGN', 'USD'])
    expect(backwards.otherCurrencies).toEqual(forwards.otherCurrencies)
  })

  it('reports every expense as uncounted when none is in the trip currency', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [80],
      expenseAmounts: [1000, 2500],
      expenseCurrencies: ['JPY', 'JPY'],
      currency: 'EUR',
    })
    expect(summary.actualSpent).toBe(0)
    expect(summary.remaining).toBe(1000)
    expect(summary.estimateVariance).toBe(80)
    expect(summary.uncountedExpenseCount).toBe(2)
    expect(summary.mixedCurrency).toBe(true)
  })

  it('treats an amount with no matching code entry as the trip currency', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [],
      expenseAmounts: [100, 50, 25],
      expenseCurrencies: ['EUR'],
      currency: 'EUR',
    })
    expect(summary.actualSpent).toBe(175)
    expect(summary.mixedCurrency).toBe(false)
    expect(summary.uncountedExpenseCount).toBe(0)
  })

  it('counts the trip currency when the trip is the JPY one', () => {
    const summary = summariseBudget({
      tripBudget: 150_000,
      itineraryEstimates: [],
      expenseAmounts: [1000, 20],
      expenseCurrencies: ['JPY', 'EUR'],
      currency: 'JPY',
    })
    expect(summary.actualSpent).toBe(1000)
    expect(summary.remaining).toBe(149_000)
    expect(summary.otherCurrencies).toEqual(['EUR'])
  })
})

describe('summariseBudget and a mixed-currency itinerary estimate', () => {
  it('counts only the priced stops it leaves out, not the free ones', () => {
    // After a destination change: 5 priced and 3 free stops are still in EUR.
    const summary = summariseBudget({
      tripBudget: 1_000_000,
      itineraryEstimates: [10, 0, 20, 0, 30, 0, 40, 50],
      itineraryEstimateCurrencies: ['EUR', 'EUR', 'EUR', 'EUR', 'EUR', 'EUR', 'EUR', 'EUR'],
      expenseAmounts: [],
      currency: 'NGN',
    })
    expect(summary.uncountedEstimateCount).toBe(5)
    expect(summary.otherEstimateCurrencies).toEqual(['EUR'])
  })

  it('does not report a mix when the only stops in another currency are free', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [0, 0, 45],
      itineraryEstimateCurrencies: ['EUR', 'EUR', 'GBP'],
      expenseAmounts: [],
      currency: 'GBP',
    })
    expect(summary.mixedEstimateCurrency).toBe(false)
    expect(summary.otherEstimateCurrencies).toEqual([])
    expect(summary.uncountedEstimateCount).toBe(0)
  })

  it('shares one rule between the budget summary and partitionByCurrency', () => {
    const amounts = [10, 0, 20, 0, 30, 0, 40, 50]
    const codes: CurrencyCode[] = amounts.map(() => 'EUR')
    expect(partitionByCurrency(amounts, codes, 'NGN').uncountedCount).toBe(5)
    expect(partitionByCurrency(amounts, codes, 'EUR').uncountedCount).toBe(0)
  })

  it('reports no mixing when the estimate currencies are not supplied at all', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [45.5, 60],
      expenseAmounts: [],
      currency: 'EUR',
    })
    expect(summary.itineraryEstimate).toBe(105.5)
    expect(summary.mixedEstimateCurrency).toBe(false)
    expect(summary.otherEstimateCurrencies).toEqual([])
    expect(summary.uncountedEstimateCount).toBe(0)
  })

  it('reports no mixing when every supplied estimate currency matches the trip', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [45.5, 60],
      itineraryEstimateCurrencies: ['EUR', 'EUR'],
      expenseAmounts: [],
      currency: 'EUR',
    })
    expect(summary.itineraryEstimate).toBe(105.5)
    expect(summary.mixedEstimateCurrency).toBe(false)
    expect(summary.otherEstimateCurrencies).toEqual([])
    expect(summary.uncountedEstimateCount).toBe(0)
  })

  it('behaves identically whether matching estimate currencies are supplied or omitted', () => {
    const withCodes = summariseBudget({
      tripBudget: 2500,
      itineraryEstimates: [45.5, 60, 12.25],
      itineraryEstimateCurrencies: ['EUR', 'EUR', 'EUR'],
      expenseAmounts: [100, 50.5],
      expenseCurrencies: ['EUR', 'EUR'],
      currency: 'EUR',
    })
    const withoutCodes = summariseBudget({
      tripBudget: 2500,
      itineraryEstimates: [45.5, 60, 12.25],
      expenseAmounts: [100, 50.5],
      currency: 'EUR',
    })
    expect(withCodes).toEqual(withoutCodes)
  })

  it('keeps a foreign stop out of the estimate and reports it instead', () => {
    const summary = summariseBudget({
      tripBudget: 1_000_000,
      itineraryEstimates: [50_000, 22],
      itineraryEstimateCurrencies: ['NGN', 'EUR'],
      expenseAmounts: [],
      currency: 'NGN',
    })
    expect(summary.itineraryEstimate).toBe(50_000)
    expect(summary.mixedEstimateCurrency).toBe(true)
    expect(summary.otherEstimateCurrencies).toEqual(['EUR'])
    expect(summary.uncountedEstimateCount).toBe(1)
  })

  it('keeps the excluded stop out of estimateVariance too', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [200, 5000],
      itineraryEstimateCurrencies: ['EUR', 'JPY'],
      expenseAmounts: [50],
      currency: 'EUR',
    })
    expect(summary.itineraryEstimate).toBe(200)
    expect(summary.estimateVariance).toBe(150)
  })

  it('counts every mismatched stop and dedupes the codes it reports', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [10, 20, 30, 40],
      itineraryEstimateCurrencies: ['USD', 'JPY', 'JPY', 'EUR'],
      expenseAmounts: [],
      currency: 'EUR',
    })
    expect(summary.itineraryEstimate).toBe(40)
    expect(summary.uncountedEstimateCount).toBe(3)
    expect(summary.otherEstimateCurrencies).toEqual(['JPY', 'USD'])
  })

  it('sorts the reported estimate codes deterministically whatever order they arrive in', () => {
    const codes: CurrencyCode[] = ['USD', 'NGN', 'JPY', 'GBP']
    const forwards = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: codes.map(() => 5),
      itineraryEstimateCurrencies: codes,
      expenseAmounts: [],
      currency: 'EUR',
    })
    const backwards = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: codes.map(() => 5),
      itineraryEstimateCurrencies: [...codes].reverse(),
      expenseAmounts: [],
      currency: 'EUR',
    })
    expect(forwards.otherEstimateCurrencies).toEqual(['GBP', 'JPY', 'NGN', 'USD'])
    expect(backwards.otherEstimateCurrencies).toEqual(forwards.otherEstimateCurrencies)
  })

  it('reports every stop as uncounted when none is in the trip currency', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [22, 16],
      itineraryEstimateCurrencies: ['EUR', 'EUR'],
      expenseAmounts: [120],
      currency: 'NGN',
    })
    expect(summary.itineraryEstimate).toBe(0)
    expect(summary.uncountedEstimateCount).toBe(2)
    expect(summary.mixedEstimateCurrency).toBe(true)
    expect(summary.otherEstimateCurrencies).toEqual(['EUR'])
    // The estimate collapsing to zero must not disturb the settled figures.
    expect(summary.actualSpent).toBe(120)
    expect(summary.remaining).toBe(880)
  })

  it('treats an estimate with no matching code entry as the trip currency', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [100, 50, 25],
      itineraryEstimateCurrencies: ['EUR'],
      expenseAmounts: [],
      currency: 'EUR',
    })
    expect(summary.itineraryEstimate).toBe(175)
    expect(summary.mixedEstimateCurrency).toBe(false)
    expect(summary.uncountedEstimateCount).toBe(0)
  })

  it('totals a JPY plan in whole yen and excludes the foreign stop', () => {
    const summary = summariseBudget({
      tripBudget: 150_000,
      itineraryEstimates: [1200, 3400, 22.5],
      itineraryEstimateCurrencies: ['JPY', 'JPY', 'EUR'],
      expenseAmounts: [1000],
      expenseCurrencies: ['JPY'],
      currency: 'JPY',
    })
    expect(summary.itineraryEstimate).toBe(4600)
    expect(Number.isInteger(summary.itineraryEstimate)).toBe(true)
    expect(summary.uncountedEstimateCount).toBe(1)
    expect(summary.estimateVariance).toBe(3600)
    expect(summary.remaining).toBe(149_000)
  })

  it('reports estimate mixing and expense mixing independently', () => {
    const summary = summariseBudget({
      tripBudget: 1000,
      itineraryEstimates: [200, 5000],
      itineraryEstimateCurrencies: ['EUR', 'JPY'],
      expenseAmounts: [50, 60],
      expenseCurrencies: ['EUR', 'EUR'],
      currency: 'EUR',
    })
    expect(summary.mixedEstimateCurrency).toBe(true)
    expect(summary.otherEstimateCurrencies).toEqual(['JPY'])
    expect(summary.uncountedEstimateCount).toBe(1)
    expect(summary.mixedCurrency).toBe(false)
    expect(summary.otherCurrencies).toEqual([])
    expect(summary.uncountedExpenseCount).toBe(0)
  })
})

describe('summariseBudget keeps the estimate out of the settled figures', () => {
  it('never lets the estimate reach actualSpent, remaining or isOverBudget', () => {
    const summary = summariseBudget({
      tripBudget: 100,
      itineraryEstimates: [10_000],
      itineraryEstimateCurrencies: ['EUR'],
      expenseAmounts: [40],
      expenseCurrencies: ['EUR'],
      currency: 'EUR',
    })
    expect(summary.itineraryEstimate).toBe(10_000)
    expect(summary.actualSpent).toBe(40)
    expect(summary.remaining).toBe(60)
    expect(summary.isOverBudget).toBe(false)
  })

  it('never lets a mismatched estimate reach them either', () => {
    const summary = summariseBudget({
      tripBudget: 100,
      itineraryEstimates: [10_000, 500_000],
      itineraryEstimateCurrencies: ['EUR', 'NGN'],
      expenseAmounts: [40],
      expenseCurrencies: ['EUR'],
      currency: 'EUR',
    })
    expect(summary.actualSpent).toBe(40)
    expect(summary.remaining).toBe(60)
    expect(summary.isOverBudget).toBe(false)
  })

  it('gives remaining as budget minus actualSpent exactly, whatever the estimates are', () => {
    const cases: ReadonlyArray<{ budget: number; spent: readonly number[]; expected: number }> = [
      { budget: 100, spent: [100], expected: 0 },
      { budget: 100, spent: [40, 20], expected: 40 },
      { budget: 100, spent: [150], expected: -50 },
      { budget: 100, spent: [99.99], expected: 0.01 },
      { budget: 100, spent: [100.01], expected: -0.01 },
    ]
    for (const { budget, spent, expected } of cases) {
      const summary = summariseBudget({
        tripBudget: budget,
        itineraryEstimates: [777.77, 88_888],
        itineraryEstimateCurrencies: ['EUR', 'NGN'],
        expenseAmounts: [...spent],
        expenseCurrencies: spent.map(() => 'EUR' as CurrencyCode),
        currency: 'EUR',
      })
      expect(summary.remaining, `budget=${budget} spent=${spent.join('+')}`).toBe(expected)
      expect(summary.remaining).toBe(
        fromCents(toCents(summary.tripBudget) - toCents(summary.actualSpent)),
      )
      expect(summary.isOverBudget).toBe(expected < 0)
    }
  })

  it('holds the same identity for a JPY trip at the whole-yen boundary', () => {
    const cases: ReadonlyArray<{ budget: number; spent: number; expected: number }> = [
      { budget: 150_000, spent: 150_000, expected: 0 },
      { budget: 150_000, spent: 149_999, expected: 1 },
      { budget: 150_000, spent: 150_001, expected: -1 },
    ]
    for (const { budget, spent, expected } of cases) {
      const summary = summariseBudget({
        tripBudget: budget,
        itineraryEstimates: [4600],
        itineraryEstimateCurrencies: ['JPY'],
        expenseAmounts: [spent],
        expenseCurrencies: ['JPY'],
        currency: 'JPY',
      })
      expect(summary.remaining, `spent=${spent}`).toBe(expected)
      expect(summary.remaining).toBe(
        fromCents(toCents(summary.tripBudget, 'JPY') - toCents(summary.actualSpent, 'JPY'), 'JPY'),
      )
      expect(summary.isOverBudget).toBe(expected < 0)
    }
  })
})
