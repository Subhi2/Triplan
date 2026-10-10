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
    trips/page.tsx              # the trips saved or opened on this device
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

### 3D ride preview

`src/components/ride/RidePreview.tsx`, loaded with `next/dynamic` only when "Preview the ride in 3D" is tapped, so MapLibre and the terrain stay out of the planner's bundle. It drives `maplibre-gl` directly (not `react-map-gl`), because the camera, the rider dot and the route's progress change every frame.

- **Always MapLibre**, full screen over whichever map the planner shows, with no Google content in it (Maps ToS 3.2.3(e)). Place cards use our own data only.
- **Terrain**: a `raster-dem` source of the same Terrarium tiles (`encoding: terrarium`, maxzoom 13, exaggeration 1.4) and a second source for hillshade (skipped on low-end devices: 4 cores or fewer, or 4 GB of memory or less). The tiles are served with `Access-Control-Allow-Origin: *`. The attribution stays expanded and adds the terrain credit.
- **Camera** (`src/lib/flyover.ts`, pure and unit tested): the route resampled every 50 m; the target averaged over ±150 m; the camera faces the road 1.2 km ahead (0.6 km in ghats); pitch 62°, zoom 11.6 on open road easing to 13.4 in ghats; bearing turns along the shorter arc with a 0.8 s time constant; padding keeps the rider low on the screen. Screen time is weighted: ghats ×4, the km around a hairpin or listed place ×3, so a 300 km route takes about 90 s at 1× (45–150 s by length).
- **Layers**: the route with a `line-gradient` on `line-progress` (done in teal, ahead in white), the listed places, and the rider as a circle layer updated with `setData` (no React render per frame). The HUD (km, height from the profile, ghat, climb grade) updates at 10 Hz.
- **Controls**: play / pause, 0.5×–4×, and a scrubber drawn over a small profile. Escape closes and focus returns to the opener.
- **Comfort and speed**: under reduced motion it opens on an overview and moves only when played or scrubbed. If frames average over 50 ms for 2 s it drops to pixel ratio 1, then turns the terrain off. Without WebGL it says so and points to the profile.
- MapLibre gives its container `position: relative`, so the container sits inside an absolutely placed box (an absolute container collapses to 0 px).

### Saving the preview as a video

"Save video" in the preview renders the whole ride into a 30 s, 30 fps, 9:16 video (1080×1920, or 720×1280 on low-end phones), frame by frame:

1. The map box turns portrait (as tall as the screen allows) and the live clock stops; the render loop drives the camera.
2. For each of the 900 frames: the camera, rider dot and route progress are set for that moment (bearing smoothed in video time), then the code waits until the tiles for the view have loaded (`areTilesLoaded()` after a render, at most 1.5 s), not for the map's `idle` event, which also waits out fades and cost about 300 ms a frame. Label fades are off (`fadeDuration: 0`).
3. The frame is drawn inside the map's `render` event (while its WebGL buffer still holds the picture, so no `preserveDrawingBuffer`) onto a 2D canvas by `drawFrame` (`src/components/ride/composite.ts`): the map cropped to fill, the trip and km card, the ghat and climb chips, the place being passed (text only, so nothing cross-origin taints the canvas), a progress strip over the profile, "Planned on Triplan · <host>", and the map attribution read from the map's own control plus the terrain credit. Credits are never cut: smaller type, then two lines.
4. Mediabunny (MPL-2.0, loaded only now) encodes it with WebCodecs at an exact timestamp per frame: H.264 in MP4 where the browser can (plays in Instagram, WhatsApp and on iPhones), VP9 in WebM otherwise, 4 Mbps (about 15 MB). Without `VideoEncoder` the button is hidden.

`MediaRecorder` on `canvas.captureStream()` was tried first and dropped: Chrome's MP4 recorder keeps wall-clock time across `pause()`, so waiting for tiles made a 40 s ride a 138 s video. Rendering takes one to a few minutes depending on the device and network; a progress bar and Cancel show meanwhile, and the finished video can be played back, shared as a file through the share sheet, or downloaded.

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

### What the places import takes

`pnpm db:import-osm` (`src/server/providers/osm/overpass.ts`, classified in `osmClassify.ts`), widened on 2026-10-05 after Mudumalai and Masinagudi turned out to be missing:

- **Temples**: every named Hindu, Jain and Buddhist place of worship. Before, only those with a Wikidata or Wikipedia link (26 of 2,842 in Karnataka). Names that only say "Temple" or "Mandir", and Goa's "… Prasanna" subsidiary shrines, are left out. The temple category weight is 0.9, so a small temple does not push a fort or waterfall out of the best stops; notable ones still get +1. Other religions still need a Wikidata or Wikipedia link.
- **Wildlife** (new category): national parks, wildlife and bird sanctuaries, tiger and elephant reserves and zoos (`isWildlife`). India maps thousands of reserved forests, biosphere reserves, eco-sensitive zones (ESZ) and buffer zones as protected areas too; those are left out. "WLS", "NP", "TR" and "Core Zone" are spelled out or dropped in names.
- **Also new**: dams, botanical gardens, theme parks and aquariums (attractions), galleries (museums), tombs, palaces, city gates and monasteries (heritage). Viewpoints and attractions named "… Falls" are waterfalls (Kalhatty Falls).
- **Villages**: well-known ones become town rows, so they label routes, can be overnight stops and come first in search: a Wikidata link, 5,000 people, or names in two or more languages (Masinagudi has Kannada, Malayalam and Tamil). About 1,000 of Karnataka's 21,000 villages. They count as 1,000 people when ranking "via" towns, name a route only when it passes no real town (else "via Hassan, Donigal" replaced "via Hassan, Sakleshpur"), and come first in search only on an exact name (`searchPlacesByName`); after that, towns starting with the query and our curated places rank ahead of the many plainly named temples and peaks.

- **Clean-up (G4, 2026-10-10)**: one place per name (plurals aside) across place categories, keeping the most specific (fort over heritage over attraction; `splitDuplicates`). The import closes copies an earlier run saved, because the OSM API check would keep them open. Names that only say what the place is ("Viewpoint", "Lake"), survey labels ("Pt 6080m", "Cave 3"), placeholders ("to be verified"), shepherd camps and names only in Chinese script are left out unless the place has a Wikidata or Wikipedia link. Attractions and viewpoints named "… Temple", "… Fort", "… Lake", "… Caves", "… Beach" or "… Palace" are filed under that category. New kinds: mountain passes (`mountain_pass=yes`, a new `pass` category), hot springs and glaciers (attractions), named treks (`route=hiking`, trailheads), and food stops riders look for (highway services and rest areas, dhabas, restaurants and cafés with a Wikidata link, coffee houses), not every eatery. The `wikimedia_commons` and `image` tags are kept for photos. When an OSM element is linked to a curated place, the curated place takes its Wikidata id and tags if it has none. `ensureCategories` brings category weights in the database in line with `src/lib/categories.ts`.

**Places with an outline.** Protected areas are fetched with `out geom`; the import joins a way, or a relation's outer ways, into a polygon in PostGIS (`ST_BuildArea`, made valid, simplified to about 100 m), stores it in `place.area` (migration 0016), and puts the place's point inside it. `places_along_route` finds these places by their outline: a road through Mudumalai lists it at the km where the road enters the park, 0 m off the road, pinned there; a road past it gets the distance to the edge. Places without an outline are found by their point as before.

**Stops and empty answers.** An all-India import takes hours, and a sleeping laptop or a dead network stops it. Each region's saved and split tiles go to `.import-progress/places-<region>.json` (`src/server/services/importProgress.ts`); `--resume` skips them, skips finished regions, and keeps the region's first start time, so closing places no longer in OpenStreetMap still counts the places saved before the stop. On 2026-10-07 some Overpass answers were empty for tiles full of places (Jhansi, Lalitpur, west Hyderabad): a server without the state's area answers every filter with nothing and HTTP 200. The queries now print the state's area first (`.region out ids;`), and an answer without it counts as a busy server, so the next one is tried and the tile is never taken as empty. HTTP 500 and 502 also move on to the next server. That was not the whole story: on 2026-10-09 servers answered 51 tiles inside states (Jaipur, Agra, Meerut) with the area and nothing else, and the end of the import closed about 1,070 places that were never looked at. An empty answer is now checked with the next server that answers and taken only when they agree (`createOverpassProvider`). When no other server answers, the tile counts as busy and is retried, never taken as empty. The closed places that still exist in OpenStreetMap were reopened after a check against the OSM API.

**Closing places.** When a state is complete, the places the import did not see are not simply closed. Their current version is fetched from the OSM API (`src/server/providers/osm/osmApi.ts`: multi-fetch, 100 ids a request, one a second). A place is closed only when it is deleted, or when its current tags no longer make it a place we import (`planClosures` in `src/server/services/osmClose.ts`). Places still there, and places the API did not answer for, stay open. More than 3% of the state's open places (at least 10) at once is refused unless `--force` is given, and the state stays incomplete. Every run writes the full list to `.import-progress/close-<region>.json`.

**Tiles outside the state.** A state's box is often half another state (Andhra Pradesh's half-degree tiles: 238, of which 97 touch the state). Before a region, the import asks Nominatim once for the state's outline (`src/server/providers/osm/regionOutline.ts`, simplified to about 500 m, cached in `.import-progress/outline-<region>.json`) and skips tiles that do not come within 0.05° of it (`tileTouchesOutline`). An outline that does not fit the state's own box, or no outline, means every tile is fetched as before.

