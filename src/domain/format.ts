const MS_PER_DAY = 86_400_000

export function parseISODate(iso: string): Date | null {
  if (typeof iso !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (date.getUTCFullYear() !== year) return null
  if (date.getUTCMonth() + 1 !== month) return null
  if (date.getUTCDate() !== day) return null
  return date
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso)
  if (!date) return iso
  return toISODate(new Date(date.getTime() + days * MS_PER_DAY))
}

/** Whole days from `start` to `end`; negative when the range runs backwards. */
export function differenceInDays(start: string, end: string): number {
  const from = parseISODate(start)
  const to = parseISODate(end)
  if (!from || !to) return 0
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

export function eachDay(startISO: string, endISO: string): string[] {
  const span = differenceInDays(startISO, endISO)
  if (span < 0) return []
  return Array.from({ length: span + 1 }, (_, index) => addDays(startISO, index))
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const DAY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

export function formatDate(iso: string): string {
  const date = parseISODate(iso)
  return date ? DATE_FORMATTER.format(date) : iso
}

export function formatLongDate(iso: string): string {
  const date = parseISODate(iso)
  return date ? DAY_FORMATTER.format(date) : iso
}

export function formatShortDate(iso: string): string {
  const date = parseISODate(iso)
  return date ? WEEKDAY_FORMATTER.format(date) : iso
}

export function formatDateRange(startISO: string, endISO: string): string {
  if (!startISO) return ''
  if (!endISO || startISO === endISO) return formatDate(startISO)
  return `${formatDate(startISO)} - ${formatDate(endISO)}`
}

export function tripLengthInDays(startISO: string, endISO: string): number {
  return differenceInDays(startISO, endISO) + 1
}

/** 24h `HH:mm` to a friendly 12h label, or `null` when the input is not a real time. */
export function formatTime(time: string): string | null {
  if (typeof time !== 'string' || !isValidTime(time)) return null
  const hours = Number(time.slice(0, 2))
  const minutes = time.slice(3, 5)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHours}:${minutes} ${suffix}`
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Flexible'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} hr`
  return `${hours} hr ${rest} min`
}

/**
 * A full ISO timestamp to a readable local date and time, or `null` when the
 * value is not a real date. Callers must handle the `null` case rather than
 * rendering the raw string, so corrupt persistence never shows as "Invalid".
 */
export function formatDateTime(iso: string): string | null {
  if (typeof iso !== 'string' || iso.trim().length === 0) return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

export function formatRelativeDay(dateISO: string, tripStartISO: string): string {
  const offset = differenceInDays(tripStartISO, dateISO)
  if (offset <= 0) return 'Day 1'
  return `Day ${offset + 1}`
}

export function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

export function isValidTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return false
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

/** `HH:mm` plus a duration, clamped to the end of the day. */
export function addMinutesToTime(time: string, minutes: number): string {
  const total = Math.min(24 * 60 - 1, timeToMinutes(time) + Math.max(0, Math.round(minutes)))
  const hours = Math.floor(total / 60)
  return `${String(hours).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
