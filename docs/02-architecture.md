# 02 · Architecture

## Overview

```
Browser (Next.js client, MapLibre)
   │  fetch /api/*
   ▼
Next.js route handlers (src/app/api/*)  ──►  src/server/services/*
                                                │
             ┌──────────────────┬───────────────┼──────────────────┐
             ▼                  ▼               ▼                  ▼
      RoutingProvider   GeocodingProvider   Postgres+PostGIS   Social providers
      (OSRM)            (Photon, Nominatim) (Supabase)         (YouTube, Instagram)
                                                ▲
                                   Scheduled jobs (src/jobs/*)
                                   discovery, rating refresh
```

## Folder layout

```
src/
  app/
    page.tsx                    # trip planner
    place/[slug]/page.tsx       # place page (ISR, 1 hour)
    trips/page.tsx              # everyone's saved trips
    trips/[id]/page.tsx         # the planner opened with a saved trip (its share link)
    place/[slug]/opengraph-image.tsx, trips/[id]/opengraph-image.tsx   # share cards
    og/plan/route.tsx           # share card of an unsaved planner link
    sitemap.ts, robots.ts
    contribute/, admin/
    api/
      geocode/route.ts          # GET ?q=
      route/route.ts            # POST trip -> routes
      places/along/route.ts     # POST {routeId | geometry, corridorKm, categories}
      places/[slug]/route.ts    # GET -> PlaceDetail
      trips/route.ts            # GET list, POST save
      trips/[id]/route.ts       # GET, PATCH {title?, plan?}
      reviews/route.ts
      contribute/route.ts
      admin/*
  components/
    map/                        # MapView, RouteLayer, PlaceMarkers
    trip/                       # Planner, TripForm, StopInput, RouteCards, AddToTrip, TripSaveBar
    place/                      # PlaceList, PlaceRow, PlacePanel, PlaceDetailView, MonthStrip, CarryList
    ui/                         # buttons, chips, sheet
  server/
    db/                         # drizzle schema, client, migrations
    og/                         # share card layouts and their bundled fonts
    providers/
      routing/                  # RoutingProvider interface, osrm.ts, google.ts (later)
      geocoding/                # GeocodingProvider, photon.ts (suggestions), nominatim.ts (Enter)
      social/                   # youtube.ts, instagram.ts
      llm/                      # extractPlace.ts (Anthropic API)
    services/
      routeService.ts
      corridorService.ts
      placeService.ts
      discoveryService.ts
  jobs/
    discover.ts                 # hidden places job (CLI + cron)
  lib/                          # shared types, zod schemas, geo utils, formatting
scripts/
  seed.ts
tests/
  unit/, e2e/
```

## Routing

### Interface

```ts
export interface RoutingProvider {
  route(input: {
    waypoints: [number, number][];   // [lng, lat], start, ...vias, end
    alternatives: boolean;
    profile: "bike" | "car";
  }): Promise<RouteResult[]>;
}

export interface RouteResult {
  geometry: GeoJSON.LineString;      // full resolution
  distanceM: number;
  durationS: number;
  legs: { distanceM: number; durationS: number; summary: string }[];
  roads?: { distanceM: number; ref: string | null }[]; // road stretches in order ("NH75")
}
```

### OSRM notes

- Request: `GET {OSRM_BASE_URL}/route/v1/driving/{lng,lat;lng,lat;...}?overview=full&geometries=geojson&alternatives=2&steps=true`. Steps are only read for each road stretch's number (`ref`: "NH75", "SH 57"), kept on `RouteResult.roads`.
- OSRM only returns alternatives when there are **exactly two** waypoints. With via stops, alternatives are not returned; that is fine because via stops mean the user chose the path.
- OSRM often finds fewer than 3 routes (Bengaluru → Samse: 2). `src/server/services/altRoutes.ts` tops them up by routing through a town: candidate towns lie on the way (start → town → end at most 15% longer in a straight line, 20–85% of the way along) and at least 8 km from every route found so far, most on-the-way first. A new route is kept if it is at most 20% longer and 15% slower than the best one and shares at most 80% of its length with an existing one. At most 3 towns are tried per search (one OSRM request each, cached like any route).
- The public demo server only has the car profile and is for light use. Use `driving` for both bike and car and scale duration by 1.1 for bikes. Self-host OSRM with the India extract from Geofabrik before launch.
- Cache route responses in a `route_cache` table keyed by a hash of (waypoints rounded to 5 decimals, profile, alternatives) for 7 days. The key carries a version (`route:v2`), bumped whenever `RouteResult` changes.

### Road mix on route cards

