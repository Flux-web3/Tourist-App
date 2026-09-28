import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle } from '@/components/ui/Card'
import { Icon, MediaFrame } from '@/components/ui/Icon'
import { EXPERIENCES } from '@/data/experiences'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist } from '@/state/useTourist'

const FEATURED = EXPERIENCES[0]

const AREAS = [
  {
    icon: 'luggage',
    name: 'Trips',
    description: 'Every journey you are planning, in one list, on this device.',
  },
  {
    icon: 'calendar_month',
    name: 'Itinerary',
    description:
      'A day-by-day draft you can reorder, rewrite or replace. Regenerating never discards your own edits.',
  },
  {
    icon: 'explore',
    name: 'Explore',
    description: 'A curated Paris catalog with every price labelled as an estimate.',
  },
  {
    icon: 'account_balance_wallet',
    name: 'Budget',
    description:
      'Your own ceiling, an AI draft estimate and what you actually spent, kept as three separate figures.',
  },
  {
    icon: 'sticky_note_2',
    name: 'Trip Notes',
    description:
      'Your own record: flight references, key codes, bookings. Pinned, editable, and never regenerated.',
  },
] as const

const STEPS = [
  {
    title: 'Answer a few questions',
    description: 'Where you are going, when, who is coming, what you enjoy and the ceiling you will accept.',
  },
  {
    title: 'Argue with the draft',
    description:
      'Tourist drafts a day-by-day plan and prices every stop. Move it, rewrite it or throw a stop away.',
  },
  {
    title: 'Keep the trip honest',
    description:
      'Log what you really pay as you go, and keep the details you need on the day in your trip notes.',
  },
] as const

const DEMO_FACTS = [
  { term: 'Route', value: 'Lagos, Nigeria to Paris, France' },
  { term: 'Length', value: '7 days' },
  { term: 'Travellers', value: '2' },
  { term: 'Pace', value: 'Balanced' },
  { term: 'Trip Budget', value: '€2,500' },
  { term: 'Already includes', value: 'A drafted itinerary, logged expenses and trip notes' },
] as const

const NOT_ABILITIES = [
  'It does not book anything, hold a seat or take a payment.',
  'Prices and itineraries are estimates, not quotes. Nothing here is a live fare.',
  'There is no account and no server. Everything stays in this browser.',
  'The Explore catalog is a fixed set of Paris places, not a live listing.',
  'It does not convert between currencies.',
] as const

const NAV_LINKS = [
  { to: '/welcome', label: 'Start planning', icon: 'add_location_alt' },
  { to: '/trips', label: 'Your trips', icon: 'luggage' },
  { to: '/explore', label: 'Explore catalog', icon: 'explore' },
] as const

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-control" aria-label="Tourist, home">
      <span className="grid h-9 w-9 place-items-center rounded-control bg-navy text-btn-primary-fg">
        <Icon name="travel_explore" size={20} />
      </span>
      <span className="text-headline-sm">Tourist</span>
    </Link>
  )
}

