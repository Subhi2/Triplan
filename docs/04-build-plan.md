# 04 · Build plan

Work through the phases in order. Each phase ends with a working app, passing `pnpm lint && pnpm typecheck && pnpm test`, and a commit. Each step below is sized to be one Claude Code task; the "Done when" line is the check.

---

## Phase 0 · Project setup

1. Create the Next.js 15 app with TypeScript, Tailwind, ESLint, App Router, `src/` dir, pnpm.
2. Add Vitest, Playwright, Prettier, Zod, Drizzle (`drizzle-orm`, `drizzle-kit`, `postgres`), `@supabase/supabase-js`, `@supabase/ssr`, `maplibre-gl`, `react-map-gl`.
3. Create the folder layout from `02-architecture.md` with placeholder `index.ts` files.
4. Add `.env.example` with the variables listed in `CLAUDE.md`.
5. Add `package.json` scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed`.
6. Set up the PWA manifest and icons (use `@serwist/next` or `next-pwa`).

**Done when:** `pnpm dev` shows a placeholder home page and all check scripts pass.

## Phase 1 · Database and seed data

1. Create a Supabase project (or run `supabase start` locally). Enable PostGIS.
2. Write the Drizzle schema for every table in `03-data-model.md`. Use `customType` for `geography` columns. Generate and apply the migration.
3. Add the triggers, the `places_along_route` SQL function and RLS policies as a hand-written SQL migration.
4. Write `scripts/seed.ts` that loads categories, carry items, and the places in `06-seed-data.md` (with guide fields and carry items). Make it idempotent (upsert on slug).
5. Integration test: call `places_along_route` with a hard-coded Bengaluru → Sakleshpur → Kalasa line and assert Manjarabad Fort is returned and Belur is not.

**Done when:** `pnpm db:migrate && pnpm db:seed` works on a fresh DB and the integration test passes.

## Phase 2 · Map, geocoding and routing

1. `GeocodingProvider` interface + Nominatim implementation (India bias: `countrycodes=in`), with DB cache and 1 req/s throttle. `GET /api/geocode?q=`.
2. `RoutingProvider` interface + OSRM implementation, with DB cache. Zod-validate OSRM responses. Unit test parsing with a recorded fixture.
3. `routeService.getRoutes(trip)`: builds waypoints, calls the provider, computes `viaLabel` from towns (see "Suggesting via towns" in `02-architecture.md`). `POST /api/route`.
4. `MapView` component (MapLibre) with `RouteLayer` that draws all route options, selected one thick, others thin and dashed.
5. `TripForm`: start and destination with autocomplete, "Add stop" with drag-to-reorder (`@dnd-kit/sortable`), vehicle select, corridor select. State in the URL query string so trips are shareable (`?from=...&to=...&via=...`).
6. `RouteCards`: distance, time, via label; clicking selects the route.

**Done when:** searching Bengaluru → Kalasa draws routes on the map; adding "Sakleshpur" as a stop reroutes through it.

## Phase 3 · Places along the route

0. **Places for any trip, not just the demo.** Write `scripts/import-osm.ts` (`pnpm db:import-osm -- --region=<name>`) that downloads places from OpenStreetMap through the Overpass API (`https://overpass-api.de/api/interpreter`) region by region, starting with all of Karnataka, then Kerala, Tamil Nadu, Goa and Maharashtra. Tags: `tourism=viewpoint|attraction|museum|camp_site`, `historic=fort|castle|monument|ruins|archaeological_site|memorial`, `natural=waterfall|peak|beach|cave_entrance`, `water=lake|reservoir` with a name, `amenity=place_of_worship` with a `wikidata` or `wikipedia` tag, `amenity=fuel`, and `place=town|city` into the towns table. Map each to a category, upsert on `osm_id`, store as `status='verified'` with `source='osm'` (guide fields empty, shown as "Not known yet"). Throttle to one Overpass request at a time and split large regions into tiles. Test: a trip that isn't Bengaluru → Kalasa (e.g. Bengaluru → Ooty, Mysuru → Coorg, Pune → Goa) returns a sensible place list.
1. `corridorService.placesAlong(geometry, corridorM, categories)` calling the SQL function. `POST /api/places/along`.
2. `PlaceList` + `PlaceRow`: km marker, name, category chip, rating, best-time summary, detour label. Sorted by km.
3. Category filter chips and "hide detours over N km" toggle.
4. `PlaceMarkers` on the map, coloured by category, clustered at low zoom. Hover/click syncs with the list.
5. Mobile layout: map top, list in a draggable bottom sheet (`vaul` or custom).
6. Playwright test for the Sakleshpur vs Chikkamagaluru acceptance criteria in `01-product-spec.md`.