**Several runs on one state.** `--part=2/3` runs one of three imports of the same state at once: tiles are dealt out by a hash of their box, a tile a part has to split stays with that part, and every part merges its saved tiles into the region's one resume file (`mergeProgress`). Whichever part finds no tile left (`pendingTiles`) closes the stale places. `--tile-deg` on a resumed state splits its remaining big tiles down to that size before asking, instead of waiting for them to time out.

## Nearby search (Near me)

The `/nearby` screen lists well-known places the rider can reach from one point (their position, a typed place or a point tapped on the map) within 30 min, 1 h, 2 h or half a day, measured on the road. Straight-line radius is misleading in the ghats, where a place 20 km across a valley can be 60 km by road.

1. **Candidates** (`places_near_point`, migration 0012): verified places within a generous straight-line radius (the time at 60 km/h, bikes 10 % slower, at most 250 km), most worthwhile first. Priority is the same as for the corridor: category weight, +1 when curated, +0.5 with a Wikidata link. At most 400 rows.
2. **Fame**: `priority + rating / 5 + 0.3 if trending` (`fameScore` in `src/lib/nearby.ts`). Google ratings are never used: they may not be stored.
3. **Road times**: `pickCandidates` keeps the best 99 spread over four distance rings (so a half-day search does not spend every slot at the edge), and **one** OSRM `table` request (`/table/v1/driving/{origin;d1;...}?sources=0&annotations=duration,distance`) gives road km and time to each. The public server allows 100 coordinates per table request, origin included. The request shares the 1 request/s throttle with routing and has a 6 s timeout (the service worker falls back to its cache for `/api/*` after 10 s). Places over the time, or with no road, are dropped; the rest are ordered by ride time.
4. **Fallback**: if OSRM fails, places within a straight-line guess (35 km/h) are shown by distance, and the response says `roadTimes: "straight"` so the screen can say so.
5. **Ride mode** (`mode=ride`, "Ahead of you"): everything worthwhile within 35 km, straight line, no OSRM. The phone filters to a cone around the heading as the rider moves and asks again at most every 2 km and 60 s.

Caching: table answers go in `route_cache` for 7 days under `table:v1:` keys (origin at 3 decimals, destinations, profile).

Privacy: the position is only ever taken on a tap (never on page load) and is rounded to 3 decimals (~100 m) before it reaches a URL, a request, a cache key or a trip stop. `/api/places/near` answers `Cache-Control: private, no-store`, stores nothing, and logs only error messages, never the request or the position. Saved trips are public to anyone with the link, which is why "My location" as a trip start is rounded too.

## Place detail and "Add to trip"

`GET /api/places/[slug]` (`placeDetailService.getPlaceDetail`) returns a verified place with its guide fields, items to carry, verified photos, external ratings, linked videos and reviews. Imported places rarely have guide fields; their OSM tags fill in timings (`opening_hours`), entry fee (`fee`), website and Wikipedia links, labelled as from OpenStreetMap. The place page `/place/[slug]` and the planner's panel render the same `PlaceDetailView`; empty guide fields say "Not known yet".

**Estimated guidance** (G4, 2026-10-09). Almost no imported place has a guide, so a place with none gets one estimated by `src/lib/guideDefaults.ts`: best, OK and avoid months, best vehicle and up to six items to carry. The inputs are the category, a climate zone worked out from the coordinates (Western Ghats and west coast, Deccan, south-east coast, northern plains, Thar, north-east, Himalayan hills, high Himalaya; any route works), and the height from OSM's `ele` tag. The rules match the curated places in `06-seed-data.md`: for example, waterfalls in the Ghats are best Aug–Nov, and high passes are open Jun–Sep. Nothing is stored. The detail says so (`estimate: { guide, carry, basis }`), and the page shows an "Estimate" note ("Typical for waterfalls in the Western Ghats and the west coast. Not checked for this place yet."), lighter month bars and softer words ("Usually a good time now"). A curated guide or carry list always wins. Lists fill `bestMonths` the same way, with `bestMonthsEstimated` ("Usually best Oct–Feb"), so most rows can show In season. "Plan in plain words" still picks destinations on curated months only.

In the planner, a place row opens the place in the side panel (desktop) or bottom sheet (mobile); with a place open, a map marker opens that place instead. "Add to trip" projects the place and every via stop onto the selected route (`metresAlong` in `src/lib/geo.ts`) and inserts the place before the first via stop further along (`viaInsertIndex` in `src/lib/trip.ts`), then the route is recomputed. A stop within 150 m of the place counts as the place.

