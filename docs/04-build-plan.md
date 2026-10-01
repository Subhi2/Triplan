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
- Enable the Maps JavaScript API and the Places API (New). Create one key limited to those two APIs, with no application restriction (it is used in the browser and by the server), and optionally a Map ID.
- Per-day quotas: Maps JavaScript map loads 2,250; Place Details and Place Photo requests 225 each. A budget alert as well.

1. **Keys**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (the one key, for the map and the server), `NEXT_PUBLIC_GOOGLE_MAP_ID` and an optional separate server key `GOOGLE_MAPS_API_KEY` in `src/server/env.ts` (all optional) and `.env.example`. A `googleEnabled` flag for the client: true only when the key is set.
2. **Budget**: migration adding `google_usage (day date, sku text, count int, PRIMARY KEY (day, sku))` and `place.google_place_checked_at`. `src/server/providers/google/budget.ts`: `take(sku)` increments atomically and says no once the day's limit is reached (`ids` 2,000, `details_atmosphere` 225, `photo` 225). Unit tests.
3. **Provider** `src/server/providers/google/places.ts` behind an interface, mocked in tests, responses Zod-validated, fixtures recorded once: `findPlaceId(name, [lng, lat])` (Text Search IDs only, rectangle about 600 m around the pin), `details(id, fields)`, `photoUri(name, maxWidthPx)`.
4. **Exact Google Maps links**: resolve the id the first time a place's details open (and on "Open in Google Maps"), store it in `place.google_place_id`, record `google_place_checked_at` when nothing was found so it is not retried for 30 days. The links use `query_place_id` once the id is known; with no id, or the budget used up, today's name-at-coordinates link.
5. **`GET /api/places/[slug]/google`**: works out the gaps (no verified `media` → `photos`; fewer than 3 verified reviews → `rating,userRatingCount,reviews,googleMapsUri`), makes one Place Details request with those fields, returns them with `Cache-Control: private, no-store`. Nothing is written to the DB but the id. `GET /api/google/photo?name=&w=`: checks the budget, redirects to Google's `photoUri`, no-store.
6. **Remove stored Google data**: drop `external_rating` (Google ratings may not be stored, and nothing else fills it) and its code in `placeDetailService`; `media.source` no longer takes `'google'`.
7. **Google map**: `@vis.gl/react-google-maps` and `@googlemaps/markerclusterer`. `MapView` picks the Google or MapLibre implementation from `googleEnabled`, with the same props; route lines, place dots, clusters, selection sync with the list, bottom padding following the sheet so the Google logo stays visible, one map instance per page. Check 1,000 places on a mid-range phone; if slow, use deck.gl's `GoogleMapsOverlay` for the dots.
8. **"From Google" section** in `PlaceDetailView`, loaded in the browser after the details show, only when `googleEnabled`: photos with author credit (first one now, the rest on swipe, at most 5), rating and count, up to 5 reviews with author name, photo and link, "See on Google Maps" (`googleMapsUri`). Hidden when there is no gap, no id or no budget. Our own photos and reviews always come first. On the place page (no map) the section is labelled "From Google" in text.
9. Playwright keeps running without Google keys; add a unit test that `/api/places/[slug]/google` asks only for the fields of the gaps and makes no call when the budget is used up.

**Done when:** with the keys set on a preview deploy, the planner shows a Google map with routes and clustered places; opening a place with no photos of our own shows Google photos and reviews with credit and the exact "Open in Google Maps" link; opening a place that has our photos and 3+ reviews makes no Google call (check the `google_usage` table); nothing from Google is in the DB but place ids; without the keys the app looks and works as before.

## Growth G2 · Near me

Decided 2026-09-30: well-known places around the rider, by road time. Design in "Nearby search" (`02-architecture.md`), the product in `01-product-spec.md` (features 12–15), the look in `08-design.md`. One commit per step.

1. **`places_near_point`** (migration 0012, a new function only): verified places within a radius of a point, most worthwhile first. `placesNearDb` in `nearbyService.ts`.
2. **OSRM table**: `RoutingTableProvider` (one source to at most 99 destinations), sharing the routing throttle, 6 s timeout, cached in `route_cache` under `table:v1:`.
3. **`GET /api/places/near`**: candidates by fame spread over distance, one table request, places over the time dropped; straight-line fallback; ride mode without OSRM. Position rounded to 3 decimals, `no-store`, never logged.
4. **Maps**: shared `DynamicMapView`; place pins; "you are here" dot; framing without routes; tap on the map.
5. **`/nearby`**: Use my location (on a tap only) / type a place / pick on the map; 30 min to half a day; Bike / Car; top 20 nearest first; category chips; details; link from the planner.
6. **Ride there** from a place to the planner.
7. **Use my location** in the planner's start field.
8. **In season** badge and ranking boost.
9. **Ahead of you** ride mode: heading from the device or movement, a cone ahead, wake lock.

**Done when:** at Sakleshpur, "Within 1 h by bike" lists Manjarabad Fort first (about 7 min); nothing asks for the position until a tap; the URL and requests carry 3 decimals; Ride there routes in the planner; ride mode heading north from Sakleshpur shows Belur and not Bisle; `tests/e2e/nearby.spec.ts` passes on desktop and at 375 px.

