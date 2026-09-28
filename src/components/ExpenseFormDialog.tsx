import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { NumberField, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { parseISODate, todayISO } from '@/domain/format'
import { CURRENCY_SYMBOLS, formatAmount, fromCents, toCents } from '@/domain/money'
import { EXPENSE_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist } from '@/state/useTourist'
import type { CurrencyCode, Expense, ExpenseCategory, Trip } from '@/domain/types'

const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'stay',
  'food',
  'transport',
  'activities',
  'shopping',
  'other',
]

const EXPENSE_CATEGORY_OPTIONS: ReadonlyArray<{ value: ExpenseCategory; label: string }> =
  EXPENSE_CATEGORIES.map((category) => ({ value: category, label: EXPENSE_CATEGORY_LABEL[category] }))

interface ExpenseDraft {
  description: string
  amount: number
  category: ExpenseCategory
  date: string
  notes: string
}

type ExpenseErrors = Partial<Record<keyof ExpenseDraft, string>>

function emptyDraft(): ExpenseDraft {
  return { description: '', amount: 0, category: 'food', date: todayISO(), notes: '' }
}

function toDraft(expense: Expense): ExpenseDraft {
  return {
    description: expense.description,
    amount: expense.amount,
    category: expense.category,
    date: expense.date,
    notes: expense.notes,
  }
}

/**
 * The amount exactly as the domain will store it: rounded on the currency's own
 * scale by `toCents`, so hundredths for EUR and whole yen for JPY. Rounding here
 * with `Math.round(x * 100) / 100` disagreed with the domain twice over — it
 * turned 1.005 into 1.00 where `toCents` gives 1.01, and it gave yen two
 * decimals they do not have, which the domain then rounded a second time.
 */
function settledAmount(amount: number, currency: CurrencyCode): number {
  return fromCents(toCents(amount, currency), currency)
}

function validateExpense(draft: ExpenseDraft, currency: CurrencyCode): ExpenseErrors {
  const errors: ExpenseErrors = {}
  if (draft.description.trim().length < 2) {
    errors.description = 'Describe what this was for, in at least 2 characters.'
  }
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    errors.amount = 'Enter an amount greater than 0.'
  } else if (toCents(draft.amount, currency) <= 0) {
    // Positive, but below the currency's smallest unit, so it would be stored
    // as nothing. Said here rather than left for the domain to reject.
    errors.amount = `Enter at least ${formatAmount(fromCents(1, currency), currency)}.`
  }
  if (!parseISODate(draft.date)) {
    errors.date = 'Choose the date you paid.'
  }
  return errors
}

