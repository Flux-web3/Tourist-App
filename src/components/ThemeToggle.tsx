import type { ThemePreference } from '@/domain/types'
import { Icon } from './ui/Icon'
import { SegmentedControl } from './ui/SegmentedControl'
import { useTheme } from '@/state/useTourist'

const OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: 'light_mode' },
  { value: 'dark' as const, label: 'Dark', icon: 'dark_mode' },
  { value: 'system' as const, label: 'System', icon: 'contrast' },
]

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

const ICON: Record<ThemePreference, string> = {
  light: 'light_mode',
  dark: 'dark_mode',
  system: 'contrast',
}

const NAME: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

/**
 * Colour theme control.
 *
 * The three-way segmented control needs more width than a phone header has, so
 * below `sm` this collapses to a single button that cycles light, dark, system.
 * It used to be hidden outright on small screens, which left the theme
 * unreachable on exactly the devices the product is designed for first.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme()

  return (
    <>
      <button
        type="button"
        onClick={() => setPreference(NEXT[preference])}
        className="grid h-11 w-11 place-items-center rounded-control text-ink-muted transition-colors hover:bg-surface-low hover:text-ink sm:hidden"
      >
        <Icon name={ICON[preference]} size={20} />
        <span className="sr-only">
          {`Colour theme: ${NAME[preference]}. Switch to ${NAME[NEXT[preference]]}.`}
        </span>
      </button>

      <div className="hidden sm:block">
        <SegmentedControl<ThemePreference>
          label="Colour theme"
          size="sm"
          value={preference}
          onChange={setPreference}
          options={OPTIONS}
        />
      </div>
    </>
  )
}
