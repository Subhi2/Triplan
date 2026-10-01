# 02 · Architecture

## Overview

```
Browser (Next.js client; Google Maps JS with a key, MapLibre without)
   │  fetch /api/*
   ▼
Next.js route handlers (src/app/api/*)  ──►  src/server/services/*
                                                │
             ┌──────────────────┬───────────────┼──────────────────┬──────────────────┐
             ▼                  ▼               ▼                  ▼                  ▼
      RoutingProvider   GeocodingProvider   Postgres+PostGIS   Social providers   Google Places (New)
      (OSRM)            (Photon, Nominatim) (Supabase)         (YouTube,          gap-filling only,
                                                                Instagram)         daily budget
                                                ▲
                                   Scheduled jobs (src/jobs/*)
                                   discovery, rating refresh
```

## Folder layout

```
src/
  app/
    page.tsx                    # trip planner
    nearby/page.tsx             # Near me: well-known places within reach of a point
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
      places/near/route.ts      # GET ?lng&lat&within&vehicle&categories&mode -> NearbyResponse
      places/[slug]/route.ts    # GET -> PlaceDetail
      trips/route.ts            # GET list, POST save
      trips/[id]/route.ts       # GET, PATCH {title?, plan?}
      reviews/route.ts
      contribute/route.ts
      admin/*
  components/
    map/                        # MapView (picks one of the two below), maplibre/, google/ (RouteLayer, PlaceMarkers each)
    trip/                       # Planner, TripForm, StopInput, RouteCards, AddToTrip, TripSaveBar
    place/                      # PlaceList, PlaceRow, PlacePanel, PlaceDetailView, MonthStrip, CarryList
    ui/                         # buttons, chips, sheet
  server/
    db/                         # drizzle schema, client, migrations
    og/                         # share card layouts and their bundled fonts
    providers/
      routing/                  # RoutingProvider interface, osrm.ts, google.ts (later)
      geocoding/                # GeocodingProvider, photon.ts (suggestions), nominatim.ts (Enter)
      google/                   # places.ts (Places API New), budget.ts (daily call budget)
      social/                   # youtube.ts, instagram.ts
      llm/                      # extractPlace.ts (Anthropic API)
    services/
      routeService.ts
      corridorService.ts
      nearbyService.ts          # places_near_point + OSRM table (Near me)
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

### Hairpins and twistiness

`src/lib/curvature.ts` (`RouteOption.curvature`, computed in `getRoutes`) follows the method roadcurvature.com describes, written as our own code. The route is resampled every 25 m; at each sample the circle through it and its neighbours gives the bend radius, R = s / (2·sin(θ/2)). Each 25 m is weighted by radius: over 175 m 0, 100–175 m 1, 60–100 m 1.3, 30–60 m 1.6, 30 m or less 2. The sum is the route's `curvatureM`; `twistyKm` is the road whose surrounding km reaches 450 weighted metres, labelled Straight (under 5 km), Some bends, Twisty (25 km or more) or Very twisty (60 km or more).

A hairpin is a stretch of at most 125 m that turns 150° or more, leaves heading the other way (the headings 50 m before and after differ by 150° or more) and turns no more than 240° in all: roundabouts leave in the direction they came and loop ramps turn too far. Hairpins within 100 m are one; the first and last 300 m and 300 m around each stop are skipped, because the router may turn round there. Calibrated on Pollachi → Valparai (40 numbered hairpins above Aliyar; we find 40) and the Kottigehara–Kalasa and Gudalur–Ooty ghats. The public OSRM server does not route the Kalhatti ghat (Masinagudi–Ooty) in either direction, so it is neither a fixture nor a famous ride.

### Elevation profile

`POST /api/route/profile { routeId | geometry }` → `{ profile }` (`src/server/services/elevationService.ts`, pure parts in `src/lib/elevation.ts`). Loaded after the route cards show, like places, so routing never waits for it.

- **Heights**: `ElevationProvider` (`src/server/providers/elevation/`) reads AWS Terrain Tiles: global Terrarium PNGs (height = R·256 + G + B/256 − 32768), SRTM for India, open data, no key, CORS open for the browser. Credit: "AWS Terrain Tiles (Mapzen) · SRTM, GMTED2010 courtesy of USGS · ETOPO1 NOAA" (`TERRAIN_ATTRIBUTION`). Mapterhorn was considered and does not cover India. The URL template is `NEXT_PUBLIC_TERRAIN_TILES_URL`, shared with the 3D preview; every use goes through `src/lib/terrain.ts`.
- **Sampling**: a point every 100 m; zoom 12 (about 37 m a pixel, close to SRTM's own resolution), coarser when a route would need more than 160 tiles (a 1,000 km route needs about 130). Tiles are decoded with `fast-png` (pure JS, no native code on Vercel), six fetched at a time, 64 decoded tiles kept per server instance; heights are bilinear between pixel centres.
- **Cleaning**: gaps filled by straight lines (more than 10% missing and there is no profile), a median of 5 for bridge and valley spikes, then heights are kept under a 12% slope from either side, because the tiles show the hill above a tunnel (Katraj on NH48 is only partly flattened: the profile can still show a bump over a long tunnel), then a mean of 3. Ascent and descent ignore wiggles under 10 m.
- **Climbs**: runs of road whose gradient over the surrounding km is 2% or more, carried over flat gaps up to 1 km that lose at most 40 m, measured from their lowest to highest point; kept at 200 m or more at an average of 3% or more. Descents are climbs read backwards. Each is named after the town (from `townsAlong`) nearest its top within 15 km. Checked on real routes: Aliyar–Valparai 853 m at 5.3%, Gudalur–Naduvattam 1,096 m at 5.3%, Khambatki 237 m, the Amboli descent 659 m.
- **Output**: about 300 points (`[km, m]`, downsampled with Largest-Triangle-Three-Buckets so peaks survive), ascent, descent, highest and lowest points, climbs; about 5 KB. Cached in `route_cache` under `elev:v1:<route id>` (or a hash of the geometry) for 7 days.

The public OSRM server reports no road classes (tunnels, tolls), so tunnels cannot be taken from the route.

### Suggesting "via" towns

To show "via Sakleshpur" vs "via Chikkamagaluru" labels on route cards, find the largest towns (OSM `place=town|city`) within 2 km of each route that are not within 2 km of the other routes. Show the top 1–2 as the card label. Store towns in `place` with category `town`, or a separate `settlement` table.

As built (`src/server/services/viaLabel.ts`): towns are `place` rows with category `town`, imported from OSM with `population`. Each alternative is labelled with its largest unique town plus its last unique town before the destination (usually the ghat riders name the route by), in road order: "via Hassan, Sakleshpur". A lone route uses its largest town; with via stops, the stops name the route.

## Place search (start, destination and stops)

`StopInput` searches as the rider types, through `GET /api/geocode`:

1. **Suggestions while typing** (`source=suggest`, 300 ms after typing stops, 2+ characters). The request carries the map centre and zoom (`lat`, `lon`, `zoom`). `suggestService.suggestPlaces` returns:
   - our own places first (`placeService.searchPlacesByName`: curated and imported places and towns; exact name or alternative name, then prefix, then substring, then close misspellings via trigram similarity ≥ 0.45; towns first within each tier; at most 4), then
   - **Photon** results (`providers/geocoding/photon.ts`, `https://photon.komoot.io/api`): restricted to India (bbox, `countrycode=IN`), biased to the map centre with a radius set by the zoom, `lang=en`, waterways excluded. Photon tolerates typos and knows villages we have not imported. Results that duplicate one of ours (same OSM id, or the same name within 3 km) are dropped. A Photon result named exactly what was typed comes before our places found only as a misspelling ("Samse", the Karnataka village, before "Samsi", a West Bengal town, for "samse"). At most 8 suggestions in all. If Photon fails, our places still come back.
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