### Photos from Wikimedia Commons

`pnpm db:import-photos [-- --limit=N]` (`photoImportService.ts`, provider `src/server/providers/wikimedia/`) gives places with a Wikidata id the item's main image (`P18`):

- Wikidata's query service returns the image file names for 200 items per request; the Commons API returns each file's author, licence, file page and a 960 px and 330 px URL for 50 files per request. The run pauses 1 s between requests and identifies itself with `NOMINATIM_USER_AGENT`.
- Only photos are kept (JPEG, PNG, WebP; no SVG maps or logos), and only files with a stated licence. Rows go into `media` with `source = 'wikimedia'`, `status = 'verified'`, the author as plain text and `author_url` set to the file's Commons page, where the full credit and licence are. The `utm_*` parameters Commons adds to URLs are dropped.
- Images are shown from Wikimedia's servers (`thumb.wikimedia.org`, `upload.wikimedia.org`), never copied. The place details show each photo with its author (linked to the file page), licence and "Wikimedia Commons"; list rows show the 330 px thumbnail without a credit, which is one tap away in the details.
- Every place looked up gets `place.photos_checked_at`, found or not, and is skipped for 90 days. Fuel stations and towns are skipped. Re-run after an OSM import to cover new places.
- **More photos (G4, 2026-10-10).** A place's own OSM tags add photos too: `wikimedia_commons` (`File:` values; categories are skipped) and `image` when it points at Commons (a file page or an upload URL). Other image hosts are skipped, because their licence cannot be checked. Up to 3 per place, the Wikidata image first, so places with no Wikidata link can have photos. A Wikidata item that is a person or lies far from the place gives no photo, and `--recheck` removes photos already taken that way. Credits are tidied: "Unknown author" is left empty (the page says so and links the file page), and paragraph-long credits are cut to about 80 characters.

### Wikidata links for places without one

`pnpm db:link-wikidata [-- --limit=N] [--dry-run]` (`wikidataLinkService.ts`, G4 step C3) links places that have no Wikidata id. Only about 14% had one, and photos and descriptions come through it. Run it before the photo and description imports.

- Places of the link categories (heritage, forts, temples, waterfalls, lakes, peaks, passes, viewpoints, caves, beaches, wildlife, museums, attractions) are grouped into half-degree tiles. Each tile gets one Wikidata query (`wikibase:box`) for the items with coordinates and an English name, leaving out settlements (items with a population) and people.
- A place takes an item when the names are clearly alike: trigram similarity 0.6 or more, as pg_trgm measures it. The item must also be close: 1 km, or more for parks, lakes, beaches, peaks and passes. A place named with what it is ("Kadinamkulam Lake") only takes an item whose name says so too, so it never gets the village it is named after. Two items that match about as well mean no link. An item already on another place is never reused, and each item goes to the closest place.
- Links go into `place.wikidata_id`. The OSM import keeps them (`coalesce` on upsert), since OSM has no id for these places. Finished tiles are kept in `.import-progress/wikidata-links.json`. A dry run on three Kerala tiles linked about 100 of 3,600 places, all of them by an exact or near-exact name.

### Descriptions from Wikipedia and Wikidata

`pnpm db:import-descriptions [-- --limit=N]` (`descriptionImportService.ts`, G4 step C2) gives a description to places that have none and either a Wikidata id or an English `wikipedia` tag.

- **Wikipedia first.** The text is the first three sentences of the English Wikipedia article (`src/server/providers/wikimedia/wikipedia.ts`, 20 articles per request, intros only, plain text). Brackets with other scripts or pronunciations are dropped, and the text is cut at a sentence by 600 characters. The article is the one in the OSM tag, else the Wikidata item's English article; the same Wikidata query as the photos returns it. The text is CC BY-SA 4.0, so `place.description_source`, `description_license` and `description_url` (migration 0018) hold the credit, and the page shows "From Wikipedia, CC BY-SA 4.0" with a link to the article.
- **Wikidata otherwise.** With no article (or an intro under 80 characters), Wikidata's own English description (CC0) is used when it is 40 characters or longer. Shorter ones only repeat the category ("temple in India").
- **Same checks as photos.** No text comes from an item that is a person or lies far from the place (`wikidataFits`).
- An existing description is never overwritten. Every place looked up gets `description_checked_at` and is skipped for 90 days.

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

Saved trips need no sign-in (`trip.user_id` stays empty, `is_public` is always true). `/trips/[id]` opens the planner with a trip; that URL is the share link, and anyone with it can open the trip.