function ExpenseForm({
  formId,
  draft,
  errors,
  submitted,
  currency,
  tripCurrency,
  onPatch,
  onSubmit,
}: {
  formId: string
  draft: ExpenseDraft
  errors: ExpenseErrors
  submitted: boolean
  /** The currency this expense is (or will be) stored in. */
  currency: CurrencyCode
  /** The trip's currency, which is what its totals are counted in. */
  tripCurrency: CurrencyCode
  onPatch: (update: Partial<ExpenseDraft>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const summaryRef = useRef<HTMLDivElement>(null)
  const messages = Object.values(errors).filter((message): message is string => Boolean(message))
  const messageCount = messages.length

  useEffect(() => {
    if (submitted && messageCount > 0) summaryRef.current?.focus()
  }, [messageCount, submitted])

  return (
    <form id={formId} noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {messageCount > 0 ? (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="rounded-control border border-danger/40 bg-danger-bg px-4 py-3 text-danger-ink"
        >
          <p className="text-label-lg">
            {messageCount === 1 ? '1 field needs attention' : `${messageCount} fields need attention`}
          </p>
          <ul className="mt-1 flex list-none flex-col gap-0.5 text-body-sm">
            {messages.map((message, index) => (
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <TextField
        label="What was it for"
        required
        value={draft.description}
        maxLength={80}
        placeholder="Dinner at Chez Janou"
        error={errors.description}
        onChange={(event) => onPatch({ description: event.target.value })}
      />

      {/*
        The currency is stated once for the whole form rather than repeated as a
        `EUR` suffix beside a `€` prefix in the amount field itself.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Amount"
          required
          min={0}
          step={fromCents(1, currency)}
          value={draft.amount}
          prefix={CURRENCY_SYMBOLS[currency]}
          error={errors.amount}
          onValueChange={(value) => onPatch({ amount: value })}
        />
        <TextField
          label="Date paid"
          required
          type="date"
          value={draft.date}
          error={errors.date}
          onChange={(event) => onPatch({ date: event.target.value })}
        />
      </div>

      <p className="flex items-center gap-1.5 text-body-sm text-ink-subtle">
        <Icon name="currency_exchange" size={14} className="shrink-0" />
        {`Amounts are in ${currency} (${CURRENCY_SYMBOLS[currency]}) and never converted. Anything paid before departure counts too.`}
      </p>

      {/*
        Editing an expense logged before the trip's currency changed. It stays in
        the currency it was paid in — this form cannot change that — so it says
        plainly that the amount is not part of the trip's totals.
      */}
      {currency === tripCurrency ? null : (
        <p className="text-body-sm text-ink-subtle">
          {`This expense was logged in ${currency} and this trip is in ${tripCurrency}, so it is not in the ${tripCurrency} total. Saving keeps it in ${currency}.`}
        </p>
      )}

      <SelectField
        label="Category"
        required
        options={EXPENSE_CATEGORY_OPTIONS}
        value={draft.category}
        error={errors.category}
        onChange={(event) => onPatch({ category: event.target.value as ExpenseCategory })}
      />

      <TextAreaField
        label="Notes"
        rows={2}
        maxLength={300}
        value={draft.notes}
        placeholder="Optional: who was paid, or what it covered."
        onChange={(event) => onPatch({ notes: event.target.value })}
      />
    </form>
  )
}

export function ExpenseFormDialog({
  trip,
  open,
  onClose,
}: {
  trip: Trip
  open: boolean
  onClose: () => void
}) {
  const { actions } = useTourist()
  const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft)
  const [errors, setErrors] = useState<ExpenseErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const formId = useId()
  // A new expense is always stored in the trip's current currency.
  const currency = trip.currency

  useEffect(() => {
    if (!open) return
    setDraft(emptyDraft())
    setErrors({})
    setSubmitted(false)
  }, [open])

  const patch = useCallback(
    (update: Partial<ExpenseDraft>) => {
      const merged = { ...draft, ...update }
      setDraft(merged)
      if (submitted) setErrors(validateExpense(merged, currency))
    },
    [draft, submitted, currency],
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const result = validateExpense(draft, currency)
    setErrors(result)
    if (Object.keys(result).length > 0) return
    actions.addExpense({
      tripId: trip.id,
      description: draft.description.trim(),
      amount: settledAmount(draft.amount, currency),
      category: draft.category,
      date: draft.date,
      notes: draft.notes.trim(),
    })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Add expense"
      description={`Something you have already paid for. It counts towards ${PROTOTYPE_LABEL.actualSpent} straight away.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            icon={<Icon name="check" size={18} />}
          >
            Save expense
          </Button>
        </>
      }
    >
      <ExpenseForm
        formId={formId}
        draft={draft}
        errors={errors}
        submitted={submitted}
        currency={currency}
        tripCurrency={trip.currency}
        onPatch={patch}
        onSubmit={handleSubmit}
      />
    </Dialog>
  )
}

export function EditExpenseDialog({
  trip,
  expense,
  open,
  onClose,
}: {
  trip: Trip
  expense: Expense | null
  open: boolean
  onClose: () => void
}) {
  const { actions } = useTourist()
  const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft)
  const [errors, setErrors] = useState<ExpenseErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const formId = useId()
  // An edit never changes an expense's currency (the patch below does not send
  // one), so the amount is read, validated and rounded in the currency it was
  // logged in — not the trip's, which may have changed since.
  const currency = expense?.currency ?? trip.currency

  useEffect(() => {
    if (!open || !expense) return
    setDraft(toDraft(expense))
    setErrors({})
    setSubmitted(false)
  }, [open, expense])

  const patch = useCallback(
    (update: Partial<ExpenseDraft>) => {
      const merged = { ...draft, ...update }
      setDraft(merged)
      if (submitted) setErrors(validateExpense(merged, currency))
    },
    [draft, submitted, currency],
  )

  if (!expense) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const result = validateExpense(draft, currency)
    setErrors(result)
    if (Object.keys(result).length > 0) return
    actions.updateExpense(expense.id, {
      description: draft.description.trim(),
      amount: settledAmount(draft.amount, currency),
      category: draft.category,
      date: draft.date,
      notes: draft.notes.trim(),
    })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Edit expense"
      description={`${PROTOTYPE_LABEL.actualSpent} and ${PROTOTYPE_LABEL.remaining} update straight away.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            icon={<Icon name="check" size={18} />}
          >
            Save changes
          </Button>
        </>
      }
    >
      <ExpenseForm
        formId={formId}
        draft={draft}
        errors={errors}
        submitted={submitted}
        currency={currency}
        tripCurrency={trip.currency}
        onPatch={patch}
        onSubmit={handleSubmit}
      />
    </Dialog>
  )
}
