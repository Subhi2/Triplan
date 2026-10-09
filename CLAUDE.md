# Bike Travelling Guide

A route explorer for bike and car travellers. The user picks a start, a destination and optional via stops (to force a specific path), and the app shows every worthwhile place along that exact route: temples, forts, viewpoints, waterfalls, treks, lakes, food and fuel. Each place has a category, rating, photos, reviews, best vehicle, best time to visit and items to carry. A discovery pipeline finds "hidden places" from YouTube and Instagram posts.

The app must work for **any** start, destination and via stops the user types. Bengaluru → Kalasa is only the test case used in the docs and tests; never hard-code it in app logic.

Reference example used throughout: **Bengaluru → Kalasa**, via Sakleshpur (NH75 → Sakleshpur → Mudigere → Kottigehara) or via Chikkamagaluru (NH75 → Hassan → Belur → Chikkamagaluru → Balehonnur). Both share NH75 up to Hassan.

## Read these first

| File | What it covers |
|---|---|
| `docs/01-product-spec.md` | Features, screens, user stories, acceptance criteria |
| `docs/02-architecture.md` | Stack, folders, services, routing and corridor search |
| `docs/03-data-model.md` | Postgres + PostGIS schema (SQL) and TypeScript types |
| `docs/04-build-plan.md` | Phased build steps. Work through phases in order |
| `docs/05-hidden-places.md` | YouTube / Instagram discovery pipeline and its rules |
| `docs/06-seed-data.md` | Seed places for the Bengaluru → Kalasa demo |
| `docs/07-growth-plan.md` | Product positioning, growth features, open-source tools and licences, making money |
| `docs/08-design.md` | The "Ghat Road" design: tokens, type, components, layout and motion. Follow it for any UI |

## Stack (decided)

- **Next.js 15 (App Router) + TypeScript**, deployed as a PWA. Tailwind CSS for styling.
- **Maps**: **Google Maps JavaScript API** via `@vis.gl/react-google-maps` when a Google key is set; **MapLibre GL JS** via `react-map-gl/maplibre` with OpenStreetMap tiles (OpenFreeMap) otherwise (dev without a key, tests, the offline pack). Both behind the same `MapView` props.
- **Google Maps Platform fills gaps only** (decided 2026-09-29): photos, rating and reviews for places that have none of our own, and exact Google Maps links. Our own data, OSRM, Photon and the PostGIS corridor search stay the core. See "Google Maps Platform" in `docs/02-architecture.md`.
- **Supabase**: Postgres with **PostGIS**, Auth, Storage.
- **Routing**: OSRM (public demo server in dev, self-hosted later) behind a `RoutingProvider` interface so Google Routes / GraphHopper can be swapped in.
- **Geocoding**: Photon (komoot, `https://photon.komoot.io/api`) for suggestions while the user types, Nominatim as the fallback when Enter is pressed, both behind the `GeocodingProvider` interface. Our own places are listed before Photon results (see "Place search" in `docs/02-architecture.md`).
- **Drizzle ORM** for schema and queries; raw SQL for PostGIS functions.
- **Zod** for validating every API input and external API response.
- **Vitest** for unit tests, **Playwright** for end-to-end.
- **pnpm** as package manager.

## Commands

```bash
pnpm install
pnpm dev              # Next.js dev server on :3000
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest
pnpm test:e2e         # Playwright
pnpm db:setup         # migrations + load data/snapshot into empty tables (--replace --yes, --from-sources)
pnpm db:migrate       # apply Drizzle migrations
pnpm db:seed          # load docs/06 seed data
pnpm db:import-osm -- --region=<key|all>       # places from OpenStreetMap (--resume after a stopped run)
pnpm db:import-photos                          # Wikimedia Commons photos
pnpm db:import-services -- --region=<key|all>  # hospitals, police, ATMs, tyre/repair shops, stays
pnpm db:seed-rides    # route and store the famous rides in data/rides.json
pnpm rides:lookup -- "<name>"   # coordinates for a ride's stops (our towns, then Nominatim)
pnpm db:export-snapshot         # rewrite data/snapshot from the live database (read only)
pnpm screenshots -- --base=<url>  # README screenshots into docs/media
pnpm job:discover     # run hidden-places discovery once (phase 6)
```

Add these scripts to `package.json` as the phases introduce them.

## Conventions

