# Tourist design system: "Golden hour"

One system, every screen. The look comes from two things the product already
owns: the landing photograph (a night-blue sky over a sunset) and the logo.
Tokens live in `src/styles/index.css`; nothing below is page-specific.

## Colour roles

| Token (Tailwind name) | Use |
|---|---|
| `canvas`, `surface`, `surface-low`, `surface-high` | Page, cards, quiet fills, pressed/selected fills |
| `line`, `line-strong` | Hairlines; the stronger one draws containers in dark mode |
| `field` | The edge of inputs, selects and unselected chips. 3:1 against its surface |
| `ink`, `ink-muted`, `ink-subtle` | Text, in falling order of weight. All pass AA on every surface |
| `navy` / `btn-primary` | The product colour: primary buttons, icon tiles, selected states |
| `gold`, `gold-ink`, `gold-bg`, `gold-border` | The brand note. `gold` is decoration only; text uses `gold-ink` |
| `terracotta` | Eyebrows, the active tab, required markers. Small accents only |
| `night` | Ground under photo heroes and night bands. Same in both themes |
| `ai-*`, `catalog-*`, `planned-*`, `actual-*`, `danger-*` | Provenance and feedback. Meaning, not decoration. Never repurpose |

Dark mode keeps a pure black canvas; surfaces are night-navy and are drawn by
their borders.

## The on-photo scope

`.on-photo` re-points the ordinary tokens at their on-photograph values (white
ink, white primary button, smoked-glass secondary). Put it on any dark picture
or night band and use the normal components inside it. Do not write
`text-white` or one-off button styles.

- `PhotoHero` (`src/components/ui/PhotoHero.tsx`): photo edge to edge, words on
  top, credit chip at the foot. With `src={null}` it is a plain night band.
  Never substitute a picture of somewhere else.
- A night band without a photo: `on-photo photo-hero rounded-sheet`.

## Type

Plus Jakarta Sans throughout. `text-hero` (landing only), `text-display`,
`text-headline-lg` (page titles), `text-headline-md`, `text-headline-sm` (card
and section titles), `text-body-lg/md/sm`, `text-label-lg/md/sm`. Titles are
bold and tight; body copy is regular. Figures use `tnum`.

`.eyebrow` is the small uppercase line above a title. Use the class, not a
hand-built string of utilities.

## Shape

| Radius | Use |
|---|---|
| `rounded-pill` | Every button, badge and chip |
| `rounded-control` | Fields, menus, icon tiles, list rows |
| `rounded-card` | Cards (`surface-card`, `surface-raised`) |
| `rounded-sheet` | Dialogs, heroes, night bands, large media |

Icon tiles are `h-10 w-10 rounded-control bg-navy text-btn-primary-fg`.
Numbered steps are `rounded-pill border border-gold-border bg-gold-bg text-gold-ink`.

## Spacing

Page gutter `px-4` (`px-5 sm:px-6` on the landing page). Cards pad `p-5`.
Stack sections with `gap-6` inside the app and `gap-14 md:gap-20` on the
landing page. Touch targets are 44px or more.

## Buttons

`Button` / `ButtonLink` from `src/components/ui`, variants `primary`, `accent`,
`secondary`, `ghost`, `danger`. One primary action per view. Do not restyle a
button with ad-hoc classes.

## Brand

`Brand` (`src/components/Brand.tsx`) is the only place the logo is drawn. The
mark is a shape (`public/logo-mark.png`) coloured by `--brand-mark` on a
`--brand-tile`.
