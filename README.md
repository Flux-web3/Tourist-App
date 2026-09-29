# Tourist

An AI travel companion MVP: plan a trip, draft its days, then track what you
actually spend. Live at <https://tourist-app-blush.vercel.app/>.

React 19, TypeScript, Vite 7, Tailwind v4 and React Router 7. Everything is
stored in the browser (`localStorage`); there is no backend and no account.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run typecheck` | Full `tsc -b --force` |
| `npm run lint` | ESLint |
| `npm test` | Vitest, once |

Pushing `main` deploys to production on Vercel.

## Rules the code holds to

- **Remaining = Trip Budget − Actual Spent.** Only logged expenses count toward
  Actual Spent. The AI estimate is shown beside it and never added in.
- **No currency conversion, anywhere.** Every expense and every itinerary stop
  carries its own currency. Totals count only what is in the trip's currency;
  anything else is shown in its own currency and listed as not counted.
- **A trip's destination is an id, not text.** Destinations come from a small
  curated catalogue (`src/data/destinations.ts`: Paris, London, Lagos, New York,
  Tokyo, Dubai, Rome, Barcelona), picked with a searchable selector. The trip
  stores `destinationId`, and Explore, place details and itinerary drafting read
  only that. Nothing ever falls back to Paris.
- **Explore is trip-contextual.** A trip's Explore shows only its destination's
  places. Paris, London and Lagos have curated places; the other destinations
  show an honest "still growing" state rather than another city's places.
- **Drafts are priced in the destination's currency.** Paris, London and Lagos
  draft from their own landmark banks; other destinations use generic stops
  named for the city, at an illustrative local price level. Places from Explore
  keep their own currency; stops you add yourself take the trip's. A trip saved
  before destinations were listed, whose city is not in the catalogue, drafts
  generic stops priced in EUR (`DRAFT_PRICE_CURRENCY`).
- **Saved data is versioned.** State lives under `tourist.state.v1` with a
  `version` field (currently 3; v3 added `destinationId`, resolved from the
  typed destination, which is kept as typed). `src/services/migrations.ts` migrates older
  versions forward, salvages valid records from damaged data rather than
  wiping it, and keeps the previous copy in `tourist.state.backup`. Data from a
  newer version, which this build cannot read, is copied to that backup before
  the app starts fresh.

## Known limitations

- **Regenerate variant is not remembered across reloads.** Each Regenerate
  moves to the next draft variant, but the counter lives in memory, so after a
  reload the next Regenerate can repeat a draft seen before. Nothing is lost:
  regeneration always keeps stops you added, booked or edited. Persisting it
  would add a field to saved state for little benefit, so it is left as is.
- **Pre-v2 edited AI prices.** Data saved before version 2 did not record a
  stop's currency. An AI stop whose price you edited cannot be told apart from
  a swapped alternative, so it migrates as EUR. On a non-EUR trip it is shown
  in EUR and left out of the total rather than mis-added.
- **One backup slot.** A migration, a salvage, an unreadable or newer-version
  payload and "Clear all data" each copy the old data to `tourist.state.backup`
  first, but there is only one slot, so the next such event replaces it. Nothing
  in the app restores from it yet; it is there for manual recovery.
- **Swapped alternatives can crowd the next stop.** A swap prefers a stop of a
  similar kind over one that fits the gap exactly, so about 6% of swaps overlap
  the following stop's start time.
- **Adding a place ignores its opening hours.** Without a chosen start time,
  a place from Explore goes straight after the day's last stop, even past
  closing time. The hours are free text, copied into the stop's notes, and the
  add dialog accepts a start time.
- **Eight destinations, three with places.** Only catalogue cities can be
  chosen for a new trip. London and Lagos places have drawn covers, not photos.
- **Estimates are illustrative.** Prices and places are sample data, not live
  quotes.
