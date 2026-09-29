import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolveSiteUrl } from './src/lib/siteUrl'

/** Fills `%SITE_URL%` in index.html; see `src/lib/siteUrl.ts` for why. */
function siteUrl(): Plugin {
  const url = resolveSiteUrl(process.env)
  return {
    name: 'tourist-site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrl()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    restoreMocks: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 4,
  },
})
