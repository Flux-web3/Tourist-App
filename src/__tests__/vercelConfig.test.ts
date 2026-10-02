import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Header {
  key: string
  value: string
}

interface VercelConfig {
  rewrites: Array<{ source: string; destination: string }>
  headers: Array<{ source: string; headers: Header[] }>
}

const ROOT = process.cwd()
const CONFIG = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8')) as VercelConfig

/**
 * Vercel compiles a `source` with path-to-regexp. These sources are a slash
 * followed by one parenthesised regular expression, which path-to-regexp keeps
 * as written, so anchoring the source reproduces how it matches a path.
 */
function matches(source: string, path: string): boolean {
  return new RegExp(`^${source}$`, 'i').test(path)
}

function headersFor(path: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const rule of CONFIG.headers) {
    if (!matches(rule.source, path)) continue
    for (const header of rule.headers) found.set(header.key.toLowerCase(), header.value)
  }
  return found
}

describe('vercel.json rewrites', () => {
  const [rewrite] = CONFIG.rewrites
  const servesApp = (path: string) => matches(rewrite.source, path)

  it('has the one rewrite, to the app', () => {
    expect(CONFIG.rewrites).toHaveLength(1)
    expect(rewrite.destination).toBe('/index.html')
  })

  it.each([
    '/',
    '/welcome',
    '/trips',
    '/trips/new',
    '/trips/trip_abc123',
    '/trips/trip_abc123/itinerary',
    '/trips/trip_abc123/explore',
    '/trips/trip_abc123/budget',
    '/trips/trip_abc123/notes',
    '/explore',
    '/places/exp_eiffel_tower',
    '/a-page-that-does-not-exist',
    // A dot deeper than the root is still an app route, not a file.
    '/trips/trip.with.dots/budget',
  ])('serves the app for %s, so a deep link survives a refresh', (path) => {
    expect(servesApp(path)).toBe(true)
  })

  it.each([
    '/assets/index-abc123.js',
    '/assets/index-abc123.css',
    '/images/nope.jpg',
    '/images/paris/eiffel.webp',
    '/favicon.png',
    '/apple-touch-icon.png',
    '/logo-mark.png',
    '/social-card.png',
    '/favicon.ico',
    '/robots.txt',
  ])('does not answer %s with the app, so a missing file is a real 404', (path) => {
    expect(servesApp(path)).toBe(false)
  })

  it('leaves alone every file and folder that public/ puts at the site root', () => {
    for (const entry of readdirSync(resolve(ROOT, 'public'), { withFileTypes: true })) {
      const path = entry.isDirectory() ? `/${entry.name}/anything.jpg` : `/${entry.name}`
      expect(servesApp(path), `${path} would be answered with index.html when missing`).toBe(false)
    }
  })
})

describe('vercel.json headers', () => {
  it.each(['/', '/trips/trip_abc123/budget', '/assets/index-abc123.js', '/images/paris/eiffel.webp'])(
    'sends the security headers on %s',
    (path) => {
      const headers = headersFor(path)

      expect(headers.get('x-content-type-options')).toBe('nosniff')
      expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
      expect(headers.get('x-frame-options')).toBe('DENY')
    },
  )

  it('caches hashed build files for a year, and nothing else', () => {
    expect(headersFor('/assets/index-abc123.js').get('cache-control')).toBe('public, max-age=31536000, immutable')

    // These names are not hashed, so a long cache would pin an old copy.
    for (const path of ['/', '/index.html', '/trips', '/images/paris/eiffel.webp', '/favicon.png']) {
      expect(headersFor(path).has('cache-control')).toBe(false)
    }
  })

  it('does not set a Content-Security-Policy yet', () => {
    // The page has inline scripts; a policy needs its own careful pass.
    for (const rule of CONFIG.headers) {
      expect(rule.headers.map((header) => header.key.toLowerCase())).not.toContain('content-security-policy')
    }
  })
})