- **Edit token** (migration 0017, decided 2026-10-09): `POST /api/trips` returns `{ trip, editToken }`. The token is 32 random bytes, sent this once; only its sha256 is stored (`trip.edit_token_hash`). `PATCH /api/trips/[id]` needs `Authorization: Bearer <token>`: 401 without one, 403 with the wrong one, and 403 for trips saved before tokens (read only). Anyone else gets "Save a copy" (a new trip of their own). Before this, anyone could overwrite any trip, and `/trips` listed every trip id.
- **Your trips** (`/trips`): the trips this device saved or opened, newest first, at most 50. The ids and the tokens live in `localStorage` (`src/lib/tripTokens.ts`; every read and write in try/catch). The page asks `GET /api/trips?ids=` for their summaries. There is no list of everyone's trips.

- Saving sends the stops, vehicle, corridor and the selected route (id, geometry, distance, time, label). The geometry is stored in `trip.route_geom`; the route id is stored so reopening selects the same route option (route ids are deterministic hashes of the routing request). Stops that match one of our places (same name within 150 m) get `trip_stop.place_id`.
- In the planner the URL keeps the working state (`/trips/[id]?from=...`), so a reload keeps unsaved edits; the bare link opens the saved version. The save bar shows "Changes not saved" when the stops, vehicle, corridor or selected route differ from the saved trip, with "Save changes" and "Save as new trip" on the device that saved it, and "Save as my trip" elsewhere.
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

## Famous rides

A hand-picked list of about 20 well-known Indian rides, kept as data (`data/rides.json`, validated by `rideSourceSchema` in `src/lib/rides.ts`), never in app logic: the pages and the planner show whatever the `ride` table holds.

- **Coordinates** come from `pnpm rides:lookup -- "<name>" --state="<state>"`: our own places first (towns, peaks, viewpoints), then Nominatim at one request a second. Never typed from memory. Each ride lists its stops (vias force the road riders mean) and checkpoints the route must pass.
- **`pnpm db:seed-rides`** (`--only=`, `--dry-run`) routes each ride once through the normal routing provider (cached and throttled; alternatives are asked for with two stops, as the planner does, which also warms its cache), keeps the first option that passes every checkpoint within 3 km (bypasses miss town centres by 1–2 km), lands within 15% of the expected distance and has at least the expected hairpins, computes its road mix, curvature and elevation profile, and upserts it (`src/server/services/rideService.ts`). A ride that fails is reported and not stored, so a wrong road is never shown. The public OSRM server does not route the Kalhatti ghat, so it is not in the list.
- **Pages** (`/rides`, `/rides/[slug]`, revalidated daily) read the table; their places come from the corridor search when the page is made, so they follow the OpenStreetMap import.

## Ride story

`GET /og/story` (`src/app/og/story/route.tsx`, `StoryCard` in `src/server/og/shareCards.tsx`, data from `src/server/services/storyService.ts`) draws a 1080×1920 PNG with next/og: the route with its ghats in orange (`splitByGhats`), the stops, distance, ride time, climb and hairpins (or the highest point), the elevation profile, up to four places spread along the road (`storyStops`: the best in each stretch, by `placeRank`), the app's address and the data credits. No photos, so there is nothing to credit but OpenStreetMap, the terrain and OSRM.

- `?route=<route id>&from=…&via=…&to=…&v=` for a planner route: geometry, distance and time from `route_cache` (`getRouteResult`), the profile from its own cache. The id is a hash of the routing request, so the CDN caches the image for a week. Once the route has left the cache the poster has the app's name and no numbers, cached for a minute.
- `?trip=<id>` for a saved trip: its cached route when still there, otherwise its stored line (without ghats).
- In the planner, "Ride story" (`StoryShare`) fetches the poster, shows it, then shares it as a file through `navigator.share({ files })` (Instagram stories, WhatsApp status) or downloads it. Two taps on purpose: iOS opens the share sheet only straight from a tap.

## Ride check and GPX

**Ride check** (`RideCheck.tsx`, logic in `src/lib/rideCheck.ts`), under the save bar for the selected route. Open on wide screens; on phones one line ("Ride check · Fuel gap 38 km · Arrive 11:29") that opens on tap, so the place list stays in view.

