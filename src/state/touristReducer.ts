import type { ThemePreference } from '@/domain/types'
import type { PersistedState } from '@/services/contracts'
import { createEmptyState } from '@/services/persistence'

export interface TouristState extends PersistedState {
  /** False until localStorage has been read, so the UI can avoid a flash. */
  hydrated: boolean
}

export type TouristAction =
  | { type: 'hydrate'; state: PersistedState }
  | { type: 'patch'; payload: Partial<PersistedState> }
  | { type: 'replace'; state: PersistedState }
  | { type: 'setTheme'; preference: ThemePreference }
  | { type: 'reset'; state: PersistedState }

export function createInitialTouristState(): TouristState {
  return { ...createEmptyState(), hydrated: false }
}

export function toPersistedState(state: TouristState): PersistedState {
  const { hydrated: _hydrated, ...persisted } = state
  return persisted
}

export function touristReducer(state: TouristState, action: TouristAction): TouristState {
  switch (action.type) {
    case 'hydrate':
      return { ...action.state, hydrated: true }
    case 'patch':
      return { ...state, ...action.payload }
    case 'replace':
      return { ...action.state, hydrated: true }
    case 'setTheme':
      return { ...state, themePreference: action.preference }
    case 'reset':
      return { ...action.state, hydrated: true }
    default:
      return state
  }
}
