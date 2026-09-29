/**
 * The public address of the site, for the absolute URLs that link previews and
 * search engines need (canonical, og:url, og:image). Resolved at build time by
 * `vite.config.ts`, never at runtime.
 *
 * It used to be written into `index.html` by hand. When the Vercel project was
 * replaced, that domain stopped existing, and every shared link lost its
 * preview image and pointed search engines at a dead deployment.
 *
 * Order: an explicit `VITE_SITE_URL`, then Vercel's
 * `VERCEL_PROJECT_PRODUCTION_URL` (the project's current production domain,
 * the same for production and preview builds), then the known production
 * domain. A per-deployment URL such as `VERCEL_URL` is deliberately not used:
 * those sit behind Vercel's deployment protection and ask visitors to sign in
 * to Vercel.
 */
export const FALLBACK_SITE_URL = 'https://tourist-app-blush.vercel.app'

export function resolveSiteUrl(env: Readonly<Record<string, string | undefined>>): string {
  const candidate = [env.VITE_SITE_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .map((value) => value?.trim())
    .find((value) => value)
  if (!candidate) return FALLBACK_SITE_URL
  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`
  return withScheme.replace(/\/+$/, '')
}
