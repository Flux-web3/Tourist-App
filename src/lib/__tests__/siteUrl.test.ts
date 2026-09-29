import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FALLBACK_SITE_URL, resolveSiteUrl } from '@/lib/siteUrl'

const INDEX_HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

describe('resolveSiteUrl', () => {
  it("follows Vercel's current production domain, adding the scheme it leaves off", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'tourist-app-blush.vercel.app' })).toBe(
      'https://tourist-app-blush.vercel.app',
    )
  })

  it('lets an explicit VITE_SITE_URL win, without a trailing slash', () => {
    expect(
      resolveSiteUrl({
        VITE_SITE_URL: 'https://tourist.example.com/',
        VERCEL_PROJECT_PRODUCTION_URL: 'tourist-app-blush.vercel.app',
      }),
    ).toBe('https://tourist.example.com')
  })

  it('never uses the per-deployment URL, which asks visitors to sign in to Vercel', () => {
    expect(resolveSiteUrl({ VERCEL_URL: 'tourist-4q9qprncs-flux-build.vercel.app' })).toBe(
      FALLBACK_SITE_URL,
    )
  })

  it('falls back to the known production domain when nothing is set', () => {
    expect(resolveSiteUrl({})).toBe(FALLBACK_SITE_URL)
    expect(resolveSiteUrl({ VITE_SITE_URL: '  ', VERCEL_PROJECT_PRODUCTION_URL: '' })).toBe(
      FALLBACK_SITE_URL,
    )
  })
})

describe('index.html', () => {
  it('hard-codes no deployment domain; every self-link is filled in at build time', () => {
    // A hard-coded domain is what broke every link preview when the project moved.
    expect(INDEX_HTML).not.toMatch(/https?:\/\/[a-z0-9-]+\.vercel\.app/i)
    for (const tag of [
      /<link rel="canonical" href="%SITE_URL%\/"/,
      /<meta property="og:url" content="%SITE_URL%\/"/,
    ]) {
      expect(INDEX_HTML).toMatch(tag)
    }
    expect(INDEX_HTML.match(/%SITE_URL%\/social-card\.png/g)).toHaveLength(2)
  })
})
