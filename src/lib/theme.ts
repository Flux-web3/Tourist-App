import type { ResolvedTheme, ThemePreference } from '@/domain/types'

export const THEME_STORAGE_KEY = 'tourist.theme'

export type { ResolvedTheme, ThemePreference }

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* storage unavailable: fall through to system */
  }
  return 'system'
}

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  return preference === 'system' ? (prefersDark() ? 'dark' : 'light') : preference
}

/** Writes the resolved theme to the document so CSS can react immediately. */
export function applyTheme(preference: ThemePreference): 'light' | 'dark' {
  const resolved = resolveTheme(preference)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.setAttribute('data-theme-preference', preference)
  }
  try {
    window.localStorage?.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    /* prototype: theme simply will not persist */
  }
  return resolved
}