`src/server/services/roadMix.ts` splits each route's distance into national highway (NH/NE refs), state highway (SH refs), ghat and other roads; the parts do not overlap and add up to the route distance, with ghat sections counted as ghat whatever road they are on. OSM has no "ghat" tag, so ghats are found from the geometry: resampled every 25 m, a stretch that turns at least 300° per km (averaged over 2 km) for 2 km or more. This was calibrated on real routes (the Gudalur–Nilgiris climb to Ooty, Kottigehara–Samse, Khambatki and Amboli ghats) and is labelled approximate in the UI.

### Suggesting "via" towns

To show "via Sakleshpur" vs "via Chikkamagaluru" labels on route cards, find the largest towns (OSM `place=town|city`) within 2 km of each route that are not within 2 km of the other routes. Show the top 1–2 as the card label. Store towns in `place` with category `town`, or a separate `settlement` table.

As built (`src/server/services/viaLabel.ts`): towns are `place` rows with category `town`, imported from OSM with `population`. Each alternative is labelled with its largest unique town plus its last unique town before the destination (usually the ghat riders name the route by), in road order: "via Hassan, Sakleshpur". A lone route uses its largest town; with via stops, the stops name the route.

## Place search (start, destination and stops)

`StopInput` searches as the rider types, through `GET /api/geocode`:

1. **Suggestions while typing** (`source=suggest`, 300 ms after typing stops, 2+ characters). The request carries the map centre and zoom (`lat`, `lon`, `zoom`). `suggestService.suggestPlaces` returns:
   - our own places first (`placeService.searchPlacesByName`: curated and imported places and towns; exact name or alternative name, then prefix, then substring, then close misspellings via trigram similarity ≥ 0.45; towns first within each tier; at most 4), then
   - **Photon** results (`providers/geocoding/photon.ts`, `https://photon.komoot.io/api`): restricted to India (bbox, `countrycode=IN`), biased to the map centre with a radius set by the zoom, `lang=en`, waterways excluded. Photon tolerates typos and knows villages we have not imported. Results that duplicate one of ours (same OSM id, or the same name within 3 km) are dropped. At most 8 suggestions in all. If Photon fails, our places still come back.
2. **Enter** without picking a suggestion (`source=osm`) searches **Nominatim** as the fallback. Nominatim's public usage policy forbids search-as-you-type, so it is never called while typing.

Both providers sit behind the `GeocodingProvider` interface (`getSuggestionProvider()` and `getGeocodingProvider()`) and the `geocode_cache` table. The dropdown credits Photon or Nominatim and OpenStreetMap.

## Corridor search (places along the route)

Do it in one SQL query with PostGIS:

1. Simplify the route line (`ST_Simplify` with ~50 m tolerance in a metric projection) to keep queries fast.
2. Find places with `ST_DWithin(place.location, route::geography, corridor_m)`. The GIST index on `place.location` makes this fast.
3. For each place compute:
   - `km_from_start = ST_LineLocatePoint(route, place.location::geometry) * route_length_m / 1000`
   - `detour_m = ST_Distance(place.location, route::geography)` (straight line; label as approximate. Optionally refine the top results with an OSRM `table` request.)
4. Filter by category, status = `verified`, order by `km_from_start`.

```sql
WITH r AS (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g
), rl AS (
  SELECT g, ST_Length(g::geography) AS len FROM r
)
SELECT p.id, p.slug, p.name, c.slug AS category,
       ST_LineLocatePoint(rl.g, p.location::geometry) * rl.len / 1000 AS km_from_start,
       ST_Distance(p.location, rl.g::geography) AS detour_m,
       p.rating_avg, p.rating_count
FROM place p
JOIN category c ON c.id = p.category_id
CROSS JOIN rl
WHERE p.status = 'verified'
  AND ST_DWithin(p.location, rl.g::geography, $2)          -- corridor metres
  AND ($3::text[] IS NULL OR c.slug = ANY($3))
ORDER BY km_from_start
LIMIT 500;
```

Put this in a Postgres function `places_along_route(geojson text, corridor_m int, categories text[])` so the API calls one RPC.

As built (migrations `0004`–`0006`): the route line is parsed and simplified once (materialized CTEs), km and detour are measured on the simplified line too (fast with tens of thousands of imported places; detour is approximate anyway), and when more than 1000 places fall in the corridor the function keeps the most worthwhile ones (curated first, then Wikidata-linked, by category weight, nearest the route) before ordering by km, so long trips are never cut off before the destination. Towns are excluded unless requested by category. The places API leaves fuel stations out of the list by default (`PLACE_LIST_CATEGORIES` in `src/lib/categories.ts`; they are still imported for the planned fuel-range planner). The app then shows the "best stops" by default (`bestAlongRoute` in `src/lib/places.ts`: up to 5 places per 10 km); picking a category shows all of it.

