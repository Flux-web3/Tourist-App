let counter = 0

/** Stable, collision-resistant id with a readable prefix for debugging. */
export function createId(prefix: string): string {
  counter += 1
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${random}`
}

export function nowISO(): string {
  return new Date().toISOString()
}
