import { Link } from 'react-router-dom'

/**
 * The Tourist mark and wordmark, shared by the landing page and the app shell
 * so the two can never drift apart.
 *
 * The mark is the pin-and-plane logo, kept as a shape and coloured by the
 * design system: gold on a night tile in the app, reversed to night on a white
 * tile over a photograph. It is decorative: the link is named by its label, so
 * a screen reader hears "Tourist, home" once.
 */
export function Brand() {
  return (
    // The logo goes home to the landing page from everywhere, the landing page
    // included. Trips stays one tap away in the primary nav and the tab bar.
    <Link to="/" className="flex items-center gap-2.5 rounded-control" aria-label="Tourist, home">
      <span className="brand-tile grid h-9 w-9 shrink-0 place-items-center rounded-control">
        <span aria-hidden="true" className="brand-mark h-7 w-7" />
      </span>
      <span className="text-headline-sm text-ink">Tourist</span>
    </Link>
  )
}
