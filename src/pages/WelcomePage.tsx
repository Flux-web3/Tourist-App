import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, PageHeader } from '@/components/ui/Card'
import { Disclosure } from '@/components/ui/Disclosure'
import { TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist } from '@/state/useTourist'

const NEXT_STEPS = [
  'You answer a short set of questions: destination, dates, travellers, interests, pace and a budget ceiling.',
  'Tourist drafts a day-by-day itinerary and prices every stop as an AI draft estimate.',
  'You reorder, rewrite or replace anything, then log what you really spend as you go.',
] as const

/**
 * This screen sits between the landing page and an app that now genuinely
 * starts empty, and the only thing it can actually do is put a name on the
 * trips already stored in this browser. So it is deliberately thin: one
 * optional field, the two real ways in, and the standing claims folded into
 * disclosures rather than a column of cards and dead sign-in buttons.
 */
export default function WelcomePage() {
  const navigate = useNavigate()
  const { state, actions } = useTourist()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingDemo, setIsLoadingDemo] = useState(false)

  function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    setIsSaving(true)
    actions.signIn({ name: name.trim(), email: email.trim() || null })
    navigate('/trips')
  }

  function handleDemo() {
    if (isLoadingDemo) return
    setIsLoadingDemo(true)
    actions.loadDemoData()
    navigate('/trips')
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <PageHeader
        title="Name your trips, or skip"
        description="A name is the only thing a profile does here. Add one, or go straight to planning."
      />

      <Card className="flex flex-col gap-4">
        {!state.user.isGuest ? (
          <p className="flex flex-wrap items-center gap-1.5 text-body-sm text-ink-muted">
            <Icon name="person" size={18} className="text-ink-subtle" />
            Saved on this device as <span className="font-semibold text-ink">{state.user.name}</span>
          </p>
        ) : null}

        <form onSubmit={handleSignIn} noValidate className="flex flex-col gap-3">
          <TextField
            label="Your name"
            autoComplete="name"
            placeholder="e.g. Ada"
            hint="Optional."
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            hint="Optional. It is never sent anywhere, it only labels this device."
            placeholder="e.g. ada@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={isSaving}
            loadingLabel="Saving on this device"
            iconAfter={<Icon name="arrow_forward" size={18} />}
          >
            Save and continue
          </Button>
        </form>

        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-label-sm font-bold uppercase tracking-widest text-ink-subtle">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ButtonLink
            to="/trips/new"
            variant="secondary"
            fullWidth
            icon={<Icon name="add_location_alt" size={18} />}
          >
            Plan a trip
          </ButtonLink>
          <Button
            variant="secondary"
            fullWidth
            loading={isLoadingDemo}
            loadingLabel="Loading the demo"
            icon={<Icon name="science" size={18} />}
            onClick={handleDemo}
          >
            Try the demo trip
          </Button>
        </div>
      </Card>

      <Disclosure tone="catalog" icon="smartphone" summary={PROTOTYPE_LABEL.localOnly}>
        <p>
          {`${PROTOTYPE_LABEL.noAccount}. There is no sign-up and no server: your name, trips, itinerary drafts and expenses stay in this browser's storage. Google and Apple sign-in are not part of this prototype.`}
        </p>
        <p className="mt-2">The demo trip is clearly marked as sample data once it is in your list.</p>
      </Disclosure>

      <Disclosure icon="route" summary="What happens next">
        <ol className="flex list-none flex-col gap-2">
          {NEXT_STEPS.map((step, index) => (
            <li key={step} className="flex gap-2.5">
              <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-pill border border-gold-border bg-gold-bg text-label-md text-gold-ink">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2">
          Every figure is labelled by where it came from, so a draft never looks like a quote.
        </p>
      </Disclosure>
    </div>
  )
}
