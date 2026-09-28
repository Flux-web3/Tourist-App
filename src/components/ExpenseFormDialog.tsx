import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { NumberField, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { parseISODate, todayISO } from '@/domain/format'
import { CURRENCY_SYMBOLS } from '@/domain/money'
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

function validateExpense(draft: ExpenseDraft): ExpenseErrors {
  const errors: ExpenseErrors = {}
  if (draft.description.trim().length < 2) {
    errors.description = 'Describe what this was for, in at least 2 characters.'
  }
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    errors.amount = 'Enter an amount greater than 0.'
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
  onPatch,
  onSubmit,
}: {
  formId: string
  draft: ExpenseDraft
  errors: ExpenseErrors
  submitted: boolean
  currency: CurrencyCode
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
      <p className="flex items-start gap-2 rounded-control border border-line bg-surface-low px-3 py-2 text-body-sm text-ink-muted">
        <Icon name="currency_exchange" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
        <span>
          {`Every amount stays in ${currency} (${CURRENCY_SYMBOLS[currency]}). This prototype does not convert between currencies.`}
        </span>
      </p>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Amount"
          required
          min={0}
          step={0.01}
          value={draft.amount}
          prefix={CURRENCY_SYMBOLS[currency]}
          suffix={currency}
          error={errors.amount}
          onValueChange={(value) => onPatch({ amount: value })}
        />
        <SelectField
          label="Category"
          required
          options={EXPENSE_CATEGORY_OPTIONS}
          value={draft.category}
          error={errors.category}
          onChange={(event) => onPatch({ category: event.target.value as ExpenseCategory })}
        />
      </div>

      <TextField
        label="Date paid"
        required
        type="date"
        value={draft.date}
        error={errors.date}
        hint="Anything paid before departure is valid too."
        onChange={(event) => onPatch({ date: event.target.value })}
      />

      <TextAreaField
        label="Notes"
        rows={3}
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
      if (submitted) setErrors(validateExpense(merged))
    },
    [draft, submitted],
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const result = validateExpense(draft)
    setErrors(result)
    if (Object.keys(result).length > 0) return
    actions.addExpense({
      tripId: trip.id,
      description: draft.description.trim(),
      amount: Math.round(draft.amount * 100) / 100,
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
      size="lg"
      title="Add expense"
      description={`Log something you have already paid for. It counts towards ${PROTOTYPE_LABEL.actualSpent} straight away.`}
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
        currency={trip.currency}
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
      if (submitted) setErrors(validateExpense(merged))
    },
    [draft, submitted],
  )

  if (!expense) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const result = validateExpense(draft)
    setErrors(result)
    if (Object.keys(result).length > 0) return
    actions.updateExpense(expense.id, {
      description: draft.description.trim(),
      amount: Math.round(draft.amount * 100) / 100,
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
      size="lg"
      title="Edit expense"
      description={`Correct a logged expense. ${PROTOTYPE_LABEL.actualSpent} and ${PROTOTYPE_LABEL.remaining} update straight away.`}
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
        currency={trip.currency}
        onPatch={patch}
        onSubmit={handleSubmit}
      />
    </Dialog>
  )
}
