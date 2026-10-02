import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
  The icon font is requested as a subset: only the icons named in the
  `icon_names` parameter of its URL in index.html are in the file the browser
  downloads. An icon missing from that list renders as its own name in words,
  so this test reads the source and fails when it finds a name the list lacks.

  Icon names reach the page as plain strings in many shapes, so the scan works
  from where a string is used, not what it looks like:

    1. the `name` of an `<Icon>`: a literal, or literals inside `{...}`;
    2. anything bound to something called "icon": a prop (`icon="lock"`), an
       object key (`icon: 'edit'`, `icon: pinned ? 'keep_off' : 'push_pin'`), a
       default (`icon = 'travel_explore'`), or a whole table
       (`const ICON = {...}`, `ITINERARY_CATEGORY_ICON = {...}`).

  That only holds if every icon is drawn from one of those two places. So the
  second half of the test pins that down: an `<Icon name={...}>` that is not a
  literal must read from something with "icon" in its name, and nothing but
  `Icon` and `SegmentedControl` may write the icon font's class.
*/

const ROOT = process.cwd()
const SRC = resolve(ROOT, 'src')
const INDEX_HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8')

const ICON_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/
const STRING_LITERAL = /'([^'\\\n]*)'|"([^"\\\n]*)"/g

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return ['__tests__', '__audit__', 'test'].includes(entry.name) ? [] : sourceFiles(path)
    }
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** Comments describe icons in prose ("icon: the gold tile"), which is not a use of one. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

/** A string a value is compared with (`role === 'arrival'`) decides which icon; it is not one. */
const COMPARED_LITERAL = /[!=]==?\s*(?:'[^'\\\n]*'|"[^"\\\n]*")/g

function literalsIn(text: string): string[] {
  return [...text.replace(COMPARED_LITERAL, ' ').matchAll(STRING_LITERAL)]
    .map((match) => match[1] ?? match[2])
    .filter((value) => ICON_NAME.test(value))
}

const OPENERS = '([{'
const CLOSERS = ')]}'

/** The text between the bracket at `start` and its partner, exclusive. */
function balanced(code: string, start: number): string {
  let depth = 0
  for (let index = start; index < code.length; index += 1) {
    const char = code[index]
    if (OPENERS.includes(char)) depth += 1
    else if (CLOSERS.includes(char)) {
      depth -= 1
      if (depth === 0) return code.slice(start + 1, index)
    }
  }
  return code.slice(start + 1)
}

/**
 * The expression starting at `start`: up to the `,` or `;` that ends it, the
 * bracket that closes whatever it sits in, or the end of its line unless the
 * expression plainly carries on (a ternary or a union split across lines).
 */