**Done when:** acceptance criteria 1–4 in the product spec pass.

## Phase 4 · Place detail and trips

1. `GET /api/places/[slug]` returning `PlaceDetail`.
2. Place page and sheet: gallery with attribution, rating, `MonthStrip` (12 cells: best / ok / avoid), best vehicle with last-mile note, `CarryList` (current-season first), timings, fee, dress code, reviews, related videos (empty for now).
3. "Add to trip": insert the place as a via stop at the right position (by km from start) and recompute the route.
4. Supabase Auth (magic link + Google). `/login`, session in server components.
5. Save trip, list trips, open trip, share public read-only link.

**Done when:** a signed-in user can plan Bengaluru → Kalasa via Sakleshpur, add Manjarabad Fort, save and reopen the trip.

**MVP complete here.** Deploy to Vercel + Supabase.

## Phase 5 · Community content

1. Reviews: form (rating, month visited, vehicle, text, photos), one per user per place, rating trigger.
2. Photo uploads to Supabase Storage with resize, EXIF strip, license = `user-granted`.
3. "Add a place" (`/contribute`): pin on map, name, category, guide fields (optional), photos, optional YouTube/Instagram link. Creates `place` with `status = 'unverified'` and, if a link is given, a `social_post` with `source = 'user_link'`.
4. Duplicate check on submit: warn if a place with a similar name (`pg_trgm` similarity > 0.4) exists within 1 km.
5. Admin area (`/admin`), gated by `profile.role`: queues for places, reviews, photos. Approve / edit / reject.

**Done when:** a user submission appears on the map only after admin approval.

## Phase 6 · Hidden places from YouTube

Follow `05-hidden-places.md`.

1. `discovery_region` admin CRUD, seeded with regions along the demo routes.
2. YouTube provider: `search.list` (keyword + location/radius), `videos.list` for stats and full descriptions. Quota tracking table; stop when the day's budget is used.
3. LLM extraction (`src/server/providers/llm/extractPlace.ts`) with the prompt and JSON schema in `05`.
4. Geocoding + matching to existing places.
5. `pnpm job:discover` CLI and a scheduled run (Vercel Cron or Supabase scheduled function) nightly.
6. Admin discovery queue: candidate cards with the embedded video, extracted fields, map pin to drag and fix, and Approve (creates or links a place) / Reject.
7. Show linked videos on place pages. Compute `trending_score` from recent post count and views.

**Done when:** a nightly run over the Sakleshpur region produces reviewable candidates, and approving one creates a place visible on the route.

## Phase 7 · Instagram

Only after Meta app review is approved (see `05`).

1. Instagram provider using the Graph API hashtag endpoints.
2. Hashtag budget tracking (30 unique hashtags per rolling 7 days).
3. Same extraction → matching → review pipeline as YouTube.
4. oEmbed for displaying reels on place pages.

## Phase 8 · Polish and launch

- Offline trip pack, monsoon warnings on place pages during avoid months, Lighthouse ≥ 90, error monitoring (Sentry), analytics, self-hosted OSRM, terms and privacy pages, image and content takedown process.

---

## Suggested first message to Claude Code

> Read CLAUDE.md and everything in docs/. Then do Phase 0 of docs/04-build-plan.md. Stop after Phase 0 and show me what you did before starting Phase 1.