- TypeScript `strict: true`. No `any` without a comment explaining why.
- Server-only code (DB, API keys, external APIs) lives under `src/server/`. Never import it from client components.
- All external API calls go through a provider interface in `src/server/providers/`, so each can be mocked in tests.
- Phones first: touch targets at least 44 px and input text at least 16 px below 768 px wide (see "Phone layout" in `docs/02-architecture.md`).
- UI follows `docs/08-design.md`: palette tokens and `stone-*` (remapped to warm paper and ink), `font-display` for headings, `font-mono tabular` for numbers, motion that respects reduced motion.
- Distances are stored in metres and shown as km with one decimal. Coordinates are `[lng, lat]` (GeoJSON order) everywhere in code.
- Months are stored as integers 1–12.
- Every image stored or displayed must carry `source`, `license` and `author`. Never re-host social media videos or photos; embed or link them.
- Secrets live in `.env.local` (never committed). Keep `.env.example` up to date.
- Run `pnpm lint && pnpm typecheck && pnpm test` before calling a task done, and `NEXT_DIST_DIR=.next-build pnpm build` before pushing to `main` (Vercel runs `next build`, which checks more than `tsc`).
- Small commits, one feature per commit, message in imperative mood.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
DATABASE_URL=
NEXT_PUBLIC_MAP_STYLE_URL=        # MapLibre style JSON URL
NEXT_PUBLIC_TERRAIN_TILES_URL=    # Terrarium tiles for the profile and 3D terrain; empty = AWS Terrain Tiles
NEXT_PUBLIC_SITE_URL=             # public address for share cards and the sitemap
WRITE_LIMIT_SALT=                 # salt for hashed visitor IPs (rate limits)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=  # one Google key: Maps JavaScript API + Places API (New), used by the map and the server; empty = MapLibre, no Google content
NEXT_PUBLIC_GOOGLE_MAP_ID=        # Map ID for Advanced Markers
GOOGLE_MAPS_API_KEY=              # optional separate server key; empty = the key above
OSRM_BASE_URL=https://router.project-osrm.org
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=bike-travelling-guide/0.1 (contact email)   # also sent to Photon and Overpass
PHOTON_BASE_URL=https://photon.komoot.io/api   # suggestions while typing
OVERPASS_URLS=https://overpass-api.de/api/interpreter,...   # OSM imports; servers tried in order
YOUTUBE_API_KEY=                  # phase 6
INSTAGRAM_ACCESS_TOKEN=           # phase 7, needs Meta app review
INSTAGRAM_BUSINESS_ACCOUNT_ID=    # phase 7
ANTHROPIC_API_KEY=                # "plan in plain words" (empty = hidden, no AI calls); phase 6 extraction
ANTHROPIC_TRIP_MODEL=             # default claude-haiku-4-5
```

## Things to avoid

- Do not scrape Instagram, YouTube or Google. Use official APIs only.
- Never store or cache Google content (Maps ToS 3.2.3(b)): only `place.google_place_id` is stored. Ratings, reviews, photos, names and hours are fetched live, shown, and thrown away: never in the DB, `media`, ISR/static HTML, the sitemap, JSON-LD or share cards.
- Never show Google content on or near a MapLibre map (Maps ToS 3.2.3(e)). Google content appears only when the Google map is on, or on a screen with no map, with Google's attribution.
- Call Google only to fill a gap (a place with no photos or reviews of our own, an exact link), never for list rows, in a loop or from imports, and always through the daily budget in `src/server/providers/google/budget.ts`.
- Public OSRM and Nominatim servers have strict usage limits (Nominatim: max 1 request/second, custom User-Agent required). Cache responses and never call them in a loop without throttling.
- Terrain tiles are read only through `src/lib/terrain.ts` (`NEXT_PUBLIC_TERRAIN_TILES_URL`), never a hard-coded URL elsewhere.
- The 3D ride preview, its video and the ride story are MapLibre / our data only: no Google content.
- The rider's "plan in plain words" text is sent to Anthropic and never stored or logged; the feature stays hidden without `ANTHROPIC_API_KEY`.
- The data snapshot (`data/snapshot`) never includes trips, reviews, accounts, usage, caches, users' photos or Google ids (`src/lib/snapshot.ts`). Refresh it with `pnpm db:export-snapshot` after imports.
- No link to the code repository anywhere in the app (footer, planner, About, metadata); the README is where the repository is. `tests/unit/no-repo-link.test.ts` checks it.
- Never use Nominatim for search-as-you-type (its usage policy forbids it); suggestions come from our own places and Photon. Photon's public server asks for fair use: keep suggestions debounced (300 ms), cached, and for 2+ characters only.