## Nearby search (Near me)

The `/nearby` screen lists well-known places the rider can reach from one point (their position, a typed place or a point tapped on the map) within 30 min, 1 h, 2 h or half a day, measured on the road. Straight-line radius is misleading in the ghats, where a place 20 km across a valley can be 60 km by road.

1. **Candidates** (`places_near_point`, migration 0012): verified places within a generous straight-line radius (the time at 60 km/h, bikes 10 % slower, at most 250 km), most worthwhile first. Priority is the same as for the corridor: category weight, +1 when curated, +0.5 with a Wikidata link. At most 400 rows.
2. **Fame**: `priority + rating / 5 + 0.3 if trending` (`fameScore` in `src/lib/nearby.ts`). Google ratings are never used: they may not be stored.
3. **Road times**: `pickCandidates` keeps the best 99 spread over four distance rings (so a half-day search does not spend every slot at the edge), and **one** OSRM `table` request (`/table/v1/driving/{origin;d1;...}?sources=0&annotations=duration,distance`) gives road km and time to each. The public server allows 100 coordinates per table request, origin included. The request shares the 1 request/s throttle with routing and has a 6 s timeout (the service worker falls back to its cache for `/api/*` after 10 s). Places over the time, or with no road, are dropped; the rest are ordered by ride time.
4. **Fallback**: if OSRM fails, places within a straight-line guess (35 km/h) are shown by distance, and the response says `roadTimes: "straight"` so the screen can say so.
5. **Ride mode** (`mode=ride`, "Ahead of you"): everything worthwhile within 35 km, straight line, no OSRM. The phone filters to a cone around the heading as the rider moves and asks again at most every 2 km and 60 s.

