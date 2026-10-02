import { useState } from 'react'

/** How many times a photo is requested before its frame gives up on it. */
export const MAX_IMAGE_ATTEMPTS = 2

export interface ImageAttempts {
  /** Remounts the <img> on every retry, which is what makes the browser ask again. */
  key: string
  /** True once the photo has failed as often as it is allowed to. */
  gaveUp: boolean
  onError: () => void
}

/**
 * Tracks failed loads for one photo, tied to the `src` they happened to.
 *
 * A different photo always starts clean, including one the frame gave up on
 * earlier: coming back to a place is a fresh chance for its photo to load. A
 * failed photo is requested once more before the caller is told to show its
 * fallback, so one dropped request on a phone does not cost the picture.
 */
export function useImageAttempts(src: string | null): ImageAttempts {
  const [load, setLoad] = useState({ src, attempts: 0 })
  if (load.src !== src) setLoad({ src, attempts: 0 })
  const attempts = load.src === src ? load.attempts : 0

  return {
    key: `${src ?? ''}#${attempts}`,
    gaveUp: attempts >= MAX_IMAGE_ATTEMPTS,
    onError: () => setLoad({ src, attempts: attempts + 1 }),
  }
}