- **Fuel**: fuel stations within 2 km of the route (the places API with `categories: ["fuel"]`; 18,000+ stations from OSM). The longest stretch between pumps, counting from the start and to the destination, is compared with the range on a full tank (default 200 km for a bike, 450 km for a car, remembered per vehicle in `localStorage`): "ok" up to 3/4 of the range, "tight" up to the range, "short" beyond it. The note says the stations come from OSM and some may be missing.
- **Daylight**: start time (default 06:00 tomorrow, the browser's time zone) plus riding time plus 15 minutes of breaks per full 2 hours gives the arrival. Sunset at the destination and civil dawn at the start come from `suncalc` (BSD-2, computed in the browser, no API). "day" arrives an hour or more before sunset, "dusk" within that hour, "dark" after it, with the latest start that still arrives an hour before sunset. It also flags a start before dawn and more than 10 hours on the road.
- **Weather** (`POST /api/weather`, `weatherService.ts`, provider `src/server/providers/weather/metno.ts`): the route is sampled every 40 km, at most 8 points, start and destination included; each point is named after a town within 10 km along the route, or "km N". Its arrival time is the start plus that share of the riding time and breaks, and the forecast step covering that time is taken from MET Norway's Locationforecast (free, commercial use allowed, CC BY 4.0, credited under the list). Rain per hour grades as dry (< 0.2 mm), light (< 1), rain (< 4) or heavy; a thunder symbol and wind from 10 m/s (36 km/h) are flagged. The summary names the wettest place and time. Past the forecast (about 9 days ahead) it says there is no forecast yet.
- Forecast requests snap to a 0.05° grid (about 5 km) with at most 2 decimals, identify themselves with `NOMINATIM_USER_AGENT`, run 4 at a time, and are cached for an hour in `geocode_cache` under `metno:` keys (the daily health check deletes them after a day). One point failing leaves it without a forecast; all failing is a 502. The browser waits 0.5 s after the start time changes before asking.
- The start time is kept in the planner (not in the URL) and shared by the daylight and weather checks.

**GPX export**: the "GPX" button in the bar at the bottom of the panel downloads `src/lib/gpx.ts`'s GPX 1.1 file: the selected route as a track (one per day with a multi-day split), the stops as waypoints (flags: green start, blue stops, red destination) and the ticked places, or with none ticked the places in the list (at most 300), each described with its category and km. OsmAnd, Organic Maps, Komoot and GPS units navigate it offline. Built in the browser; nothing is sent to the server.

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

## Safety stops

Hospitals, police, ATMs, puncture and tyre shops, repair shops and stays along the route.

- **Data**: `service_point` (migration 0015), from OpenStreetMap: `amenity=hospital` or `healthcare=hospital`, `amenity=police`, `amenity=atm` or a bank with `atm=yes`, `shop=tyres|motorcycle_repair|car_repair|motorcycle` (a name with "puncture" or "tyre" makes it a tyre shop), `tourism=hotel|guest_house|hostel|motel`. Private, disused and campus-sized ones are left out; phones are kept for hospitals, police and stays (`classifyService`, pure and tested). Kept apart from places on purpose: these must not become indexable pages or crowd the place list. Goa has about 2,200 (two thirds of them stays); all of India is roughly 150–250 thousand rows, about 60 MB with indexes.
- **Import**: `pnpm db:import-services -- --region=<key|all> [--kinds=…] [--dry-run]`, on the same tile loop as the places import (`src/server/services/osmTiles.ts`): one Overpass request at a time, upsert on `osm_id`, and after a full run of every kind a region's rows not seen again are deleted.
- **Search**: `services_along_route(geojson, corridor_m, kinds)`, as `places_along_route`.
- **API**: `POST /api/services/along { routeId | geometry }` → for hospitals, police, ATMs, puncture and repair shops within 3 km of the road: counts, how many per 50 km, the longest stretch without each (start and destination included, as the fuel gap), and the nearest three of each kind per 10 km to list and pin (`src/lib/safety.ts`).
- **Planner**: "Safety on the way" under the road strip: a chip per kind with its count; a tap lists them in km order (name, how far off the road, Call for hospitals, police and stays with a phone) and pins them on the map (`servicePins`, both maps). The ride check adds the longest stretch without a hospital (ok up to 60 km, a warning up to 120 km).

## Multi-day split

A route longer than a day's riding is cut into days, each night in a town on the road with places to stay (`src/lib/multiDay.ts`, pure and tested; `dayPlanService.ts`).

- **Riding time along the road**: OSRM reports each step's time; `mergeRoads` keeps it on every road stretch (`RoadStretch.durationS`, bike times × 1.1), so `routeTimeline` maps km to riding minutes: a day ends further along on an expressway than in a ghat. Routes cached before step times were kept (and the recorded fixtures) have none, and time runs in proportion to distance.
- **How many days**: riding hours a day default to 6 by bike and 8 by car (4–10 to pick). A day may run a fifth over before another day is suggested: 5 h of riding at 4 h a day is 2 days, 7.2 h at 6 h a day is 1. The rider can add or take away days (up to 10).
- **Where each night falls**: day by day, the target is an even share of the riding time left, so a night a little early or late evens out over the days after it. Towns and cities within 5 km of the road (`townsAlong`) whose riding time is within a quarter of a day of the target are scored on closeness to it, size (population, cities a little more) and the stays within 5 km (`service_point` stays plus our stay places; none counts against a town). At most the 150 biggest towns are weighed, in one query. With no town in the window the day ends on the road at the target ("Night near km 412").
- **Stays**: the nearest four named stays to each night's town, our stay places (with pages) first, then OpenStreetMap hotels, guest houses, hostels and motels, with tap to call. Student and working people's hostels mapped as tourist ones ("Ladies PG", "Boys Hostel") are left out, at import and in the query (`isResidentHostel`).
- **API**: `POST /api/route/days { routeId | geometry, distanceKm, durationMin; hoursPerDay; days? }` → `{ suggestedDays, days, hoursPerDay, legs }`, each leg with its km, riding minutes and end (town, road or destination, with stays). One day needs no database. An expired route id is 404 `ROUTE_NOT_FOUND` and the browser resends the geometry and totals.
- **Planner**: `DaySplit` under the Preview and Story buttons: a route that fits in a day shows one line with the hours a day and "Split over 2 days"; longer ones show "Over N days" with − and +, the hours a day, and a timeline of the days (km, riding time, "Night in Hosapete · 24 stays within 5 km", the stays). The road strip marks each night with a tick; the place list has a "Night in Hosapete · day 2" divider where each day starts. The URL keeps `rh` (hours a day, when not the default) and `d` (days, when not the suggested number).
- **GPX**: with a split, one track per day ("Day 1: Pune → Hosapete", cut exactly at each night with `sliceLine`) instead of one for the route, and each night and its stays as Lodging waypoints.

## Plan in plain words

"2-day monsoon ride from Pune with waterfalls, under 250 km" becomes a planner trip (`POST /api/trip-from-words { text, near? }`).

- **Off without `ANTHROPIC_API_KEY`**: the box is not shown and the endpoint answers 404, so there is no AI call and no cost.
- **Reading** (`src/server/providers/llm/`, behind `TripIntentProvider`): one `messages.parse` call to Claude (`ANTHROPIC_TRIP_MODEL`, default `claude-haiku-4-5`: a short sentence needs no bigger model; about US$0.002 a request) with structured outputs (`zodOutputFormat(tripIntentSchema)`): from, to, via, vehicle, categories (our slugs only), days, one-way distance, month. The schema carries no number bounds (the output format does not support them); `cleanIntent` trims and clamps. The rider's text is wrapped in `<request>` and the system prompt says it is data. A refusal or unparseable answer gives "Couldn't read a trip". Timeout 15 s, one retry.
- **Turning it into a trip** (`tripFromWordsService.ts`): names resolve through our place search (our places first, then Photon), near the map's centre or the start. With no destination named, one is picked from our places (`places_near_point`): of the kinds asked for, within the distance (straight line = road / 1.3; 150 km one way by default, 100 km more per extra day), at least 40% of it away so it is a real ride, in season when a month was named, the most worthwhile first. The answer is the planner's query string; the box loads it.
- **Limits**: 6 requests per visitor per hour (`allowRequest`, scope `ai`) and 200 a day in all (`takeDailyBudget('ai_trip')`); tokens are counted in `usage_daily`. Set a monthly spend limit in the Anthropic Console as well.
- **Privacy**: the text is sent to Anthropic to be read; it is never stored or logged (errors log only the provider's message).

## Usage numbers

- **Page views**: Vercel Web Analytics (`<Analytics />` in the root layout): no cookies, reported only on Vercel; on the free plan it counts page views (custom events need Pro). Turn it on in the project's Analytics tab.
- **Counters**: `usage_daily (day, key, count)` (migration 0014, server only), written by `src/server/services/usage.ts` with one atomic upsert: `countUsage`, `takeDailyBudget` (counts and says no over a day's limit, used by the AI endpoint) and `usageTotal`. `POST /api/route` counts `route_planned` with `countLater`, inside Next's `after()`, so counting never slows or fails a request. Nothing about who asked is stored.
- **Per-visitor limits** for new endpoints: `allowRequest(request, { scope, limit, windowS })` in `writeLimit.ts`, on the same `write_limit` table under `<scope>:<salted IP hash>`, apart from the trip-write counter.
- **About** shows places, rides planned and trips saved (`statsService.getStats`), refreshed hourly.

## One-command data setup

A fresh clone gets every place, photo credit, famous ride and service point with `pnpm db:setup`, instead of hours of throttled Overpass, Wikimedia and OSRM calls.

- **Snapshot** (`data/snapshot/`, committed, about 10 MB): one gzipped JSON-lines file per table and `manifest.json` (format, when it was made, the newest migration, the licence, and per table its columns, rows, bytes and sha256). Tables, in load order: `category`, `carry_item`, `place`, `place_guide`, `place_carry`, `media`, `ride`, `service_point` (`src/lib/snapshot.ts`).
- **Left out**: places not verified or closed; media that are not verified or are users' uploads; Google place ids and check times, and who created or verified a row (written as null). Never trips, reviews, profiles, rate limits, usage counters, caches or Google usage.
- **Export** (owner): `pnpm db:export-snapshot [-- --out=dir]` reads the live tables in one read-only repeatable-read transaction with a cursor (2,000 rows a step; `row_to_json`, geography as hex EWKB text), gzips each table, and writes the manifest. Same data gives the same files (gzip without a time). Run it after an import and commit `data/snapshot`. COPY streams were tried first and hung now and then through the pooler, so the format is plain JSON lines.
- **Setup** (`scripts/setup-db.ts`): runs the Drizzle migrations; reads `data/snapshot` (or `--url=`, or the copy on GitHub when the clone has none); checks the manifest (`manifestProblems`: every table once, a migration this clone has, columns this database has); refuses unless the snapshot tables are empty (`--replace --yes` empties them, refused while trips, trip stops, reviews or social posts exist); checks every file's size and sha256 before writing; loads in one transaction, 1,000 rows per `INSERT … SELECT … FROM json_populate_recordset(…)`, so Postgres turns the JSON into arrays, enums, jsonb and geography itself; moves the serial sequences past the loaded ids; `ANALYZE`; and checks the row counts. The whole snapshot loads in about 20 seconds (`src/server/services/snapshotLoad.ts`).
- **From sources**: `pnpm db:setup -- --from-sources --regions=karnataka,kerala` runs the seed, the OSM places import, the photo import, the famous rides seed and the service points import instead.
- **Licence**: OpenStreetMap-derived, so the snapshot is under the ODbL 1.0 with attribution (`data/snapshot/LICENCE.md`); photo files stay with their authors under each media row's licence.
- **Tests**: unit tests for the SQL and manifest checks; an integration test exports 25 rows of each table from the live tables (read only), loads them into a throwaway schema of look-alike tables, compares arrays, JSON and geography, loads again with `replace`, and drops the schema.

## Deployment

Vercel (Hobby, free, non-commercial) runs the app; the database stays on Supabase (free, `ap-south-1`). Every push to `main` deploys to production; pushes to other branches get preview URLs.

- `vercel.json` pins serverless functions to Mumbai (`bom1`), next to the database, and runs a daily cron on `/api/health`. The health check queries the database, which keeps the free Supabase project from pausing (it pauses after 7 days without activity), and clears old write-limit counters.
- `DATABASE_URL` on Vercel is Supabase's **transaction pooler** (port 6543), not the session pooler used in development: serverless instances come and go, and the session pooler allows only 15 connections for the whole project. Queries already run with `prepare: false`, which the transaction pooler needs.
- Required settings: `DATABASE_URL` and `NOMINATIM_USER_AGENT`; the routing and geocoding URLs have defaults. `WRITE_LIMIT_SALT` is optional (without it the salt is derived from `DATABASE_URL`). Set `CRON_SECRET` in production: Vercel Cron sends it to `/api/health`, and without it the daily clean-up (write-limit counters, old forecasts, cache rows past their time) is skipped. The Google keys are optional: without them the app runs as before on MapLibre with no Google content.
- `/api/route` may run up to 60 s (`maxDuration`): up to four OSRM requests, spaced 1 s apart. `/api/places/near` may run 30 s (one OSRM table request after a database query).
- Saving and renaming trips is limited to 30 per visitor per hour (`writeLimit.ts`), counted in the `write_limit` table under a salted hash of the IP address.
- Moving to Vercel Pro or Cloudflare Workers Paid is needed before commercial use (see the comparison of 2026-09-29: Cloudflare's free plan allows 10 ms of CPU per request, and a route search needs 15-20 ms).

## Testing

- Unit: geo utils, ranking, provider response parsing (with recorded fixtures in `tests/fixtures/`), LLM extraction parsing.
- Integration: `places_along_route` against a test DB with seed data (use the acceptance criteria in `01-product-spec.md`).
- E2E (Playwright): search Bengaluru → Kalasa, add via Sakleshpur, open Manjarabad Fort, add it to trip.
- Mock all external providers in tests; never hit OSRM, Nominatim, Photon, Overpass, Google, YouTube or Instagram in CI. Playwright runs without Google keys (MapLibre); the Google map and section are checked by unit tests on the provider and budget, and by hand on a preview deploy. Provider responses are recorded as fixtures (`pnpm fixtures:routes`, `pnpm fixtures:photon`), and the Playwright dev server gets an unreachable `PHOTON_BASE_URL`.