Caching: table answers go in `route_cache` for 7 days under `table:v1:` keys (origin at 3 decimals, destinations, profile).

Privacy: the position is only ever taken on a tap (never on page load) and is rounded to 3 decimals (~100 m) before it reaches a URL, a request, a cache key or a trip stop. `/api/places/near` answers `Cache-Control: private, no-store`, stores nothing, and logs only error messages, never the request or the position. Saved trips are public (`/trips`), which is why "My location" as a trip start is rounded too.

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

`src/lib/googleMaps.ts` builds links to Google Maps with the documented Maps URLs; nothing is fetched from Google or stored. A place's link (on its list row and in its details) searches its name with the map at its exact coordinates (`/maps/search/<name>/@lat,lng,17z`; the documented `api=1` form cannot search at a position, and a name-and-state search listed every match in the state). A unique name opens that place's page with photos and reviews; a common name ("Shiva Temple") still lists matches, with the map on the right spot. Once a place's Google place id is known (see "Google Maps Platform" below) the link opens that exact place (`/maps/search/?api=1&query=<name>&query_place_id=<id>`). Ticked places open with the trip as directions (`/maps/dir/?api=1&origin=&destination=&waypoints=`, coordinates, `travelmode=driving` since Maps URLs have no two-wheeler mode): via stops and ticked places are sorted by their distance along the selected route, places already in the trip are not repeated, and more than 9 stops gives no link.

## Google Maps Platform (fills gaps only)

Decided 2026-09-29. Our own data stays the core: OSM import, curated guides, Wikimedia photos, OSRM routes, Photon search and the PostGIS corridor search. Google is called only where we have a gap, and every call must fit inside Google's free monthly usage.

### What Google fills

| Gap | Google call | SKU (India price list) | When |
|---|---|---|---|
| Exact place on Google Maps | Text Search (New), field mask `places.id`, `locationRestriction` rectangle about 600 m around our pin, the place name as the query | Text Search Essentials (IDs only): free, unlimited | Once per place, the first time its details open; the id is stored in `place.google_place_id` |
| No photos of our own | Place Details (New), field mask `photos` | Place Details Essentials (IDs only): free, unlimited | Details open and the place has no verified `media` |
| The photos themselves | Place Photo (New) media, `maxWidthPx=800` | Place Details Photos: 7,000 free/month, then $2.10 per 1,000 | First photo when details open, the rest (up to 5) only as the gallery is swiped |
| Fewer than 3 reviews of our own | Place Details (New), adding `rating,userRatingCount,reviews,googleMapsUri` | Place Details Enterprise + Atmosphere: 7,000 free/month, then $7.50 per 1,000 | Details open |
| The map | Maps JavaScript API | Dynamic Maps: 70,000 free/month, then $2.10 per 1,000 | Each page load that shows a map |

One Place Details request asks for the fields of every gap the place has, and is billed once at the tier of its most expensive field. A place with our own photos and reviews makes no Google call except the one-time id lookup.

Not filled by Google: the place list and map markers (a rating per row would be one Enterprise request per row), route search, typing suggestions, geocoding and the OSM import. Finding places Google knows but OSM does not (Text Search along the route) is left for later, and only if riders report gaps: those places could not be stored, so they would live only as long as the page.

### Terms that shape the code

