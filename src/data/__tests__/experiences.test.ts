import { describe, expect, it } from 'vitest'
import { EXPERIENCES, EXPERIENCES_BY_ID } from '@/data/experiences'
import { isValidTime } from '@/domain/format'
import type { Weekday } from '@/domain/types'

/**
 * `visitWindow` is typed in by hand next to `hoursNote`, so these tests are what
 * stop the two drifting apart: the scheduler reads the window, the traveller
 * reads the note, and they must say the same thing.
 */

const TIME = /\b\d{2}:\d{2}\b/g
/** "09:00 - 18:00", "05:00 - midnight", "07:30 - sunset". */
const RANGE = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}|midnight|sunset)/
const DAY_STEM = '(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)'
/**
 * The two ways a note says a place cannot be visited on a day: "closed Tuesdays",
 * and "services only on Sundays" (a church that is open to visitors the rest of the week).
 */
const CLOSED_DAY = new RegExp(`closed ${DAY_STEM}days|services only on ${DAY_STEM}days`, 'g')

/** How the window records the note's words for a closing time. */
const WORD_CLOSE: Record<string, string> = { midnight: '00:00', sunset: '18:00' }

describe('catalogue visiting windows', () => {
  it('gives every place a window or an explicit null', () => {
    for (const experience of EXPERIENCES) {
      expect(experience.visitWindow, experience.id).not.toBeUndefined()
      const window = experience.visitWindow
      if (!window) continue
      expect(isValidTime(window.opens), experience.id).toBe(true)
      if (window.closes !== null) expect(isValidTime(window.closes), experience.id).toBe(true)
    }
  })

  it('matches every time and range in the hours note, and adds none of its own', () => {
    for (const experience of EXPERIENCES) {
      const note = experience.hoursNote
      const window = experience.visitWindow
      const times = note.match(TIME) ?? []
      const range = RANGE.exec(note)

      if (window === null) {
        expect(times, `${experience.id}: "${note}" names a time but has no window`).toEqual([])
        continue
      }
      // The first time in the note is when the place opens.
      expect(window.opens, experience.id).toBe(times[0])
      if (range) {
        expect(range[1], experience.id).toBe(window.opens)
        expect(window.closes, experience.id).toBe(WORD_CLOSE[range[2]] ?? range[2])
      } else {
        // A start with no range ("shows typically from 19:30") has no closing time.
        expect(window.closes, experience.id).toBeNull()
      }
      for (const time of times) {
        expect([window.opens, window.closes], `${experience.id}: ${time}`).toContain(time)
      }
    }
  })

  it('lists exactly the closed days the note names', () => {
    for (const experience of EXPERIENCES) {
      const named = [...experience.hoursNote.matchAll(CLOSED_DAY)].map(
        (match) => `${match[1] ?? match[2]}day` as Weekday,
      )
      expect([...(experience.visitWindow?.closedOn ?? [])], experience.id).toEqual(named)
    }
    expect(EXPERIENCES_BY_ID.get('exp_louvre_museum')?.visitWindow?.closedOn).toEqual(['Tuesday'])
    // "services only on Sundays" means a visitor cannot go in on a Sunday.
    expect(EXPERIENCES_BY_ID.get('exp_london_westminster_abbey')?.visitWindow?.closedOn).toEqual([
      'Sunday',
    ])
  })

  it('reads the notes the scheduler depends on as intended', () => {
    const windowOf = (id: string) => EXPERIENCES_BY_ID.get(id)?.visitWindow
    expect(windowOf('exp_london_tower_of_london')).toEqual({ opens: '09:00', closes: '17:30' })
    expect(windowOf('exp_london_west_end_show')).toEqual({ opens: '19:30', closes: null })
    expect(windowOf('exp_lagos_glover_court_suya')).toEqual({ opens: '17:00', closes: '23:00' })
    expect(windowOf('exp_luxembourg_gardens')).toEqual({ opens: '07:30', closes: '18:00' })
    expect(windowOf('exp_lagos_new_afrika_shrine')).toBeNull()
    expect(windowOf('exp_canal_saint_martin')).toBeNull()
  })
})
