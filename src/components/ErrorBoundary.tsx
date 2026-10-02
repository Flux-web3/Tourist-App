import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { buttonClasses } from '@/lib/buttonStyles'

interface ErrorBoundaryProps {
  children: ReactNode
  /**
   * When this changes while the fallback is showing, the boundary tries its
   * children again. `RouteErrorBoundary` passes the current path, so leaving a
   * broken page is enough to recover from it.
   */
  resetKey?: string
  /**
   * True where a router and the app shell are already around the boundary.
   * The fallback then sits inside the shell's own main region and "Back to
   * trips" is an in-app link. Without it (the last-resort boundary around the
   * whole app, where the router itself may be what failed) the fallback is a
   * page of its own and the link is an ordinary one that loads `/trips` fresh.
   */
  inShell?: boolean
  /** Replaces the full page reload. For tests. */
  onReload?: () => void
}

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * Catches an error thrown while rendering and shows a calm screen in its
 * place. Without one, React unmounts everything and the traveller is left
 * looking at a blank page with no way back.
 *
 * What went wrong is never shown: a stack trace helps nobody plan a trip. It
 * is logged to the console in development only.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(error, info.componentStack)
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.reset()
  }

  reset = () => this.setState({ failed: false })

  reload = () => {
    if (this.props.onReload) this.props.onReload()
    else window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children

    const backClass = buttonClasses({ variant: 'secondary' })
    const fallback = (
      <div role="alert">
        <EmptyState
          icon="error"
          headingLevel={1}
          title="Something went wrong on this page"
          description="Your saved trips are untouched. Reload the page to try again, or go back to your trips."
          action={
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={<Icon name="refresh" size={18} />} onClick={this.reload}>
                Reload
              </Button>
              {this.props.inShell ? (
                // Already on /trips, the path would not change, so the link resets the boundary itself.
                <Link to="/trips" className={backClass} onClick={this.reset}>
                  Back to trips
                </Link>
              ) : (
                <a href="/trips" className={backClass}>
                  Back to trips
                </a>
              )}
            </div>
          }
        />
      </div>
    )

    if (this.props.inShell) return fallback
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-6">
        <div className="w-full max-w-xl">{fallback}</div>
      </main>
    )
  }
}

/**
 * The boundary around routed pages. It sits inside the app shell, so the
 * header and navigation stay usable, and it clears as soon as the traveller
 * moves to another page.
 */
export function RouteErrorBoundary({ children, inShell = true }: { children: ReactNode; inShell?: boolean }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname} inShell={inShell}>
      {children}
    </ErrorBoundary>
  )
}
