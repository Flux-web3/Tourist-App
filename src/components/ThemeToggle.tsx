import type { ThemePreference } from '@/domain/types'
import { SegmentedControl } from './ui/SegmentedControl'
import { useTheme } from '@/state/useTourist'

const OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: 'light_mode' },
  { value: 'dark' as const, label: 'Dark', icon: 'dark_mode' },
  { value: 'system' as const, label: 'System', icon: 'contrast' },
]

export function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  return (
    <SegmentedControl<ThemePreference>
      label="Colour theme"
      size="sm"
      value={preference}
      onChange={setPreference}
      options={OPTIONS}
    />
  )
}
