import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { PhotoHero } from '@/components/ui/PhotoHero'
import { EXPERIENCES, EXPERIENCES_BY_ID, GUIDE_CITY_LIST } from '@/data/experiences'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist } from '@/state/useTourist'

// The hero pairs with the sample trip below (Lagos to Paris), so it is that
// trip's destination, by id rather than by catalogue position.
const FEATURED = EXPERIENCES_BY_ID.get('exp_eiffel_tower') ?? EXPERIENCES[0]

const STEPS = [
  {
    title: 'Answer a few questions',
    description:
      'Where you are going, when, who is coming, what you enjoy, and your budget limit.',
  },
  {
    title: 'Argue with the draft',
    description:
      'Tourist drafts a day-by-day plan and prices every stop. Move it, rewrite it, or remove what doesn’t fit.',
  },
  {
    title: 'Keep the trip honest',
    description:
      'Log what you really pay as you go, and keep the details you need right in your trip notes.',
  },
] as const

const AREAS = [
  {
    icon: 'calendar_month',
    name: 'Itinerary',
    description:
      'A day-by-day draft you can reorder, rewrite or replace. Regenerating never discards your own edits.',
  },
  {
    icon: 'account_balance_wallet',
    name: 'Budget',
    description:
      'Your ceiling, the draft estimate and what you actually spent, kept as three separate figures.',
  },
  {
    icon: 'explore',
    name: 'Explore',
    description: `Curated guides for ${GUIDE_CITY_LIST} you can drop into any day, with every price marked as an estimate.`,
  },
  {
    icon: 'sticky_note_2',
    name: 'Trip Notes',
    description:
      'Your own record: flight references, key codes, bookings. Pinned, editable, and never regenerated.',
  },
  {
    icon: 'luggage',
    name: 'Trips',
    description: 'Every journey you are planning, in one list, on this device.',
  },
] as const

const DEMO_FACTS = [
  { term: 'Route', value: 'Lagos, Nigeria to Paris, France' },
  { term: 'Length', value: '7 days' },
  { term: 'Travellers', value: '2' },
  { term: 'Pace', value: 'Balanced' },
  { term: 'Trip Budget', value: '€2,500' },
] as const

const NOT_ABILITIES = [
  'It does not book anything, hold a seat or take a payment.',
  'Prices and itineraries are estimates, not quotes. Nothing here is a live fare.',
  'There is no account and no server. Everything stays in this browser.',
  `The Explore catalog is a small, fixed set of places in ${GUIDE_CITY_LIST}, not a live listing. Other destinations have no places yet.`,
  'It does not convert between currencies.',
] as const

