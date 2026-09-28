import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { Icon, MediaFrame } from '@/components/ui/Icon'
import { EXPERIENCES } from '@/data/experiences'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist } from '@/state/useTourist'

const FEATURED = EXPERIENCES[0]

const STEPS = [
  {
    title: 'Tell us the trip',
    description: 'Where you are going, when, who is coming and what you enjoy doing.',
  },
  {
    title: 'Get a draft itinerary you can edit',
    description:
      'A first plan shaped by your dates, pace and interests. Every item can be moved, rewritten or replaced.',
  },
  {
    title: 'Track what you actually spend',
    description: 'Log expenses as you go and see them against the ceiling you set at the start.',
  },
] as const

const PRODUCT_AREAS = [
  {
    icon: 'luggage',
    name: 'Trips',
    description: 'Every journey you are planning, in one list.',
  },
  {
    icon: 'calendar_month',
    name: 'Itinerary',
    description: 'A day-by-day draft you can reorder freely.',
  },
  {
    icon: 'explore',
    name: 'Explore',
    description: 'A curated Paris catalog with honest, estimated prices.',
  },
  {
    icon: 'account_balance_wallet',
    name: 'Budget',
    description: 'Planned estimates kept separate from what you really spent.',
  },
] as const

export default function WelcomePage() {
  const navigate = useNavigate()
  const { state, actions } = useTourist()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const credit = FEATURED.imageCredit

  function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    setIsSaving(true)
    actions.signIn({ name: name.trim(), email: email.trim() || null })
    navigate('/trips')
  }

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <section className="flex flex-col gap-5">
        <p className="text-label-sm uppercase tracking-widest text-terracotta">
          Editorial field companion
        </p>
        <h1 className="max-w-3xl text-display">
          Plan the trip first. Then plan the days inside it.
        </h1>
        <p className="max-w-2xl text-body-lg text-ink-muted">
          Tourist turns a handful of honest answers into a first itinerary you can argue with, then keeps
          track of what the trip actually costs. Curated guides, drafted plans and your own spending, in
          one place.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink to="/trips/new" size="lg" icon={<Icon name="add_location_alt" size={20} />}>
            Plan a trip
          </ButtonLink>
          <ButtonLink to="/trips" size="lg" variant="secondary" icon={<Icon name="map" size={18} />}>
            Open the demo trip
          </ButtonLink>
        </div>
        <p className="text-body-sm text-ink-subtle">
          Nothing here books anything. Drafts, prices and estimates are labelled as such throughout.
        </p>
      </section>

      <figure className="flex flex-col gap-2">
        <MediaFrame
          src={FEATURED.imageUrl}
          alt={FEATURED.imageAlt}
          ratio="16 / 9"
          rounded="rounded-sheet"
        />
        <figcaption className="text-body-sm text-ink-subtle">
          {FEATURED.name}, {FEATURED.neighborhood}.{' '}
          {credit ? (
            <>
              Photo by{' '}
              <a
                href={credit.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-ink"
              >
                {credit.author}
              </a>{' '}
              ({credit.license}).
            </>
          ) : null}
        </figcaption>
      </figure>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-6">
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
              <span className="text-label-sm uppercase tracking-widest text-ink-subtle">or continue with</span>
              <span className="h-px flex-1 bg-line" />
            </div>

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
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle hint="Three steps, no account, and nothing leaves this device.">
              How it works
            </CardTitle>
            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="flex flex-col gap-2 rounded-card border border-line bg-surface-low p-4"
                >
                  <span className="tnum grid h-8 w-8 place-items-center rounded-badge bg-navy text-label-lg text-ink-inverse">
                    {index + 1}
                  </span>
                  <p className="text-label-lg text-ink">{step.title}</p>
                  <p className="text-body-sm text-ink-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card className="flex flex-col gap-4">
          <CardTitle hint="Four areas, all working in this prototype.">What you get</CardTitle>
          <ul className="flex flex-col gap-3">
            {PRODUCT_AREAS.map((area) => (
              <li key={area.name} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface-high text-navy">
                  <Icon name={area.icon} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-label-lg text-ink">{area.name}</p>
                  <p className="text-body-sm text-ink-muted">{area.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