## Place detail and "Add to trip"

`GET /api/places/[slug]` (`placeDetailService.getPlaceDetail`) returns a verified place with its guide fields, items to carry, verified photos, external ratings, linked videos and reviews. Imported places rarely have guide fields; their OSM tags fill in timings (`opening_hours`), entry fee (`fee`), website and Wikipedia links, labelled as from OpenStreetMap. The place page `/place/[slug]` and the planner's panel render the same `PlaceDetailView`; empty guide fields say "Not known yet".

In the planner, a place row opens the place in the side panel (desktop) or bottom sheet (mobile); with a place open, a map marker opens that place instead. "Add to trip" projects the place and every via stop onto the selected route (`metresAlong` in `src/lib/geo.ts`) and inserts the place before the first via stop further along (`viaInsertIndex` in `src/lib/trip.ts`), then the route is recomputed. A stop within 150 m of the place counts as the place.

### Photos from Wikimedia Commons

`pnpm db:import-photos [-- --limit=N]` (`photoImportService.ts`, provider `src/server/providers/wikimedia/`) gives places with a Wikidata id the item's main image (`P18`):

- Wikidata's query service returns the image file names for 200 items per request; the Commons API returns each file's author, licence, file page and a 960 px and 330 px URL for 50 files per request. The run pauses 1 s between requests and identifies itself with `NOMINATIM_USER_AGENT`.
- Only photos are kept (JPEG, PNG, WebP; no SVG maps or logos), and only files with a stated licence. Rows go into `media` with `source = 'wikimedia'`, `status = 'verified'`, the author as plain text and `author_url` set to the file's Commons page, where the full credit and licence are. The `utm_*` parameters Commons adds to URLs are dropped.
- Images are shown from Wikimedia's servers (`thumb.wikimedia.org`, `upload.wikimedia.org`), never copied. The place details show each photo with its author (linked to the file page), licence and "Wikimedia Commons"; list rows show the 330 px thumbnail without a credit, which is one tap away in the details.
- Every place looked up gets `place.photos_checked_at`, found or not, and is skipped for 90 days. Fuel stations and towns are skipped. Re-run after an OSM import to cover new places.

### Google Maps links

`src/lib/googleMaps.ts` builds links to Google Maps with the documented Maps URLs; nothing is fetched from Google or stored. A place's link (on its list row and in its details) searches its name with the map at its exact coordinates (`/maps/search/<name>/@lat,lng,17z`; the documented `api=1` form cannot search at a position, and a name-and-state search listed every match in the state). A unique name opens that place's page with photos and reviews; a common name ("Shiva Temple") still lists matches, with the map on the right spot. Opening the exact place every time needs its Google place id (`place.google_place_id`, via the Places API); planned in `04-build-plan.md` ("Later · Exact Google Maps links"). Ticked places open with the trip as directions (`/maps/dir/?api=1&origin=&destination=&waypoints=`, coordinates, `travelmode=driving` since Maps URLs have no two-wheeler mode): via stops and ticked places are sorted by their distance along the selected route, places already in the trip are not repeated, and more than 9 stops gives no link.

## Saved trips

Saved trips are open: no sign-in and no owners (`trip.user_id` stays empty, `is_public` is always true). `/trips` lists everyone's trips, most recently changed first, and `/trips/[id]` opens the planner with a trip; that URL is the share link. Anyone can rename a trip or save changes to it.

- Saving sends the stops, vehicle, corridor and the selected route (id, geometry, distance, time, label). The geometry is stored in `trip.route_geom`; the route id is stored so reopening selects the same route option (route ids are deterministic hashes of the routing request). Stops that match one of our places (same name within 150 m) get `trip_stop.place_id`.
- In the planner the URL keeps the working state (`/trips/[id]?from=...`), so a reload keeps unsaved edits; the bare link opens the saved version. The save bar shows "Changes not saved" when the stops, vehicle, corridor or selected route differ from the saved trip, with "Save changes" and "Save as new trip".
- The app server writes trips with the table owner's connection; the RLS policies on `trip` only matter for requests made with the Supabase keys.

## Share cards and search engines

Rides are planned in groups, and in India the plan goes to a WhatsApp group, so every link must unfurl into a useful card (see `07-growth-plan.md`).