function expressionAt(code: string, start: number): string {
  let depth = 0
  for (let index = start; index < code.length; index += 1) {
    const char = code[index]
    if (OPENERS.includes(char)) depth += 1
    else if (CLOSERS.includes(char)) {
      if (depth === 0) return code.slice(start, index)
      depth -= 1
    } else if (depth === 0 && (char === ',' || char === ';')) {
      return code.slice(start, index)
    } else if (depth === 0 && char === '\n') {
      const before = code.slice(start, index).trimEnd()
      const after = code.slice(index + 1).trimStart()
      const carriesOn = /[?:|&=(]$/.test(before) || /^[?:|&]/.test(after)
      if (!carriesOn) return before
    }
  }
  return code.slice(start)
}

interface Scan {
  /** Icon name -> the files that use it. */
  names: Map<string, Set<string>>
  /** Places an icon could be drawn from that the scan cannot see into. */
  blindSpots: string[]
}

function scan(): Scan {
  const names = new Map<string, Set<string>>()
  const blindSpots: string[] = []

  for (const path of sourceFiles(SRC)) {
    const file = relative(ROOT, path).replaceAll('\\', '/')
    const code = withoutComments(readFileSync(path, 'utf8'))
    const add = (found: string[]) => {
      for (const name of found) {
        if (!names.has(name)) names.set(name, new Set())
        names.get(name)?.add(file)
      }
    }

    // 1. <Icon name="..."> and <Icon name={...}>
    for (const match of code.matchAll(/<Icon\b[^>]*?\bname=(?:"([^"]*)"|'([^']*)'|(\{))/g)) {
      const literal = match[1] ?? match[2]
      if (literal !== undefined) {
        add([literal])
        continue
      }
      const expression = balanced(code, (match.index ?? 0) + match[0].length - 1)
      const found = literalsIn(expression)
      add(found)
      if (found.length === 0 && !/icon/i.test(expression)) {
        blindSpots.push(`${file}: <Icon name={${expression.trim()}}> reads from something not called "icon"`)
      }
    }

    // 2. Anything bound to a name containing "icon".
    for (const match of code.matchAll(/\b[A-Za-z_$][\w$]*\b(?<=[iI][cC][oO][nN][\w$]*)\??\s*(?::(?!:)|=(?![=>]))/g)) {
      const afterBinding = (match.index ?? 0) + match[0].length
      const rest = code.slice(afterBinding)
      const leading = rest.length - rest.trimStart().length
      const start = afterBinding + leading
      const boundWithEquals = match[0].trimEnd().endsWith('=')
      const tail = code.slice(start)

      // `icon="lock"` and `icon = 'travel_explore'`: that one string and no more
      // of the line, or the next prop's value would be taken for an icon.
      const direct = /^(?:'[^'\\\n]*'|"[^"\\\n]*")/.exec(tail)
      if (boundWithEquals && direct) {
        add(literalsIn(direct[0]))
        continue
      }

      // A table of names: `const ICON = {...}` or `X_ICON: Record<K, string> = {...}`,
      // and equally `icon={...}` on an element.
      const table = boundWithEquals ? /^[{[]/.exec(tail) : /^[^=\n{}[\]();'"]*=\s*[{[]/.exec(tail)
      if (table) {
        const body = balanced(code, start + table[0].length - 1)
        // `icon={<Icon .../>}` is markup, and its own <Icon> is read by rule 1.
        if (!body.includes('<')) add(literalsIn(body))
        continue
      }

      add(literalsIn(expressionAt(code, start)))
    }

    // Nothing else may draw from the icon font.
    if (code.includes('material-symbols-outlined') && !/ui\/(Icon|SegmentedControl)\.tsx$/.test(file)) {
      blindSpots.push(`${file}: writes the icon font class itself instead of using <Icon>`)
    }
  }

  return { names, blindSpots }
}

function iconFontUrl(): URL {
  const href = /href="(https:\/\/fonts\.googleapis\.com\/css2\?family=Material\+Symbols\+Outlined[^"]*)"/.exec(INDEX_HTML)
  if (!href) throw new Error('index.html does not load the Material Symbols Outlined stylesheet')
  return new URL(href[1].replaceAll('&amp;', '&'))
}

function subsetNames(): string[] {
  const value = iconFontUrl().searchParams.get('icon_names')
  if (value === null) throw new Error('the icon font URL has no icon_names subset')
  return value.split(',')
}

describe('the icon font subset in index.html', () => {
  const { names, blindSpots } = scan()

  it('finds the icons the scan is known to have to find, in every shape they are written', () => {
    // One of each shape. If the scan stops seeing a shape, this says which.
    for (const name of [
      'close', // <Icon name="close">
      'flight_land', // <Icon name={cond ? 'flight_land' : 'flight_takeoff'}>
      'flight_takeoff',
      'search_off', // icon="search_off"
      'delete_outline', // { icon: 'delete_outline' }
      'keep_off', // icon: cond ? 'keep_off' : 'push_pin'
      'travel_explore', // icon = 'travel_explore'
      'directions_subway', // ITINERARY_CATEGORY_ICON: Record<...> = {...}
      'dark_mode', // [{ value: 'dark' as const, icon: 'dark_mode' }]
      'expand_less', // <Icon name={open ? 'expand_less' : 'expand_more'}> across lines
    ]) {
      expect(names.has(name), `the scan no longer finds "${name}"`).toBe(true)
    }
    expect(names.size).toBeGreaterThan(50)
  })

  it('includes every icon the source uses', () => {
    const subset = new Set(subsetNames())
    const missing = [...names.keys()]
      .filter((name) => !subset.has(name))
      .sort()
      .map((name) => `${name} (${[...(names.get(name) ?? [])].join(', ')})`)

    expect(
      missing,
      'these icons are used in src but are not in icon_names in index.html, so they would render as words',
    ).toEqual([])
  })

  it('is sorted and has no duplicates, as Google Fonts requires', () => {
    const subset = subsetNames()

    expect(subset).toEqual([...new Set(subset)].sort())
    expect(subset.every((name) => ICON_NAME.test(name))).toBe(true)
  })

  it('has no icon drawn from somewhere the scan cannot see', () => {
    expect(blindSpots).toEqual([])
  })
})
