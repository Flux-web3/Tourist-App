import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EditExpenseDialog, ExpenseFormDialog } from '@/components/ExpenseFormDialog'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle, PageHeader } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Alert } from '@/components/ui/Alert'
import { Disclosure } from '@/components/ui/Disclosure'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { ProgressBar } from '@/components/ui/StatTile'
import { formatDate, formatShortDate } from '@/domain/format'
import { estimateTotal } from '@/domain/itinerary'
import { CURRENCY_SYMBOLS, ESTIMATE_PER_PERSON_NOTE, formatAmount } from '@/domain/money'
import { EXPENSE_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { selectExpensesByCategory } from '@/state/selectors'
import { useTourist, useTrip, useTripBudget, useTripDays, useTripExpenses } from '@/state/useTourist'
import type { CurrencyCode, Expense } from '@/domain/types'

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Provenance tints for the three supporting figures.
 *
 * The four figures on this page each come from a different place, and the
 * design system encodes that in colour: `planned-*` is the traveller's own
 * ceiling, `ai-*` is a projection, `actual-*` is settled money. Losing that
 * coding would be losing the product's whole argument about financial honesty,
 * so the figures got denser rather than plainer.
 */
type FigureTone = 'planned' | 'ai' | 'actual'

const FIGURE_TONE: Record<FigureTone, string> = {
  planned: 'border-planned-border bg-planned-bg text-planned-ink',
  ai: 'border-ai-border bg-ai-bg text-ai-ink',
  actual: 'border-actual-border bg-actual-bg text-actual-ink',
}

function FigureRow({
  tone,
  icon,
  label,
  note,
  amount,
  currency,
}: {
  tone: FigureTone
  icon: string
  label: string
  note?: string
  amount: number
  currency: CurrencyCode
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-control border px-3.5 py-2.5 ${FIGURE_TONE[tone]}`}
    >
      <dt className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-label-lg">
        <Icon name={icon} size={14} className="shrink-0 self-center" />
        <span className="min-w-0">{label}</span>
        {note ? <span className="text-body-sm font-normal">{note}</span> : null}
      </dt>
      <dd className="tnum min-w-0 max-w-[60%] text-right text-body-lg font-semibold [overflow-wrap:anywhere]">
        {formatAmount(amount, currency)}
      </dd>
    </div>
  )
}

/** The closing line of a list card: one label, one figure, one rule above it. */
function TotalRow({ label, amount }: { label: string; amount: string }) {
  return (
    <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-label-lg text-ink">
      <span>{label}</span>
      <span className="tnum text-right [overflow-wrap:anywhere]">{amount}</span>
    </p>
  )
}

function Definition({ term, children }: { term: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label-md">{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function BudgetPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { actions, hydrated } = useTourist()
  const trip = useTrip(tripId)
  const days = useTripDays(tripId)
  const expenses = useTripExpenses(tripId)
  const budget = useTripBudget(tripId)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)

  const openAdd = useCallback(() => setAddOpen(true), [])
  const closeAdd = useCallback(() => setAddOpen(false), [])
  const closeEdit = useCallback(() => setEditing(null), [])
  const closeDelete = useCallback(() => setDeleting(null), [])

  // Counted in the trip's currency only, by the same rule as Actual Spent, so
  // the category rows always add up to that figure exactly.
  const tripCurrency = trip?.currency
  const breakdown = useMemo(
    () => (tripCurrency ? selectExpensesByCategory(expenses, tripCurrency) : []),
    [expenses, tripCurrency],
  )

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Budget" description="Restoring this trip from your device." />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!trip || !budget) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Budget"
          description="The trip this budget belonged to is no longer on this device."
        />
        <EmptyState
          icon="search_off"
          title="We could not find that trip"
          description="It may have been deleted, or the link is out of date. Every other trip is still saved here."
          action={
            <ButtonLink
              to="/trips"
              variant="primary"
              icon={<Icon name="arrow_back" size={18} />}
            >
              Back to trips
            </ButtonLink>
          }
        />
      </div>
    )
  }

  const hasBudget = budget.tripBudget > 0
  const percent = hasBudget ? Math.round((budget.actualSpent / budget.tripBudget) * 100) : 0
  const currency = trip.currency
  const over = budget.isOverBudget
  const overBy = formatAmount(Math.abs(budget.remaining), currency)
  const remainingText = formatAmount(budget.remaining, currency)
  const uncountedLabel = countLabel(budget.uncountedExpenseCount, 'expense', 'expenses')
  const otherCurrencyList = budget.otherCurrencies.join(', ')
  const deletingIsForeign = deleting !== null && deleting.currency !== currency

  // What the traveller can actually do about expenses in another currency. The
  // expense form has no currency control, so "edit them" would be advice the
  // product cannot follow; setting the trip's currency back is the one way.
  const oneUncounted = budget.uncountedExpenseCount === 1
  const mixedExpenseAdvice = [
    `${oneUncounted ? 'It was' : 'They were'} logged in ${otherCurrencyList} and this trip is in ${currency}.`,
    `Tourist does not convert between currencies, so ${oneUncounted ? 'it is' : 'they are'} kept exactly as logged and left out of ${PROTOTYPE_LABEL.actualSpent}.`,
    budget.otherCurrencies.length === 1
      ? `Set the trip's currency back to ${otherCurrencyList} from Edit trip on the overview and ${oneUncounted ? 'it counts' : 'they count'} again.`
      : `Set the trip's currency to one of those from Edit trip on the overview and the expenses logged in it count again.`,
  ].join(' ')

  const confirmDelete = () => {
    if (!deleting) return
    actions.removeExpense(trip.id, deleting.id)
    closeDelete()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Budget"
        title={trip.name}
        description="Log what you spend and this stays honest: the itinerary estimate is a projection, never a bill."
        actions={
          <>
            <ButtonLink
              to={`/trips/${trip.id}`}
              variant="secondary"
              icon={<Icon name="arrow_back" size={18} />}
            >
              Trip overview
            </ButtonLink>
            <Button variant="primary" icon={<Icon name="add" size={18} />} onClick={openAdd}>
              Add expense
            </Button>
          </>
        }
      />

      {/*
        One card, four figures, roughly one phone screen. These used to be four
        full-width tiles carrying `€1,385.00 EUR` each, which pushed the expense
        list — the only part of the page a traveller acts on — below the fold.
      */}
      <section aria-label="Budget summary" className="surface-card flex flex-col gap-5 p-5">
        {/*
          Over budget reads through the `danger` border and figure plus the
          wording, not through a flooded red panel or an alarm icon. The minus
          sign and the sentence carry it without depending on colour, and
          `danger-bg` as a fill is a saturated block in the dark theme, which
          made a normal trip overspend look like a system failure.
        */}
        <div
          role="status"
          className={`rounded-control border bg-surface-low px-4 py-4 ${
            over ? 'border-danger/50' : 'border-line'
          }`}
        >
          <p className={`eyebrow flex items-center gap-1.5 ${over ? 'text-danger' : ''}`}>
            <Icon name="account_balance_wallet" size={14} className="shrink-0" />
            <span>{PROTOTYPE_LABEL.remaining}</span>
          </p>
          {/*
            Sized by length so the figure fits on one line at 320px. A deep
            naira overspend (`-₦10,860,678.90`) otherwise wrapped after the
            minus, leaving the sign alone above the number.
          */}
          <p
            className={`tnum mt-1 [overflow-wrap:anywhere] ${
              remainingText.length <= 11
                ? 'text-headline-lg sm:text-display'
                : remainingText.length <= 15
                  ? 'text-headline-md sm:text-headline-lg'
                  : 'text-headline-sm sm:text-headline-lg'
            } ${over ? 'text-danger' : 'text-ink'}`}
          >
            {remainingText}
          </p>
          <p className="mt-1.5 text-body-sm text-ink-muted">
            {over
              ? `${overBy} past your ${PROTOTYPE_LABEL.tripBudget}. Log less, remove an expense, or raise the budget.`
              : `${PROTOTYPE_LABEL.tripBudget} minus ${PROTOTYPE_LABEL.actualSpent}.`}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-label-lg text-ink">Budget used</p>
            <p className="tnum text-body-sm text-ink-muted">
              {hasBudget
                ? `${percent}% of ${formatAmount(budget.tripBudget, currency)}`
                : 'No trip budget set yet'}
            </p>
          </div>
          <ProgressBar
            value={budget.actualSpent}
            max={budget.tripBudget}
            label="Budget used"
            tone={over ? 'danger' : 'actual'}
          />
          {hasBudget ? null : (
            <p className="text-body-sm text-ink-subtle">
              Add a trip budget and this bar starts tracking how far the trip has gone.
            </p>
          )}
        </div>

        <dl className="flex flex-col gap-2">
          <FigureRow
            tone="planned"
            icon="savings"
            label={PROTOTYPE_LABEL.tripBudget}
            note="your ceiling"
            amount={budget.tripBudget}
            currency={currency}
          />
          <FigureRow
            tone="ai"
            icon="auto_awesome"
            label={PROTOTYPE_LABEL.aiDraftEstimate}
            note="per person, a projection"
            amount={budget.itineraryEstimate}
            currency={currency}
          />
          <FigureRow
            tone="actual"
            icon="receipt_long"
            label={PROTOTYPE_LABEL.actualSpent}
            note="settled"
            amount={budget.actualSpent}
            currency={currency}
          />
        </dl>
      </section>

      {/*
        The standing explanation of the four figures, as one openable line. It
        used to be a full card of definitions plus an alert, which is where a
        third of the first screen went.
      */}
      {/*
        Changing a trip's currency leaves already-logged expenses in the one
        they were paid in. Those are left out of Actual Spent rather than summed
        across currencies, so the total stays true — but a total that quietly
        omits expenses would be the worst kind of wrong, so it says so.

        The advice is only what the product can actually do. An expense's
        currency cannot be edited, so the one way to count them again is to set
        the trip's currency back.
      */}
      {budget.mixedCurrency ? (
        <Alert
          tone="warning"
          title={`${budget.uncountedExpenseCount} ${
            budget.uncountedExpenseCount === 1 ? 'expense is' : 'expenses are'
          } not counted in this total`}
        >
          {mixedExpenseAdvice}
        </Alert>
      ) : null}

      {/*
        The same rule for the itinerary. A stop saved from the catalogue keeps
        the catalogue's currency, and a stop you priced yourself keeps the one
        it was priced in, so after a currency change some estimates no longer
        belong in this total. They are left out rather than converted.
      */}
      {budget.mixedEstimateCurrency ? (
        <Alert
          tone="warning"
          title={`${budget.uncountedEstimateCount} planned ${
            budget.uncountedEstimateCount === 1 ? 'stop is' : 'stops are'
          } not counted in the ${PROTOTYPE_LABEL.aiDraftEstimate}`}
        >
          {`They are priced in ${budget.otherEstimateCurrencies.join(', ')} and this trip is in ${currency}. Tourist does not convert between currencies. Your ${PROTOTYPE_LABEL.tripBudget}, ${PROTOTYPE_LABEL.actualSpent} and ${PROTOTYPE_LABEL.remaining} are unaffected, because the estimate never counts toward them.`}
        </Alert>
      ) : null}

      <Disclosure
        icon="info"
        summary={
          <>
            <strong className="font-semibold">{`All amounts in ${currency} (${CURRENCY_SYMBOLS[currency]}).`}</strong>{' '}
            Four figures, each from somewhere different.
          </>
        }
      >
        <dl className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-x-6">
          <Definition term={PROTOTYPE_LABEL.tripBudget}>
            Your ceiling for the whole trip. You set it when planning the trip and can change it at
            any time.
          </Definition>
          <Definition term={PROTOTYPE_LABEL.aiDraftEstimate}>
            {`A projection from the itinerary, not a booking or a bill. It adds up the estimated cost of every planned stop. ${ESTIMATE_PER_PERSON_NOTE}`}
          </Definition>
          <Definition term={PROTOTYPE_LABEL.actualSpent}>
            Expenses you have logged. This is the only settled figure on the page.
          </Definition>
          <Definition term={PROTOTYPE_LABEL.remaining}>
            Trip budget minus actual spent. It can go negative, which means you are over budget.
          </Definition>
        </dl>
        <p className="mt-3 opacity-90">
          {`Two rules that never bend. The ${PROTOTYPE_LABEL.aiDraftEstimate} is never added to your actual spend, so ${PROTOTYPE_LABEL.remaining} is worked out from logged expenses only. And no currency conversion happens anywhere in Tourist, so a trip is only ever tracked in its own currency.`}
        </p>
      </Disclosure>

      <Card>
        <CardTitle
          hint={`${countLabel(expenses.length, 'expense', 'expenses')} logged, newest first.`}
          action={
            <Button variant="secondary" icon={<Icon name="add" size={18} />} onClick={openAdd}>
              Add expense
            </Button>
          }
        >
          Expenses
        </CardTitle>
        {expenses.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            title="No expenses logged yet"
            description="Logging real spending is what makes this budget useful. Until then the only figure with any weight is your own trip budget."
            action={
              <Button variant="accent" icon={<Icon name="add" size={18} />} onClick={openAdd}>
                Add expense
              </Button>
            }
          />
        ) : (
          <>
            <ul className="flex list-none flex-col">
              {expenses.map((expense) => (
                <li
                  key={expense.id}
                  className="flex items-start gap-3 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-label-lg text-ink">{expense.description}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge tone="actual">{EXPENSE_CATEGORY_LABEL[expense.category]}</Badge>
                      <span className="tnum text-body-sm text-ink-subtle">
                        {formatShortDate(expense.date)}
                      </span>
                      {/*
                        Logged before the trip's currency changed. The amount
                        stays in its own currency; this says why it is missing
                        from the total, in the wrapping line rather than the
                        amount column so a long note never widens the row.
                      */}
                      {expense.currency === currency ? null : (
                        <span className="tnum text-body-sm text-ink-subtle">
                          {`${expense.currency} · not in the ${currency} total`}
                        </span>
                      )}
                    </p>
                    {expense.notes ? (
                      <p className="mt-1 text-body-sm text-ink-muted">{expense.notes}</p>
                    ) : null}
                  </div>
                  {/*
                    Amounts keep their own right-hand column so the list stays
                    scannable. Each is shown in the currency it was logged in,
                    never relabelled with the trip's symbol.
                  */}
                  <div className="flex max-w-[60%] shrink-0 items-center gap-1">
                    <p className="tnum text-right text-label-lg font-semibold text-ink [overflow-wrap:anywhere]">
                      {formatAmount(expense.amount, expense.currency)}
                    </p>
                    <ActionMenu
                      label={`Actions for ${expense.description}`}
                      items={[
                        { label: 'Edit', icon: 'edit', onSelect: () => setEditing(expense) },
                        {
                          label: 'Delete',
                          icon: 'delete_outline',
                          destructive: true,
                          onSelect: () => setDeleting(expense),
                        },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <TotalRow
              label={PROTOTYPE_LABEL.actualSpent}
              amount={formatAmount(budget.actualSpent, currency)}
            />
          </>
        )}
      </Card>

      <Card>
        <CardTitle hint="Share of what you have already spent, largest share first.">
          Where the money went
        </CardTitle>
        {breakdown.length === 0 && budget.uncountedExpenseCount > 0 ? (
          // Expenses exist, but none is in the trip's currency, so there is
          // nothing this breakdown can honestly total.
          <EmptyState
            icon="donut_large"
            title={`Nothing in ${currency} to break down yet`}
            description={`Your ${uncountedLabel} ${oneUncounted ? 'is' : 'are'} in ${otherCurrencyList}, kept exactly as logged. Each category appears here once you log spending in ${currency}.`}
          />
        ) : breakdown.length === 0 ? (
          <EmptyState
            icon="donut_large"
            title="No spending to break down yet"
            description="Each category appears here as soon as you log an expense, with its share of your real spend."
          />
        ) : (
          <>
            <ul className="flex list-none flex-col gap-4">
              {breakdown.map((row) => {
                const share =
                  budget.actualSpent > 0 ? Math.round((row.total / budget.actualSpent) * 100) : 0
                const label = EXPENSE_CATEGORY_LABEL[row.category]
                return (
                  <li key={row.category} className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-label-lg text-ink">{label}</span>
                      <span className="tnum text-right text-label-lg font-semibold text-ink [overflow-wrap:anywhere]">
                        {formatAmount(row.total, currency)}
                      </span>
                    </div>
                    <ProgressBar
                      value={row.total}
                      max={budget.actualSpent}
                      label={`${label} share of logged spend`}
                      tone="actual"
                    />
                    <p className="tnum text-body-sm text-ink-subtle">
                      {`${share}% · ${countLabel(row.count, 'expense', 'expenses')}`}
                    </p>
                  </li>
                )
              })}
            </ul>
            <TotalRow label="Total logged" amount={formatAmount(budget.actualSpent, currency)} />
            {budget.mixedCurrency ? (
              <p className="tnum mt-1 text-body-sm text-ink-subtle">
                {`Not counted here: ${uncountedLabel} in ${otherCurrencyList}.`}
              </p>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <CardTitle
          hint="Projected from the itinerary, one line per day. Never added to what you actually spend."
          action={
            <Badge tone="ai" icon={<Icon name="auto_awesome" size={12} />}>
              {PROTOTYPE_LABEL.aiDraft}
            </Badge>
          }
        >
          Planned estimate by day
        </CardTitle>
        {days.length === 0 ? (
          <EmptyState
            icon="calendar_month"
            title="No itinerary draft to project from"
            description="Generate the day-by-day draft and every day's projected cost will be listed here, clearly separate from your real spending."
            action={
              <ButtonLink
                to={`/trips/${trip.id}/itinerary`}
                variant="secondary"
                icon={<Icon name="auto_awesome" size={18} />}
              >
                Open the itinerary
              </ButtonLink>
            }
          />
        ) : (
          <>
            <ul className="flex list-none flex-col">
              {days.map((day) => (
                <li
                  key={day.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <span className="text-body-md text-ink-muted">
                    <span className="tnum text-label-lg text-ink">{`Day ${day.index}`}</span>
                    <span className="tnum ml-2 text-body-sm text-ink-subtle">
                      {formatShortDate(day.date)}
                    </span>
                  </span>
                  <span className="tnum text-right text-body-md font-semibold text-ink [overflow-wrap:anywhere]">
                    {formatAmount(estimateTotal([day], currency), currency)}
                  </span>
                </li>
              ))}
            </ul>
            <TotalRow
              label={PROTOTYPE_LABEL.aiDraftEstimate}
              amount={formatAmount(budget.itineraryEstimate, currency)}
            />
          </>
        )}
      </Card>

      <ExpenseFormDialog trip={trip} open={addOpen} onClose={closeAdd} />
      <EditExpenseDialog
        trip={trip}
        expense={editing}
        open={editing !== null}
        onClose={closeEdit}
      />
      <Dialog
        open={deleting !== null}
        onClose={closeDelete}
        title="Delete this expense?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={closeDelete}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon={<Icon name="delete_forever" size={18} />}
              onClick={confirmDelete}
            >
              Delete expense
            </Button>
          </>
        }
      >
        {deleting ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-label-lg text-ink">
              <Icon name="receipt_long" size={16} className="shrink-0 text-ink-subtle" />
              <span className="min-w-0 break-words">{deleting.description}</span>
              <span className="tnum text-body-md text-ink-muted">
                {formatAmount(deleting.amount, deleting.currency)}
              </span>
              {deletingIsForeign ? (
                <span className="tnum text-body-sm text-ink-subtle">
                  {`${deleting.currency} · not in the ${currency} total`}
                </span>
              ) : null}
            </p>
            <p className="tnum mt-1 text-body-sm text-ink-subtle">
              {`${formatDate(deleting.date)} · ${EXPENSE_CATEGORY_LABEL[deleting.category]}`}
            </p>
            <p className="mt-3 text-body-sm text-ink-muted">
              {deletingIsForeign
                ? `It is not counted in ${PROTOTYPE_LABEL.actualSpent}, so ${PROTOTYPE_LABEL.actualSpent} and ${PROTOTYPE_LABEL.remaining} stay as they are. The ${PROTOTYPE_LABEL.aiDraftEstimate} is never touched.`
                : `${PROTOTYPE_LABEL.actualSpent} and ${PROTOTYPE_LABEL.remaining} are recalculated without it. The ${PROTOTYPE_LABEL.aiDraftEstimate} is never touched.`}
            </p>
          </>
        ) : null}
      </Dialog>
    </div>
  )
}
