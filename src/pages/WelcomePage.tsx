import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist } from '@/state/useTourist'

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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h1 className="max-w-2xl text-headline-lg">Let us name the trip, or skip it</h1>
        <p className="max-w-2xl text-body-lg text-ink-muted">
          A name is the only thing a profile does here. Give the trips on this device a name, or go
          straight in and start planning.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card className="flex flex-col gap-4">
          <CardTitle hint="This is a local prototype, so the only thing signing in does is give your trips a name.">
            Start with your name
          </CardTitle>

          <div className="flex flex-wrap gap-2">
            <Badge tone="catalog" icon={<Icon name="lock_open" size={14} />}>
              {PROTOTYPE_LABEL.noAccount}
            </Badge>
            <Badge tone="catalog" icon={<Icon name="smartphone" size={14} />}>
              {PROTOTYPE_LABEL.localOnly}
            </Badge>
          </div>

          {!state.user.isGuest ? (
            <p className="flex items-center gap-2 text-body-sm text-ink-muted">
              <Icon name="person" size={18} />
              Saved on this device as{' '}
              <span className="font-semibold text-ink">{state.user.name}</span>
            </p>
          ) : null}

          <form onSubmit={handleSignIn} noValidate className="flex flex-col gap-4">
            <TextField
              label="Your name"
              autoComplete="name"
              placeholder="e.g. Ada"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              hint="Optional. It is never sent anywhere, it just labels your local profile."
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
            <span className="text-label-sm uppercase tracking-widest text-ink-subtle">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="secondary"
              fullWidth
              loading={isLoadingDemo}
              loadingLabel="Loading the demo"
              icon={<Icon name="auto_stories" size={18} />}
              onClick={handleDemo}
            >
              Try the demo trip
            </Button>
            <ButtonLink
              to="/trips/new"
              variant="secondary"
              fullWidth
              icon={<Icon name="add_location_alt" size={18} />}
            >
              Plan a trip
            </ButtonLink>
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" disabled fullWidth>
                Continue with Google
              </Button>
              <Button variant="secondary" disabled fullWidth>
                Continue with Apple
              </Button>
            </div>
            <p className="text-body-sm text-ink-subtle">
              Not available in this prototype — nothing is sent anywhere.
            </p>
          </div>
        </Card>

        <Card as="aside" className="flex flex-col gap-3">
          <CardTitle>What happens next</CardTitle>
          <ol className="flex list-none flex-col gap-2">
            {[
              'You answer a short set of questions: destination, dates, travellers, interests, pace and a budget ceiling.',
              'Tourist drafts a day-by-day itinerary and prices every stop as an AI draft estimate.',
              'You reorder, rewrite or replace anything, then log what you really spend as you go.',
            ].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-badge bg-surface-high text-label-md text-navy">
                  {index + 1}
                </span>
                <p className="text-body-sm text-ink-muted">{step}</p>
              </li>
            ))}
          </ol>
          <p className="text-body-sm text-ink-subtle">
            Every figure is labelled by where it came from, so a draft never looks like a quote.
          </p>
        </Card>
      </div>
    </div>
  )
}