Next ideas (not built): label "My location" by the nearest town from our own data ("Near Hassan") for shared trips; an offline copy of the last Near me list for ride mode in areas without signal.

## Growth G3 · Showcase

Decided 2026-10-02: give the app an identity people can see and share ("see every hairpin, climb and stop on your road before you ride it"), and make the repo easy to run from a clone. The product is in `01-product-spec.md` (features 16–24), the design in `02-architecture.md`, the look in `08-design.md`. Steps in order, most visible first; one commit each. Migrations are additive only (the dev database is production).

1. **README, LICENSE, screenshots**: `README.md` (pitch, features, how it works, stack, data and licences), MIT `LICENSE`, `pnpm screenshots -- --base=<url>` (Playwright, phone 390×844 and desktop 1440×900, into `docs/media/`).
2. **Hairpins and twistiness** on each route card, from the route's shape (`src/lib/curvature.ts`): bend radius from each three points 25 m apart, weighted as on roadcurvature.com; a hairpin is a turn of 150° or more within 125 m that reverses the heading.
3. **Terrain tiles provider** (`src/server/providers/elevation/`): heights from AWS Terrain Tiles (Terrarium PNGs, SRTM for India, no key), decoded with `fast-png`.
4. **Elevation profile API** `POST /api/route/profile`: heights every 100 m, smoothed, ascent and descent, climbs of 200 m or more at 3% or steeper named after the nearest town, about 300 points for the chart; cached in `route_cache`.
5. **Planner header** moved out of `Planner.tsx` (no change in behaviour).
6. **Elevation profile in the planner**: an area chart under the route cards with ghats tinted, places as dots, and a scrubber that moves a marker on the map; a climb chip on each card.
7. **3D ride preview**: a full-screen MapLibre view that flies along the route over 3D terrain, slower in ghats, with a heads-up display (km, height, climb) and place cards as it passes them. Play, pause, scrub, speed. No autoplay under reduced motion.
8. **Ride story poster** `GET /og/story`: a 1080×1920 image (route shape, km, time, climb, hairpins, top stops) to share to Instagram stories or WhatsApp status from the phone's share sheet.
9. **Save the preview as a video**: the 3D preview recorded in the browser (MP4 where the browser can, WebM otherwise) with its credits drawn in.
10. **Famous rides data**: table `ride` (migration 0013), `data/rides.json` with about 20 well-known rides, `pnpm rides:lookup` for coordinates, `pnpm db:seed-rides` that routes each ride once, checks it passes its checkpoints, and stores the route with its profile and hairpins.
11. **Famous ride pages** `/rides` and `/rides/[slug]` (stats, profile, places, best months, Plan this ride, Preview in 3D, JSON-LD, share card, sitemap), and "Try a famous ride" on the empty planner.
12. **Site navigation, About, 404 and error pages**: About tells the story, how it works, the stack, and every data source with its licence.
13. **Usage numbers**: table `usage_daily` (migration 0014) counting routes planned per day; Vercel Web Analytics; "N rides planned · M places · K trips saved" on About.
14. **AI trip provider** (`src/server/providers/llm/`): Claude (`ANTHROPIC_TRIP_MODEL`, default `claude-haiku-4-5`) turns a sentence into a trip intent through structured outputs.
15. **Plan in plain words**: `POST /api/trip-from-words` (6 per visitor per hour, 200 per day) resolves the intent's places through our place search and opens the planner. Hidden without `ANTHROPIC_API_KEY`; the text is never stored or logged.
16. **OSM tile loop** moved out of the place import so a second import can share it (no change in behaviour).
17. **Service points**: table `service_point` (migration 0015) for hospitals, police, ATMs, tyre and repair shops and stays, kept apart from places (no pages); `pnpm db:import-services -- --region=<name>`; SQL function `services_along_route`.
18. **Safety stops** on the route: chips with counts per 50 km, pins on the map, tap to call, and the longest stretch without a hospital in the ride check.
19. **Multi-day split**: riding hours per day (6 by bike, 8 by car), overnight towns near each split with stays nearby, day sections in the list and on the road strip, one GPX track per day.
20. **One-command data setup**: `pnpm db:export-snapshot` writes our public tables to gzipped CSV with a manifest (licence ODbL, OpenStreetMap-derived), uploaded to a GitHub Release; `pnpm db:setup` runs the migrations and loads the latest snapshot into an empty database; `--from-sources` rebuilds from OpenStreetMap instead.
21. **README from clone to deployment, docs refresh**: every step and setting from `git clone` to a Vercel deploy; docs 02, 03, 08, CLAUDE.md and `.env.example` brought up to date; fresh screenshots.

**Done when:** Bengaluru → Kalasa via Sakleshpur shows about 24 hairpins on the Kottigehara–Kalasa ghat, the climb out of Kottigehara on the profile, and a 3D preview that flies the route and saves as a video; its story poster shares to WhatsApp; `/rides` lists the famous rides and each opens in the planner; "2-day monsoon ride from Pune with waterfalls" fills the planner (with a key); safety chips count hospitals along the road; a 2-day split names an overnight town; on an empty Supabase project, the README alone gets from `git clone` through `pnpm db:setup` to a Vercel deploy.

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
