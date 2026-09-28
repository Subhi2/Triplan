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
      (OSRM)            (Nominatim)         (Supabase)         (YouTube, Instagram)
                                                ▲
                                   Scheduled jobs (src/jobs/*)
                                   discovery, rating refresh
```

## Folder layout

```
src/
  app/
    page.tsx                    # trip planner
    place/[slug]/page.tsx
    trips/, contribute/, admin/, login/
    api/
      geocode/route.ts          # GET ?q=
      route/route.ts            # POST trip -> routes
      places/along/route.ts     # POST {routeId | geometry, corridorKm, categories}
      places/[slug]/route.ts
      trips/route.ts, trips/[id]/route.ts
      reviews/route.ts
      contribute/route.ts
      admin/*
  components/
    map/                        # MapView, RouteLayer, PlaceMarkers
    trip/                       # TripForm, StopInput, RouteCards
    place/                      # PlaceList, PlaceRow, PlaceSheet, MonthStrip, CarryList
    ui/                         # buttons, chips, sheet
  server/
    db/                         # drizzle schema, client, migrations
    providers/
      routing/                  # RoutingProvider interface, osrm.ts, google.ts (later)
      geocoding/                # GeocodingProvider, nominatim.ts
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
}
```

### OSRM notes

- Request: `GET {OSRM_BASE_URL}/route/v1/driving/{lng,lat;lng,lat;...}?overview=full&geometries=geojson&alternatives=true&steps=false`.
- OSRM only returns alternatives when there are **exactly two** waypoints. With via stops, alternatives are not returned; that is fine because via stops mean the user chose the path.
- The public demo server only has the car profile and is for light use. Use `driving` for both bike and car and scale duration by 1.1 for bikes. Self-host OSRM with the India extract from Geofabrik before launch.
- Cache route responses in a `route_cache` table keyed by a hash of (waypoints rounded to 5 decimals, profile, alternatives) for 7 days.

### Suggesting "via" towns

To show "via Sakleshpur" vs "via Chikkamagaluru" labels on route cards, find the largest towns (OSM `place=town|city`) within 2 km of each route that are not within 2 km of the other routes. Show the top 1–2 as the card label. Store towns in `place` with category `town`, or a separate `settlement` table.

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

## Ranking

Default list order is by km. Also compute a `score` for "top picks" badges:
`score = bayesian_rating * log(1 + review_count) * category_weight - detour_km * 0.05 + trending_boost`.

## Caching

- Route responses: DB cache, 7 days.
- Geocoding: DB cache, 30 days. Throttle Nominatim to 1 req/s with a queue.
- Places along route: no cache needed at MVP scale; add one keyed on (route hash, corridor, categories) if needed.
- Next.js: place detail pages are statically generated with revalidation (ISR, 1 hour).

## Auth and security

- Supabase Auth; server components read the session with `@supabase/ssr`.
- Row Level Security on every user-writable table (`review`, `trip`, `place_submission`, `media` uploads): users can read public rows and write their own; admins (role in `profile.role`) can moderate.
- API route handlers validate input with Zod and rate-limit writes per user (e.g. 20 reviews/day).
- Uploaded images: max 8 MB, resized to 1600 px and 400 px thumbnails, EXIF location stripped unless the user opts in to use it as the place pin.

## Testing

- Unit: geo utils, ranking, provider response parsing (with recorded fixtures in `tests/fixtures/`), LLM extraction parsing.
- Integration: `places_along_route` against a test DB with seed data (use the acceptance criteria in `01-product-spec.md`).
- E2E (Playwright): search Bengaluru → Kalasa, add via Sakleshpur, open Manjarabad Fort, add it to trip.
- Mock all external providers in tests; never hit OSRM, Nominatim, YouTube or Instagram in CI.