const NAV_LINKS = [
  { to: '/welcome', label: 'Start planning', icon: 'add_location_alt' },
  { to: '/trips', label: 'Your trips', icon: 'luggage' },
  { to: '/explore', label: 'Explore catalog', icon: 'explore' },
] as const

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
        // A square 44px hamburger, the control phones have taught everyone to
        // look for. The word stays for screen readers; aria-expanded says open.
        className="w-11 px-0"
        icon={<Icon name={open ? 'close' : 'menu'} size={22} />}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span className="sr-only">Menu</span>
      </Button>

      <div
        id="landing-menu"
        ref={panelRef}
        hidden={!open}
        className="absolute inset-x-3 top-full z-40 rounded-card border border-line bg-canvas px-2 py-2 shadow-overlay"
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

      {/*
        The header rides on the photograph, as the hero's own top edge. It is
        in the on-photo scope, so the brand, links and theme control turn white
        without any landing-only styling.
      */}
      <header className="on-photo absolute inset-x-0 top-0 z-30">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
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
            <ThemeToggle />
            <LandingMenu />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {/*
          The first screen is the photograph with the promise set on it. On a
          phone the picture is anchored to the foot of the hero and fades up
          into the night sky, so the tower stands clear of the words; on a wide
          screen it fills the hero and the words keep to the left.
        */}
        <PhotoHero
          src={FEATURED.imageUrl}
          // The same photograph at twice the width, for screens wide enough to show it.
          srcSet="/images/eiffel-tower.jpg 960w, /images/eiffel-tower-wide.jpg 1920w"
          alt={FEATURED.imageAlt}
          className="flex min-h-[max(100svh,46rem)] flex-col lg:min-h-[min(100svh,50rem)]"
          imageClassName="photo-fade-top inset-x-0 bottom-0 h-[62%] w-full object-[30%_100%] lg:inset-0 lg:h-full lg:origin-left lg:scale-[1.3] lg:object-center"
          credit={
            <span className="flex items-start gap-1.5">
              <Icon name="location_on" size={16} className="mt-px shrink-0" />
              <span>
                {FEATURED.name}, {FEATURED.neighborhood}.{' '}
                {credit ? (
                  <>
                    Photo by{' '}
                    <a
                      href={credit.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      {credit.author}
                    </a>{' '}
                    ({credit.license}).
                  </>
                ) : null}
              </span>
            </span>
          }
        >
          <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 pb-28 pt-24 sm:px-6 lg:pt-36">
            <p className="eyebrow">AI travel companion</p>
            <h1 className="max-w-[44rem] text-hero">
              <span className="block">Plan the trip first.</span>{' '}
              <span className="block">Then plan the days</span>{' '}
              <span className="block">inside it.</span>
            </h1>
            <p className="max-w-md text-body-lg text-ink-muted lg:max-w-lg">
              Answer a handful of honest questions and Tourist drafts a day-by-day itinerary you can
              argue with — then keeps track of what the trip actually costs.
            </p>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <ButtonLink
                to="/welcome"
                size="lg"
                icon={<Icon name="auto_awesome" size={20} />}
                iconAfter={<Icon name="arrow_forward" size={20} />}
              >
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
            <div className="photo-note flex w-fit max-w-xs flex-col gap-1.5 sm:max-w-md">
              <p className="text-body-sm text-ink-subtle">
                No account, no email. Drafts, prices and estimates are labelled as such throughout.
              </p>
              {returningTraveller ? (
                <p className="text-body-sm text-ink-muted">
                You already have {state.trips.length === 1 ? 'a trip' : `${state.trips.length} trips`}{' '}
                on this device.{' '}
                <Link to="/trips" className="font-semibold underline underline-offset-2">
                  Open your trips
                </Link>
                .
                </p>
              ) : null}
            </div>
          </section>
        </PhotoHero>

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 py-12 sm:px-6 md:gap-20 md:py-16">
          <section aria-labelledby="steps-heading" className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="eyebrow">Three steps</p>
              <h2 id="steps-heading" className="text-headline-lg">
                How it works
              </h2>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="surface-card flex flex-col gap-2 p-5"
                >
                  <span className="tnum grid h-9 w-9 place-items-center rounded-pill border border-gold-border bg-gold-bg text-label-lg text-gold-ink">
                    {index + 1}
                  </span>
                  <h3 className="mt-1 text-headline-sm">{step.title}</h3>
                  <p className="text-body-sm text-ink-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="areas-heading" className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="eyebrow">Inside every trip</p>
              <h2 id="areas-heading" className="text-headline-lg">
                What you get
              </h2>
            </div>
            {/* `li` wrappers: a Card renders an <article>, which is not a legal child of <ul>. */}
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {AREAS.map((area) => (
                <li key={area.name} className="contents">
                  <Card as="article" className="flex flex-col gap-2">
                    <span className="grid h-10 w-10 place-items-center rounded-control bg-navy text-btn-primary-fg">
                      <Icon name={area.icon} size={20} />
                    </span>
                    <h3 className="mt-1 text-headline-sm">{area.name}</h3>
                    <p className="text-body-sm text-ink-muted">{area.description}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="demo-heading" className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-4">
              <div>
                <h2 id="demo-heading" className="text-headline-sm">
                  The demo is a real trip
                </h2>
                <p className="mt-1 text-body-sm text-ink-subtle">
                  The same code path a real trip uses, with sample data already in it. It is added
                  alongside anything you already have and never overwrites your own trips.
                </p>
              </div>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {DEMO_FACTS.map((fact) => (
                  <div key={fact.term} className="flex flex-col gap-0.5">
                    <dt className="text-label-sm uppercase tracking-wider text-ink-subtle">
                      {fact.term}
                    </dt>
                    <dd className="tnum text-body-md text-ink">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="catalog" icon={<Icon name="lock_open" size={14} />}>
                  {PROTOTYPE_LABEL.noAccount}
                </Badge>
                <Badge tone="catalog" icon={<Icon name="smartphone" size={14} />}>
                  {PROTOTYPE_LABEL.localOnly}
                </Badge>
              </div>
              <div>
                <Button
                  variant="secondary"
                  icon={<Icon name="auto_stories" size={18} />}
                  loading={loadingDemo}
                  loadingLabel="Loading the demo"
                  onClick={startDemo}
                >
                  Try the demo
                </Button>
              </div>
            </Card>

            {/*
              Kept as a plain, visible list rather than folded away. On the
              product screens this kind of copy was crowding out the trip and
              has moved into disclosures, but on the front door being straight
              about the limits is the pitch, not an interruption.
            */}
            <Card as="aside" aria-labelledby="honesty-heading" className="flex flex-col gap-3">
              <h2 id="honesty-heading" className="text-headline-sm">
                What Tourist does not do
              </h2>
              <ul className="flex list-none flex-col gap-2">
                {NOT_ABILITIES.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-body-sm text-ink-muted">
                    <Icon name="remove" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="text-body-sm text-ink-subtle">
                Every figure in the app says where it came from: your own budget, a draft estimate, a
                curated guide, or an expense you logged yourself.
              </p>
            </Card>
          </section>

          {/* The closing band is the same night ground as the hero, without a photo. */}
          <section
            aria-labelledby="start-heading"
            className="on-photo photo-hero flex flex-col gap-4 rounded-sheet p-6 sm:p-10"
          >
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