- **Share cards** (1200 × 630 PNG, `next/og`), laid out in `src/server/og/shareCards.tsx` with bundled Noto Sans regular and bold (OFL; the built-in font has no bold):
  - a saved trip (`/trips/[id]/opengraph-image`): the route line (simplified to about 200 m), stops, distance, time and vehicle;
  - an unsaved planner link (`/og/plan?from=…&via=…&to=…&v=`): the stops joined with dashed lines. The home page sets it as the link's image when the URL holds a trip, and uses the trip as the page title;
  - a place (`/place/[slug]/opengraph-image`): its first photo, category, district and state, best months and best vehicle.
- **Share button** in the save bar: the phone's share sheet on touch screens (`navigator.share`), "WhatsApp" (`wa.me` link) and "Copy link" elsewhere. An unsaved trip shares the planner link; a saved one shares `/trips/[id]` unless it has unsaved changes.
- **Search engines**: `sitemap.xml` lists the verified places of every place-list category (not fuel stations or towns), richest first (a guide, a photo or a Wikidata id), up to 45,000 URLs, rebuilt daily. `robots.txt` allows everything but `/api/`. Place pages have a canonical URL and schema.org `TouristAttraction` JSON-LD (location, area, photo, rating, Wikipedia link). Saved trips are `noindex` because anyone can write them; their links still unfurl.
- Absolute URLs come from `siteUrl()`: `NEXT_PUBLIC_SITE_URL` when set (a custom domain), else Vercel's production domain (`VERCEL_PROJECT_PRODUCTION_URL`), else localhost.

## Ride check and GPX

**Ride check** (`RideCheck.tsx`, logic in `src/lib/rideCheck.ts`), under the save bar for the selected route. Open on wide screens; on phones one line ("Ride check · Fuel gap 38 km · Arrive 11:29") that opens on tap, so the place list stays in view.