- **Google content only with a Google map** (ToS 3.2.3(e): no Places content on or near a non-Google map). `MapView` shows the Google map when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set and MapLibre otherwise; Google photos, ratings and reviews are requested only when the Google map is the one in use, or on a screen with no map (the place page).
- **No storage or caching** (ToS 3.2.3(b)) except `place.google_place_id`. `GET /api/places/[slug]/google` fetches live, answers with `Cache-Control: private, no-store`, and is called from the browser after the page loads, so nothing Google returns ends up in the DB, ISR HTML, the sitemap, JSON-LD or share cards. Photos go through `GET /api/google/photo?name=`, which redirects to Google's short-lived `photoUri` and never proxies or stores the bytes.
- **Attribution:** each photo shows its `authorAttributions` (name linked to its `uri`), each review its author name, photo and link, and the Google section is labelled "From Google". The Google logo on the map must stay visible, so the map's bottom padding follows the sheet height; the place page (no map) shows "Google" as text next to the Google section.

### Keys, budget and limits

- **One key** (decided 2026-09-30): `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, limited to the Maps JavaScript API and the Places API (New), with no application restriction (a website restriction would refuse the server's calls, and Vercel has no fixed outbound IP on Hobby). The map uses it in the browser and the server uses it for Places calls. It is visible in the page, so the per-day quotas in the Cloud console are what cap the cost if someone copies it. `GOOGLE_MAPS_API_KEY`, when set, is used by the server instead (a separate key limited to Places, if ever wanted). `NEXT_PUBLIC_GOOGLE_MAP_ID` is optional (Advanced Markers; Google's `DEMO_MAP_ID` otherwise).
- **Daily budget in the app** (`src/server/providers/google/budget.ts`, counted in a `google_usage` table per day and SKU): 225 Enterprise + Atmosphere requests and 225 photos a day (7,000 a month ÷ 31), 2,000 ID lookups. When a day's budget is used up, the Google section is simply not shown until the next day (UTC), and "Open in Google Maps" falls back to the name-at-coordinates link.
- **Quotas in the Cloud console**, which also cover calls made with a copied key: Maps JavaScript map loads 2,250 a day, and per-day request caps on the Places methods at the same numbers. A budget alert (e.g. ₹500) only sends an email; the quotas are what stop usage.
- The numbers assume the billing account gets the India price list (an Indian billing address billed through Google Cloud India; Google does not state the rule). If the account shows global pricing, the free caps are 1,000 a month for Enterprise + Atmosphere and photos and 10,000 map loads: lower the budget to 30, 30 and 320 a day.

### Map on Google

`@vis.gl/react-google-maps` (MIT, maintained by vis.gl with Google): routes as `Polyline`s (selected one thick, others thin and dashed with repeated symbols), place dots as Advanced Markers clustered with `@googlemaps/markerclusterer`. If 1,000 markers are slow on a mid-range phone, draw the dots with deck.gl's `GoogleMapsOverlay` instead. `gestureHandling: "greedy"` so one finger pans, as today. The map is created once per page and kept across route and place changes, since each new map is a billed load. Map tiles from Google cannot be saved offline, so the offline trip pack (G2.6) uses the MapLibre view with no Google content in it.

### As built (2026-09-30)

- Keys: `src/server/env.ts` (the server uses `GOOGLE_MAPS_API_KEY` if set, else `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) and `src/lib/google.ts` (`googleEnabled`, true when the key is set; the Map ID falls back to Google's `DEMO_MAP_ID`).
- Budget: `providers/google/budget.ts`, `google_usage` table (migration `0010`). A photos-only Place Details request is free and counts under `ids`.
- Provider: `providers/google/places.ts`. Place ids and photo names are checked against Google's formats before they go into a URL.
- Service: `services/googleGapService.ts` (`getGoogleGapFill`, `getGooglePlaceId`). An id Google answers 404 for is cleared, so the next visit looks it up again. `external_rating` is dropped (migration `0011`).
- Routes: `GET /api/places/[slug]/google` (gap fill), `GET /api/places/[slug]/google-maps` (redirect to the exact place, used by "Open in Google Maps" while the id is not known yet), `GET /api/google/photo?name=` (redirect to Google's photo URL). All three send `Cache-Control: private, no-store`.
- Map: `components/map/google/` (`GoogleMapView`, `GoogleRoutes`, `GooglePlaceMarkers`, `useGoogleFraming`) with the same props as the MapLibre `MapView` (`components/map/types.ts`); the planner loads one or the other. Place dots are Advanced Markers clustered by `@googlemaps/markerclusterer` with its viewport algorithm, so only the markers in view are placed. On phones the map ends where the sheet begins (its height shrinks by the sheet's height), which keeps Google's logo and terms visible.
- Place details: `components/place/FromGoogle.tsx`, after our own photos. With Google on, the "No photos yet" box is left out, since Google's photos fill that gap.

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
- **The map:** no zoom buttons on touch screens (pinch to zoom), compact attribution (on Google, the logo and terms stay above the sheet), white clusters with a teal ring so the teal route stays visible, and an invisible 20 px circle under each place dot so a finger can hit it.
- **Safe areas:** `viewport-fit=cover`, with `env(safe-area-inset-*)` padding at the top of the header and the bottom of the sheet and the Google Maps bar, so nothing sits under a notch or the home bar.
- **Bias hints never fail a search:** the map zoom sent with suggestions is clamped to 0–22 (a small map fits India below zoom 0).

## Ranking

Default list order is by km. Also compute a `score` for "top picks" badges:
`score = bayesian_rating * log(1 + review_count) * category_weight - detour_km * 0.05 + trending_boost`.

## Caching

- Route responses: DB cache, 7 days. OSRM table answers (Near me) share the table under `table:v1:` keys.
- Geocoding: DB cache (`geocode_cache`), 30 days, keyed by provider, query and the map bias rounded to a 0.5° grid. Throttle Nominatim to 1 req/s with a queue; Photon requests are debounced 300 ms in the browser and spaced 200 ms apart on the server.
- Places along route: no cache needed at MVP scale; add one keyed on (route hash, corridor, categories) if needed.
- Next.js: place detail pages are statically generated with revalidation (ISR, 1 hour).
- Google: nothing is cached except `place.google_place_id` (see "Google Maps Platform").

## Auth and security

- No sign-in for the MVP: the app is open, and saved trips have no owner (see "Saved trips"). If accounts are added later: Supabase Auth, with server components reading the session through `@supabase/ssr`.
- Row Level Security on every user-writable table (`review`, `trip`, `place_submission`, `media` uploads): users can read public rows and write their own; admins (role in `profile.role`) can moderate.
- API route handlers validate input with Zod and rate-limit writes per user (e.g. 20 reviews/day).
- Uploaded images: max 8 MB, resized to 1600 px and 400 px thumbnails, EXIF location stripped unless the user opts in to use it as the place pin.

## Deployment

Vercel (Hobby, free, non-commercial) runs the app; the database stays on Supabase (free, `ap-south-1`). Every push to `main` deploys to production; pushes to other branches get preview URLs.

- `vercel.json` pins serverless functions to Mumbai (`bom1`), next to the database, and runs a daily cron on `/api/health`. The health check queries the database, which keeps the free Supabase project from pausing (it pauses after 7 days without activity), and clears old write-limit counters.
- `DATABASE_URL` on Vercel is Supabase's **transaction pooler** (port 6543), not the session pooler used in development: serverless instances come and go, and the session pooler allows only 15 connections for the whole project. Queries already run with `prepare: false`, which the transaction pooler needs.
- Required settings: `DATABASE_URL` and `NOMINATIM_USER_AGENT`; the routing and geocoding URLs have defaults. `WRITE_LIMIT_SALT` is optional. The Google keys are optional: without them the app runs as before on MapLibre with no Google content.
- `/api/route` may run up to 60 s (`maxDuration`): up to four OSRM requests, spaced 1 s apart. `/api/places/near` may run 30 s (one OSRM table request after a database query).
- Saving and renaming trips is limited to 30 per visitor per hour (`writeLimit.ts`), counted in the `write_limit` table under a salted hash of the IP address.
- Moving to Vercel Pro or Cloudflare Workers Paid is needed before commercial use (see the comparison of 2026-09-29: Cloudflare's free plan allows 10 ms of CPU per request, and a route search needs 15-20 ms).

## Testing

- Unit: geo utils, ranking, provider response parsing (with recorded fixtures in `tests/fixtures/`), LLM extraction parsing.
- Integration: `places_along_route` against a test DB with seed data (use the acceptance criteria in `01-product-spec.md`).
- E2E (Playwright): search Bengaluru → Kalasa, add via Sakleshpur, open Manjarabad Fort, add it to trip.
- Mock all external providers in tests; never hit OSRM, Nominatim, Photon, Overpass, Google, YouTube or Instagram in CI. Playwright runs without Google keys (MapLibre); the Google map and section are checked by unit tests on the provider and budget, and by hand on a preview deploy. Provider responses are recorded as fixtures (`pnpm fixtures:routes`, `pnpm fixtures:photon`), and the Playwright dev server gets an unreachable `PHOTON_BASE_URL`.