function LandingMenu() {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) toggleRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    panel?.querySelector<HTMLElement>('a[href]')?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  return (
    <div className="md:hidden">
      <Button
        ref={toggleRef}
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls="landing-menu"
        icon={<Icon name={open ? 'close' : 'travel_explore'} size={18} />}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        Menu
      </Button>

      <div
        id="landing-menu"
        ref={panelRef}
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-b border-line bg-canvas px-4 py-3 shadow-raised"
      >
        <nav aria-label="Landing" className="flex flex-col">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => close(false)}
              className="flex min-h-14 items-center gap-2 rounded-control px-3 py-2 text-label-lg text-ink transition-colors hover:bg-surface-low"
            >
              <Icon name={link.icon} size={18} className="text-ink-subtle" />
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { state, actions } = useTourist()
  const [loadingDemo, setLoadingDemo] = useState(false)
  const credit = FEATURED.imageCredit

  const startDemo = () => {
    if (loadingDemo) return
    setLoadingDemo(true)
    actions.loadDemoData()
    navigate('/trips')
  }

  const returningTraveller = !state.user.isGuest || state.trips.length > 0

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a href="#main-content" className="skip-link text-label-lg">
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Brand />
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-control px-3 py-2 text-label-lg text-ink-muted transition-colors hover:bg-surface-low hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <LandingMenu />
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:py-12">
        <div className="flex flex-col gap-10 md:gap-14">
          <section className="flex flex-col gap-5">
            <p className="text-label-sm uppercase tracking-widest text-terracotta">
              Editorial field companion
            </p>
            <h1 className="max-w-3xl text-display">
              Plan the trip first. Then plan the days inside it.
            </h1>
            <p className="max-w-2xl text-body-lg text-ink-muted">
              Tourist turns a handful of honest answers into a first itinerary you can argue with, then
              keeps track of what the trip actually costs. Curated guides, drafted plans, your own spending
              and your own notes, in one place.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink to="/welcome" size="lg" icon={<Icon name="add_location_alt" size={20} />}>
                Plan your trip
              </ButtonLink>
              <Button
                size="lg"
                variant="secondary"
                loading={loadingDemo}
                loadingLabel="Loading the demo"
                icon={<Icon name="auto_stories" size={20} />}
                onClick={startDemo}
              >
                Try the demo
              </Button>
            </div>
            <p className="text-body-sm text-ink-subtle">
              Nothing here books anything. Drafts, prices and estimates are labelled as such throughout.
            </p>
            {returningTraveller ? (
              <p className="text-body-sm text-ink-muted">
                You already have {state.trips.length === 1 ? 'a trip' : `${state.trips.length} trips`} on
                this device.{' '}
                <Link to="/trips" className="underline underline-offset-2 hover:text-ink">
                  Open your trips
                </Link>
                .
              </p>
            ) : null}
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

          <section aria-labelledby="areas-heading" className="flex flex-col gap-5">
            <h2 id="areas-heading" className="text-headline-lg">
              What you get
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {AREAS.map((area) => (
                <Card as="article" key={area.name} className="flex flex-col gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-control bg-surface-high text-navy">
                    <Icon name={area.icon} size={18} />
                  </span>
                  <h3 className="text-label-lg text-ink">{area.name}</h3>
                  <p className="text-body-sm text-ink-muted">{area.description}</p>
                </Card>
              ))}
            </ul>
          </section>

          <section aria-labelledby="steps-heading" className="flex flex-col gap-5">
            <h2 id="steps-heading" className="text-headline-lg">
              How it works
            </h2>
            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="flex flex-col gap-2 rounded-card border border-line bg-surface-low p-4"
                >
                  <span className="tnum grid h-8 w-8 place-items-center rounded-badge bg-navy text-label-lg text-ink-inverse">
                    {index + 1}
                  </span>
                  <h3 className="text-label-lg text-ink">{step.title}</h3>
                  <p className="text-body-sm text-ink-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="demo-heading" className="flex flex-col gap-4">
            <Card className="flex flex-col gap-4">
              <CardTitle
                id="demo-heading"
                hint="The demo is the same code path a real trip uses, with sample data already in it."
                action={
                  <Button
                    variant="secondary"
                    icon={<Icon name="auto_stories" size={18} />}
                    loading={loadingDemo}
                    loadingLabel="Loading the demo"
                    onClick={startDemo}
                  >
                    Try the demo
                  </Button>
                }
              >
                The demo is a real trip
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="catalog" icon={<Icon name="auto_awesome" size={14} />}>
                  Drafted itinerary
                </Badge>
                <Badge tone="catalog" icon={<Icon name="lock_open" size={14} />}>
                  {PROTOTYPE_LABEL.noAccount}
                </Badge>
                <Badge tone="catalog" icon={<Icon name="smartphone" size={14} />}>
                  {PROTOTYPE_LABEL.localOnly}
                </Badge>
              </div>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {DEMO_FACTS.map((fact) => (
                  <div key={fact.term} className="flex flex-col gap-0.5">
                    <dt className="text-label-sm uppercase tracking-wider text-ink-subtle">
                      {fact.term}
                    </dt>
                    <dd className="text-body-md text-ink">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-body-sm text-ink-subtle">
                The demo adds a sample trip alongside anything you already have. It does not sign you in and
                it does not overwrite your own trips.
              </p>
            </Card>
          </section>

          <section aria-labelledby="honesty-heading" className="flex flex-col gap-4">
            <h2 id="honesty-heading" className="text-headline-lg">
              What this prototype will not tell you
            </h2>
            <Card as="aside" className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-label-lg text-ink">
                <Icon name="science" size={18} className="text-ink-subtle" />
                Read this before you rely on a number
              </p>
              <ul className="flex list-none flex-col gap-2">
                {NOT_ABILITIES.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-body-sm text-ink-muted">
                    <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="text-body-sm text-ink-subtle">
                Every figure in the app is labelled by where it came from: your own budget, an AI draft, a
                curated guide, the catalog demo, or an expense you logged yourself.
              </p>
            </Card>
          </section>

          <section aria-labelledby="start-heading" className="flex flex-col gap-4 rounded-card border border-line-strong bg-surface-low p-6 sm:p-8">
            <h2 id="start-heading" className="text-headline-lg">
              Start with the trip, not the app
            </h2>
            <p className="max-w-2xl text-body-md text-ink-muted">
              No account, no email, no onboarding tour. Answer a few questions and you have a draft
              itinerary you can argue with.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink to="/welcome" size="lg" icon={<Icon name="arrow_forward" size={20} />}>
                Plan your trip
              </ButtonLink>
              <ButtonLink to="/trips" size="lg" variant="secondary" icon={<Icon name="luggage" size={18} />}>
                Open your trips
              </ButtonLink>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-line px-4 py-6 text-body-sm text-ink-subtle">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>Tourist prototype. Trips, plans, expenses and notes stay on this device.</p>
          <p className="tnum">Itinerary drafts and prices are estimates, not bookings.</p>
        </div>
      </footer>
    </div>
  )
}