- **Fuel**: fuel stations within 2 km of the route (the places API with `categories: ["fuel"]`; 18,000+ stations from OSM). The longest stretch between pumps, counting from the start and to the destination, is compared with the range on a full tank (default 200 km for a bike, 450 km for a car, remembered per vehicle in `localStorage`): "ok" up to 3/4 of the range, "tight" up to the range, "short" beyond it. The note says the stations come from OSM and some may be missing.
- **Daylight**: start time (default 06:00 tomorrow, the browser's time zone) plus riding time plus 15 minutes of breaks per full 2 hours gives the arrival. Sunset at the destination and civil dawn at the start come from `suncalc` (BSD-2, computed in the browser, no API). "day" arrives an hour or more before sunset, "dusk" within that hour, "dark" after it, with the latest start that still arrives an hour before sunset. It also flags a start before dawn and more than 10 hours on the road.
- **Weather** (`POST /api/weather`, `weatherService.ts`, provider `src/server/providers/weather/metno.ts`): the route is sampled every 40 km, at most 8 points, start and destination included; each point is named after a town within 10 km along the route, or "km N". Its arrival time is the start plus that share of the riding time and breaks, and the forecast step covering that time is taken from MET Norway's Locationforecast (free, commercial use allowed, CC BY 4.0, credited under the list). Rain per hour grades as dry (< 0.2 mm), light (< 1), rain (< 4) or heavy; a thunder symbol and wind from 10 m/s (36 km/h) are flagged. The summary names the wettest place and time. Past the forecast (about 9 days ahead) it says there is no forecast yet.
- Forecast requests snap to a 0.05° grid (about 5 km) with at most 2 decimals, identify themselves with `NOMINATIM_USER_AGENT`, run 4 at a time, and are cached for an hour in `geocode_cache` under `metno:` keys (the daily health check deletes them after a day). One point failing leaves it without a forecast; all failing is a 502. The browser waits 0.5 s after the start time changes before asking.
- The start time is kept in the planner (not in the URL) and shared by the daylight and weather checks.

**GPX export**: the "GPX" button in the bar at the bottom of the panel downloads `src/lib/gpx.ts`'s GPX 1.1 file: the selected route as a track, the stops as waypoints (flags: green start, blue stops, red destination) and the ticked places, or with none ticked the places in the list (at most 300), each described with its category and km. OsmAnd, Organic Maps, Komoot and GPS units navigate it offline. Built in the browser; nothing is sent to the server.

## Phone layout

Most riders plan on a phone, so the layout below 768 px is designed for it, and checked at 320, 360 and 390 px wide and in landscape (audit of 2026-09-29). The rules follow Apple's Human Interface Guidelines (44 pt touch targets), Material Design (48 dp) and WCAG 2.2 (2.5.8, target size):

- **Touch targets at least 44 px** high on phones (`min-h-11`), including tickboxes (the label around the box is the target), chips, links in rows and the sheet handle. Desktop keeps its denser sizes (`md:` variants).
- **Input text at least 16 px** on phones (`text-base md:text-sm`): iOS Safari zooms the page into any smaller input when it gets focus.
- **The map comes first.** No bottom sheet until there is a trip to show. Once start and destination are picked the form folds into a one-row header (the trip, "Trips", "Edit trip"), and the sheet opens at half height on the route cards. "Edit trip" drops the sheet to its smallest size, so the map stays in view.
- **Typing:** on touch screens the sheet slides away while a stop field has focus (the on-screen keyboard needs the room), and a tapped suggestion closes the keyboard. The suggestion list fits above the keyboard (sized from `window.visualViewport`) and scrolls, since the form itself does not.
- **Category chips** are one row that scrolls sideways on phones, so the places stay in view; they wrap on wider screens.
- **The map:** no zoom buttons on touch screens (pinch to zoom), compact attribution, white clusters with a teal ring so the teal route stays visible, and an invisible 20 px circle under each place dot so a finger can hit it.
- **Safe areas:** `viewport-fit=cover`, with `env(safe-area-inset-*)` padding at the top of the header and the bottom of the sheet and the Google Maps bar, so nothing sits under a notch or the home bar.
- **Bias hints never fail a search:** the map zoom sent with suggestions is clamped to 0–22 (a small map fits India below zoom 0).

## Ranking

Default list order is by km. Also compute a `score` for "top picks" badges:
`score = bayesian_rating * log(1 + review_count) * category_weight - detour_km * 0.05 + trending_boost`.

## Caching

- Route responses: DB cache, 7 days.
- Geocoding: DB cache (`geocode_cache`), 30 days, keyed by provider, query and the map bias rounded to a 0.5° grid. Throttle Nominatim to 1 req/s with a queue; Photon requests are debounced 300 ms in the browser and spaced 200 ms apart on the server.
- Places along route: no cache needed at MVP scale; add one keyed on (route hash, corridor, categories) if needed.
- Next.js: place detail pages are statically generated with revalidation (ISR, 1 hour).

## Auth and security

- No sign-in for the MVP: the app is open, and saved trips have no owner (see "Saved trips"). If accounts are added later: Supabase Auth, with server components reading the session through `@supabase/ssr`.
- Row Level Security on every user-writable table (`review`, `trip`, `place_submission`, `media` uploads): users can read public rows and write their own; admins (role in `profile.role`) can moderate.
- API route handlers validate input with Zod and rate-limit writes per user (e.g. 20 reviews/day).
- Uploaded images: max 8 MB, resized to 1600 px and 400 px thumbnails, EXIF location stripped unless the user opts in to use it as the place pin.

## Deployment

Vercel (Hobby, free, non-commercial) runs the app; the database stays on Supabase (free, `ap-south-1`). Every push to `main` deploys to production; pushes to other branches get preview URLs.

- `vercel.json` pins serverless functions to Mumbai (`bom1`), next to the database, and runs a daily cron on `/api/health`. The health check queries the database, which keeps the free Supabase project from pausing (it pauses after 7 days without activity), and clears old write-limit counters.
- `DATABASE_URL` on Vercel is Supabase's **transaction pooler** (port 6543), not the session pooler used in development: serverless instances come and go, and the session pooler allows only 15 connections for the whole project. Queries already run with `prepare: false`, which the transaction pooler needs.
- Required settings: `DATABASE_URL` and `NOMINATIM_USER_AGENT`; the routing and geocoding URLs have defaults. `WRITE_LIMIT_SALT` is optional.
- `/api/route` may run up to 60 s (`maxDuration`): up to four OSRM requests, spaced 1 s apart.
- Saving and renaming trips is limited to 30 per visitor per hour (`writeLimit.ts`), counted in the `write_limit` table under a salted hash of the IP address.
- Moving to Vercel Pro or Cloudflare Workers Paid is needed before commercial use (see the comparison of 2026-09-29: Cloudflare's free plan allows 10 ms of CPU per request, and a route search needs 15-20 ms).

## Testing

- Unit: geo utils, ranking, provider response parsing (with recorded fixtures in `tests/fixtures/`), LLM extraction parsing.
- Integration: `places_along_route` against a test DB with seed data (use the acceptance criteria in `01-product-spec.md`).
- E2E (Playwright): search Bengaluru → Kalasa, add via Sakleshpur, open Manjarabad Fort, add it to trip.
- Mock all external providers in tests; never hit OSRM, Nominatim, Photon, Overpass, YouTube or Instagram in CI. Provider responses are recorded as fixtures (`pnpm fixtures:routes`, `pnpm fixtures:photon`), and the Playwright dev server gets an unreachable `PHOTON_BASE_URL`.
