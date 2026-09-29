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
4. ~~Supabase Auth~~: dropped. The app is open, no sign-in (decided 2026-09-29).
5. Save trip, list trips, open trip, share the trip's link. Trips are open: one shared list, no owners.

**Done when:** a user can plan Bengaluru → Kalasa via Sakleshpur, add Manjarabad Fort, save and reopen the trip.

**MVP complete here.** Deploy to Vercel + Supabase.

## Growth G1 · Share, photos and ride check

From `07-growth-plan.md`: features that need no API key, cost nothing and need no product decision. One commit each.

1. **Share cards and SEO**: share images for saved trips, planner links and places (`next/og`); a Share button (phone share sheet, WhatsApp, copy link); `sitemap.xml`, `robots.txt`, canonical URLs and schema.org JSON-LD on place pages.
2. **Photos from Wikimedia Commons**: `pnpm db:import-photos` takes each place's Wikidata image (`P18`) with its author and licence from Commons, into `media` with `source = 'wikimedia'`. Throttled, identifies itself with the User-Agent, resumable.
3. **Ride check** on the selected route: the longest stretch without a fuel station against the vehicle's range, and the start time with arrival against sunset (`suncalc`).
4. **GPX export** of the route, stops and ticked places, for OsmAnd, Organic Maps and GPS units.
5. **Weather on the ride** from MET Norway (free, commercial use allowed, CC BY 4.0): rain, temperature and wind at points along the route at the time the rider reaches them.

**Done when:** a pasted trip link shows its route card in WhatsApp; Manjarabad Fort's page shows a Wikimedia photo with credit; Bengaluru → Kalasa shows the longest fuel gap, the arrival against sunset, the weather along the way, and downloads as a GPX file that opens in OsmAnd.

## Growth G1-Google · Google fills the gaps (needs Google keys)

Decided 2026-09-29: use Google Maps Platform only where our own data has a gap, within Google's free monthly usage. Rules, SKUs and budget are in "Google Maps Platform" in `02-architecture.md`. Do it after the Wikimedia photos (G1.2), so Google only fills what Commons could not. One commit per step.

Before starting (the owner does this in the Google Cloud console):
- A billing account with an Indian billing address; check that the Places and Maps prices shown are the India ones (70,000 free map loads a month). If not, lower the budget in step 2.
- Enable the Maps JavaScript API and the Places API (New). Create the browser key (Maps JavaScript API only, HTTP referrers: the production domain, this project's Vercel preview domains, `localhost:3000`), the server key (Places API (New) only) and a Map ID.
- Per-day quotas: Maps JavaScript map loads 2,250; Place Details and Place Photo requests 225 each. A budget alert as well.

1. **Keys**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID` and `GOOGLE_MAPS_API_KEY` in `src/server/env.ts` (all optional) and `.env.example`. A `googleEnabled` flag for the client: true only when the browser key is set.
2. **Budget**: migration adding `google_usage (day date, sku text, count int, PRIMARY KEY (day, sku))` and `place.google_place_checked_at`. `src/server/providers/google/budget.ts`: `take(sku)` increments atomically and says no once the day's limit is reached (`ids` 2,000, `details_atmosphere` 225, `photo` 225). Unit tests.
3. **Provider** `src/server/providers/google/places.ts` behind an interface, mocked in tests, responses Zod-validated, fixtures recorded once: `findPlaceId(name, [lng, lat])` (Text Search IDs only, rectangle about 600 m around the pin), `details(id, fields)`, `photoUri(name, maxWidthPx)`.
4. **Exact Google Maps links**: resolve the id the first time a place's details open (and on "Open in Google Maps"), store it in `place.google_place_id`, record `google_place_checked_at` when nothing was found so it is not retried for 30 days. The links use `query_place_id` once the id is known; with no id, or the budget used up, today's name-at-coordinates link.
5. **`GET /api/places/[slug]/google`**: works out the gaps (no verified `media` → `photos`; fewer than 3 verified reviews → `rating,userRatingCount,reviews,googleMapsUri`), makes one Place Details request with those fields, returns them with `Cache-Control: private, no-store`. Nothing is written to the DB but the id. `GET /api/google/photo?name=&w=`: checks the budget, redirects to Google's `photoUri`, no-store.
6. **Remove stored Google data**: drop `external_rating` (Google ratings may not be stored, and nothing else fills it) and its code in `placeDetailService`; `media.source` no longer takes `'google'`.
7. **Google map**: `@vis.gl/react-google-maps` and `@googlemaps/markerclusterer`. `MapView` picks the Google or MapLibre implementation from `googleEnabled`, with the same props; route lines, place dots, clusters, selection sync with the list, bottom padding following the sheet so the Google logo stays visible, one map instance per page. Check 1,000 places on a mid-range phone; if slow, use deck.gl's `GoogleMapsOverlay` for the dots.
8. **"From Google" section** in `PlaceDetailView`, loaded in the browser after the details show, only when `googleEnabled`: photos with author credit (first one now, the rest on swipe, at most 5), rating and count, up to 5 reviews with author name, photo and link, "See on Google Maps" (`googleMapsUri`). Hidden when there is no gap, no id or no budget. Our own photos and reviews always come first. On the place page (no map) the section is labelled "From Google" in text.
9. Playwright keeps running without Google keys; add a unit test that `/api/places/[slug]/google` asks only for the fields of the gaps and makes no call when the budget is used up.

**Done when:** with the keys set on a preview deploy, the planner shows a Google map with routes and clustered places; opening a place with no photos of our own shows Google photos and reviews with credit and the exact "Open in Google Maps" link; opening a place that has our photos and 3+ reviews makes no Google call (check the `google_usage` table); nothing from Google is in the DB but place ids; without the keys the app looks and works as before.

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
