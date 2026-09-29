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

### Google Maps links

`src/lib/googleMaps.ts` builds links to Google Maps with the documented Maps URLs; nothing is fetched from Google or stored. A place's link is a search for "name, district, state" (`/maps/search/?api=1&query=`), which opens its Google Maps page with photos and reviews; a common name can match another place in the same district. Ticked places open with the trip as directions (`/maps/dir/?api=1&origin=&destination=&waypoints=`, coordinates, `travelmode=driving` since Maps URLs have no two-wheeler mode): via stops and ticked places are sorted by their distance along the selected route, places already in the trip are not repeated, and more than 9 stops gives no link.

## Saved trips

Saved trips are open: no sign-in and no owners (`trip.user_id` stays empty, `is_public` is always true). `/trips` lists everyone's trips, most recently changed first, and `/trips/[id]` opens the planner with a trip; that URL is the share link. Anyone can rename a trip or save changes to it.

- Saving sends the stops, vehicle, corridor and the selected route (id, geometry, distance, time, label). The geometry is stored in `trip.route_geom`; the route id is stored so reopening selects the same route option (route ids are deterministic hashes of the routing request). Stops that match one of our places (same name within 150 m) get `trip_stop.place_id`.
- In the planner the URL keeps the working state (`/trips/[id]?from=...`), so a reload keeps unsaved edits; the bare link opens the saved version. The save bar shows "Changes not saved" when the stops, vehicle, corridor or selected route differ from the saved trip, with "Save changes" and "Save as new trip".
- The app server writes trips with the table owner's connection; the RLS policies on `trip` only matter for requests made with the Supabase keys.

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

## Testing

- Unit: geo utils, ranking, provider response parsing (with recorded fixtures in `tests/fixtures/`), LLM extraction parsing.
- Integration: `places_along_route` against a test DB with seed data (use the acceptance criteria in `01-product-spec.md`).
- E2E (Playwright): search Bengaluru → Kalasa, add via Sakleshpur, open Manjarabad Fort, add it to trip.
- Mock all external providers in tests; never hit OSRM, Nominatim, Photon, Overpass, YouTube or Instagram in CI. Provider responses are recorded as fixtures (`pnpm fixtures:routes`, `pnpm fixtures:photon`), and the Playwright dev server gets an unreachable `PHOTON_BASE_URL`.
