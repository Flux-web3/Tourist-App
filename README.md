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
- **Curated vs general destinations, said out loud.** Paris, London and Lagos
  (`guide: 'curated'`) draft only from their own city banks. The other five
  (`guide: 'general'`) draft general activity types named for the city, and the
  picker, itinerary and overview say so; they are never presented as local picks.
- **The last day ends at a fixed departure.** Leaving is modelled at 12:00
  (`DEPARTURE_START_TIME`), labelled as a placeholder to move to the real
  ticket; an ordinary last-day stop must end 90 minutes before it
  (`FINAL_DAY_BUFFER_MINUTES`), and nothing is planned after it. Arrival and
  departure stops carry a `role` and are never swapped for an activity.
- **Changing a trip's city re-drafts it for that city.** Edit trip says what
  will go first; the old city's drafted stops and guide places are removed,
  your own stops, expenses, notes and currency are kept, and a name Tourist
  suggested follows the new city.
- **Drafts are priced in the destination's currency.** General destinations use
  an illustrative local price level. Places from Explore
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

## Design system

The visual language is documented in [DESIGN.md](DESIGN.md) and implemented as
tokens in `src/styles/index.css`. Screens use the shared components and tokens;
there is no page-specific styling.

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
- **Departure time is not asked for.** There is no flight or train time on a
  trip, so every draft leaves at 12:00; an evening flight means moving the
  departure stop by hand. On general destinations the last morning is
  sometimes empty when no general stop fits before 10:30.
- **Eight destinations, three with places.** Only catalogue cities can be
  chosen for a new trip. Three Lagos places (Nike Art Gallery, Lekki Arts &
  Crafts Market, Glover Court Suya) have drawn covers, not photos: Tourist only
  shows a photograph taken at the place it describes, with its credit, and the
  available photos of those three were of artworks, of people, or of somewhere
  else. All photographs are served from `public/images/`.
- **Estimates are illustrative.** Prices and places are sample data, not live
  quotes.
