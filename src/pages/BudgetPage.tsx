import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { EditExpenseDialog, ExpenseFormDialog } from '@/components/ExpenseFormDialog'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle, PageHeader } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { ProgressBar, StatTile } from '@/components/ui/StatTile'
import { formatDate, formatShortDate } from '@/domain/format'
import { estimateTotal } from '@/domain/itinerary'
import { CURRENCY_SYMBOLS, formatMoney } from '@/domain/money'
import { EXPENSE_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { selectExpensesByCategory } from '@/state/selectors'
import { useTourist, useTrip, useTripBudget, useTripDays, useTripExpenses } from '@/state/useTourist'
import type { Expense } from '@/domain/types'

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function Definition({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line pb-3">
      <dt className="text-label-sm uppercase tracking-wider text-ink-subtle">{term}</dt>
      <dd className="text-body-md text-ink-muted">{children}</dd>
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

  const breakdown = useMemo(() => selectExpensesByCategory(expenses), [expenses])

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Budget" description="Restoring this trip from your device." />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
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
        description="Log what you actually spend and this budget stays honest. The itinerary estimate stays a projection and is never counted as a bill."
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

      <section aria-label="Budget summary" className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label={PROTOTYPE_LABEL.tripBudget}
            value={formatMoney(budget.tripBudget, currency)}
            caption="Your ceiling for the whole trip"
            icon={<Icon name="savings" size={14} />}
          />
          <StatTile
            label={PROTOTYPE_LABEL.aiDraftEstimate}
            value={formatMoney(budget.itineraryEstimate, currency)}
            caption="A projection from the itinerary, not a booking or a bill"
            tone="accent"
            icon={<Icon name="auto_awesome" size={14} />}
          />
          <StatTile
            label={PROTOTYPE_LABEL.actualSpent}
            value={formatMoney(budget.actualSpent, currency)}
            caption="Expenses you have logged"
            tone="actual"
            icon={<Icon name="receipt_long" size={14} />}
          />
          <StatTile
            label={PROTOTYPE_LABEL.remaining}
            value={formatMoney(budget.remaining, currency)}
            caption={
              budget.isOverBudget
                ? `Trip budget minus actual spent. You are ${formatMoney(Math.abs(budget.remaining), currency)} over budget.`
                : 'Trip budget minus actual spent'
            }
            tone={budget.isOverBudget ? 'danger' : 'neutral'}
            icon={<Icon name={budget.isOverBudget ? 'warning' : 'account_balance_wallet'} size={14} />}
          />
        </div>

        <div className="surface-card flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-label-lg text-ink">{`${PROTOTYPE_LABEL.actualSpent} against ${PROTOTYPE_LABEL.tripBudget}`}</p>
            <p className="tnum text-body-sm text-ink-muted">
              {hasBudget
                ? `${percent}% of ${formatMoney(budget.tripBudget, currency)}`
                : 'No trip budget set yet'}
            </p>
          </div>
          <ProgressBar
            value={budget.actualSpent}
            max={budget.tripBudget}
            label={`${PROTOTYPE_LABEL.actualSpent} against ${PROTOTYPE_LABEL.tripBudget}`}
            tone={budget.isOverBudget ? 'danger' : 'actual'}
          />
          <p className="tnum text-body-sm text-ink-muted">
            {hasBudget
              ? budget.isOverBudget
                ? `Over budget by ${formatMoney(Math.abs(budget.remaining), currency)}. Remove an expense, or raise the trip budget.`
                : `${formatMoney(budget.remaining, currency)} of ${formatMoney(budget.tripBudget, currency)} still unspent.`
              : 'Add a trip budget and this bar starts tracking how far the trip has gone.'}
          </p>
        </div>
      </section>

      {budget.isOverBudget ? (
        <Alert tone="danger" title="You are over budget">
          {`Logged spending exceeds the trip budget by ${formatMoney(Math.abs(budget.remaining), currency)}. ${PROTOTYPE_LABEL.aiDraftEstimate} is not part of this figure: it stays a separate projection and is never added to what you have spent.`}
        </Alert>
      ) : null}

      <Card>
        <CardTitle hint="Four figures, defined once, so nothing on this page can be read two ways.">
          How these numbers work
        </CardTitle>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Definition term={PROTOTYPE_LABEL.tripBudget}>
            Your ceiling for the whole trip. You set it when planning the trip and can change it at any
            time.
          </Definition>
          <Definition term={PROTOTYPE_LABEL.aiDraftEstimate}>
            A projection from the itinerary, not a booking or a bill. It adds up the estimated cost of
            every planned stop.
          </Definition>
          <Definition term={PROTOTYPE_LABEL.actualSpent}>
            Expenses you have logged. This is the only settled figure on the page.
          </Definition>
          <Definition term={PROTOTYPE_LABEL.remaining}>
            Trip budget minus actual spent. It can go negative, which means you are over budget.
          </Definition>
        </dl>
        <Alert tone="prototype" title="Two rules that never bend" className="mt-4">
          {`The ${PROTOTYPE_LABEL.aiDraftEstimate} is never added to your actual spend: ${PROTOTYPE_LABEL.remaining} is worked out from logged expenses only. And no currency conversion happens anywhere in Tourist, so a trip is only ever tracked in its own currency.`}
        </Alert>
      </Card>

      <Alert
        tone="info"
        title={`All amounts are in ${currency} (${CURRENCY_SYMBOLS[currency]})`}
      >
        This prototype does not convert between currencies.
      </Alert>

      <Card>
        <CardTitle hint="Share of what you have already spent, largest share first.">
          Where the money went
        </CardTitle>
        {breakdown.length === 0 ? (
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
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-label-lg text-ink">{label}</span>
                      <span className="tnum text-body-md text-ink">
                        {formatMoney(row.total, currency)}
                      </span>
                    </div>
                    <ProgressBar
                      value={row.total}
                      max={budget.actualSpent}
                      label={`${label} share of logged spend`}
                      tone="actual"
                    />
                    <p className="tnum text-body-sm text-ink-subtle">
                      {`${share}% of ${formatMoney(budget.actualSpent, currency)} \u00b7 ${countLabel(
                        row.count,
                        'expense',
                        'expenses',
                      )}`}
                    </p>
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3 text-label-lg text-ink">
              <span>Total logged</span>
              <span className="tnum">{formatMoney(budget.actualSpent, currency)}</span>
            </p>
          </>
        )}
      </Card>

      <Card>
        <CardTitle
          hint={`${countLabel(expenses.length, 'expense', 'expenses')} logged, newest first.`}
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<Icon name="add" size={16} />}
              onClick={openAdd}
            >
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
            description="Logging real spending is what makes this budget useful. Until then the only figure with any weight is your own trip budget, and the itinerary estimate is just a projection."
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
                  className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-label-lg text-ink">{expense.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone="actual">{EXPENSE_CATEGORY_LABEL[expense.category]}</Badge>
                      <span className="tnum text-body-sm text-ink-subtle">
                        {formatShortDate(expense.date)}
                      </span>
                    </div>
                    {expense.notes ? (
                      <p className="mt-1 text-body-sm text-ink-muted">{expense.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="tnum mr-1 text-headline-sm text-ink">
                      {formatMoney(expense.amount, currency)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Icon name="edit" size={16} />}
                      onClick={() => setEditing(expense)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<Icon name="delete_outline" size={16} />}
                      onClick={() => setDeleting(expense)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3 text-label-lg text-ink">
              <span>{PROTOTYPE_LABEL.actualSpent}</span>
              <span className="tnum">{formatMoney(budget.actualSpent, currency)}</span>
            </p>
          </>
        )}
      </Card>

      <Card>
        <CardTitle
          hint={`${PROTOTYPE_LABEL.aiDraft} projections, one per day. They are never added to what you actually spend.`}
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
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <span className="text-body-md text-ink-muted">
                    <span className="tnum text-label-lg text-ink">{`Day ${day.index}`}</span>
                    <span className="tnum ml-2 text-body-sm text-ink-subtle">
                      {formatShortDate(day.date)}
                    </span>
                  </span>
                  <span className="tnum text-body-md text-ink">
                    {formatMoney(estimateTotal([day]), currency)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3 text-label-lg text-ink">
              <span>{PROTOTYPE_LABEL.aiDraftEstimate}</span>
              <span className="tnum">{formatMoney(budget.itineraryEstimate, currency)}</span>
            </p>
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
            <p className="text-body-md text-ink-muted">
              This entry will be permanently removed from this device:
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-label-lg text-ink">
              <Icon name="receipt_long" size={16} className="shrink-0 text-ink-subtle" />
              {deleting.description}
              <span className="tnum text-body-md text-ink-muted">
                {formatMoney(deleting.amount, currency)}
              </span>
            </p>
            <p className="tnum mt-2 text-body-sm text-ink-subtle">
              {`${formatDate(deleting.date)} \u00b7 ${EXPENSE_CATEGORY_LABEL[deleting.category]}`}
            </p>
            <p className="mt-3 text-body-sm text-ink-muted">
              {`${PROTOTYPE_LABEL.actualSpent} and ${PROTOTYPE_LABEL.remaining} are recalculated without it. The ${PROTOTYPE_LABEL.aiDraftEstimate} is never touched.`}
            </p>
          </>
        ) : null}
      </Dialog>
    </div>
  )
}
