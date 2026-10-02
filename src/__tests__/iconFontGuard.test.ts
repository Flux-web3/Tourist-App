import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANDING_TITLE } from '@/lib/pageTitle'

/*
  The inline script in index.html that keeps icons hidden until the icon font
  can draw them. It is run here exactly as written, against a stand-in for
  `document.fonts`, because the one thing it must never do again is reveal the
  icons when the font FAILED to load: every icon then renders as its own name
  in words ("account_balance_wallet") inside the buttons.
*/

const INDEX_HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const FAMILY = 'Material Symbols Outlined'

function guardScript(): string {
  const scripts = [...INDEX_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])
  const guard = scripts.find((code) => code.includes('symbols-ready'))
  if (!guard) throw new Error('index.html has no icon font guard script')
  return guard
}

interface Face {
  family: string
  status: 'unloaded' | 'loading' | 'loaded' | 'error'
}

/** Just enough of a FontFaceSet: the faces the page knows, and when loading settles. */
function fakeFonts(options: { faces?: Face[]; check?: boolean }) {
  const faces = options.faces ?? []
  const listeners = new Set<() => void>()
  let settleLoad: { resolve: (faces: Face[]) => void; reject: (reason: Error) => void } | null = null
  const loaded = new Promise<Face[]>((resolvePromise, reject) => {
    settleLoad = { resolve: resolvePromise, reject }
  })
  return {
    faces,
    listeners,
    api: {
      load: () => loaded,
      // Chrome answers true when no @font-face matches at all: "nothing to load".
      check: () => options.check ?? true,
      forEach: (callback: (face: Face) => void) => faces.forEach(callback),
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'loadingdone') listeners.add(listener)
      },
      removeEventListener: (type: string, listener: () => void) => {
        if (type === 'loadingdone') listeners.delete(listener)
      },
    },
    async finishLoad(outcome: 'resolve' | 'reject') {
      if (outcome === 'resolve') settleLoad?.resolve(faces.filter((face) => face.status === 'loaded'))
      else settleLoad?.reject(new Error('NetworkError'))
      await loaded.catch(() => undefined)
      await Promise.resolve()
    },
    loadingDone() {
      for (const listener of [...listeners]) listener()
    },
  }
}

function runGuard(fonts: unknown): HTMLElement {
  const root = document.createElement('html')
  new Function('document', guardScript())({ documentElement: root, fonts })
  return root
}

const isRevealed = (root: HTMLElement) => root.classList.contains('symbols-ready')

describe('the icon font guard in index.html', () => {
  it('reveals icons straight away where there is no Font Loading API', () => {
    expect(isRevealed(runGuard(undefined))).toBe(true)
  })

  it('keeps icons hidden while the font is still loading', () => {
    const fonts = fakeFonts({ faces: [{ family: FAMILY, status: 'loading' }] })

    expect(isRevealed(runGuard(fonts.api))).toBe(false)
  })

  it('reveals icons once the font has loaded', async () => {
    const fonts = fakeFonts({ faces: [{ family: `"${FAMILY}"`, status: 'loading' }] })
    const root = runGuard(fonts.api)

    fonts.faces[0].status = 'loaded'
    await fonts.finishLoad('resolve')

    expect(isRevealed(root)).toBe(true)
    // Nothing left to wait for.
    expect(fonts.listeners.size).toBe(0)
  })

  it('keeps icons hidden when the font file fails to load', async () => {
    const fonts = fakeFonts({ faces: [{ family: FAMILY, status: 'loading' }], check: false })
    const root = runGuard(fonts.api)

    fonts.faces[0].status = 'error'
    await fonts.finishLoad('reject')

    expect(isRevealed(root)).toBe(false)
  })

  it('keeps icons hidden when the font stylesheet never arrived, whatever check() says', async () => {
    // Fonts blocked outright: no @font-face for the family exists, the load
    // settles with nothing, and check() still says true.
    const fonts = fakeFonts({ faces: [{ family: 'Plus Jakarta Sans', status: 'loaded' }], check: true })
    const root = runGuard(fonts.api)

    await fonts.finishLoad('resolve')

    expect(isRevealed(root)).toBe(false)
  })

  it('reveals icons when the font arrives late, after an earlier failure', async () => {
    const fonts = fakeFonts({ faces: [] })
    const root = runGuard(fonts.api)
    await fonts.finishLoad('reject')
    expect(isRevealed(root)).toBe(false)

    fonts.faces.push({ family: FAMILY, status: 'loaded' })
    fonts.loadingDone()

    expect(isRevealed(root)).toBe(true)
  })

  it('ignores a later loadingdone that is about some other font', async () => {
    const fonts = fakeFonts({ faces: [] })
    const root = runGuard(fonts.api)
    await fonts.finishLoad('reject')

    fonts.faces.push({ family: 'Plus Jakarta Sans', status: 'loaded' })
    fonts.loadingDone()

    expect(isRevealed(root)).toBe(false)
  })
})

describe('index.html', () => {
  it('carries the landing title the app restores on the landing page', () => {
    expect(INDEX_HTML).toContain(`<title>${LANDING_TITLE}</title>`)
  })
})
