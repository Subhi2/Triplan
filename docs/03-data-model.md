# 03 · Data model

Postgres 15+ with PostGIS. Write this as Drizzle schema + migrations; the SQL below is the source of truth for types, constraints and indexes.

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy name matching

-- Categories -----------------------------------------------------------
CREATE TABLE category (
  id          serial PRIMARY KEY,
  slug        text UNIQUE NOT NULL,       -- temple, worship, heritage, fort, museum, attraction,
                                          -- viewpoint, waterfall, trek, peak, cave, lake, beach,
                                          -- food, coffee, fuel, stay, town (src/lib/categories.ts)
  name        text NOT NULL,
  icon        text NOT NULL,
  parent_id   int REFERENCES category(id),
  weight      real NOT NULL DEFAULT 1.0   -- ranking weight
);

-- Places ----------------------------------------------------------------
CREATE TYPE place_status AS ENUM ('draft', 'unverified', 'verified', 'rejected', 'closed');

CREATE TABLE place (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  alt_names     text[] NOT NULL DEFAULT '{}',
  category_id   int NOT NULL REFERENCES category(id),
  location      geography(Point, 4326) NOT NULL,
  area          geography(MultiPolygon, 4326),  -- outline of a national park or sanctuary (0016); null otherwise
  address       text,
  district      text,
  state         text,
  description   text,
  status        place_status NOT NULL DEFAULT 'unverified',
  source        text NOT NULL,             -- 'curated' | 'osm' | 'user' | 'youtube'
  osm_id        text UNIQUE,               -- 'node/123' | 'way/456' | 'relation/789'; OSM import upserts on it
  google_place_id text,                    -- the only Google data we store; looked up when details first open
  google_place_checked_at timestamptz,     -- last lookup; with no id, not retried for 30 days
  wikidata_id   text,
  population    int,                       -- towns, from OSM; ranks "via" towns on route cards
  osm_tags      jsonb,                     -- selected OSM tags (provenance, later guide fields)
  rating_avg    real,                      -- from our reviews, maintained by trigger
  rating_count  int NOT NULL DEFAULT 0,
  trending_score real NOT NULL DEFAULT 0,
  photos_checked_at timestamptz,           -- last Wikimedia photo lookup (pnpm db:import-photos)
  description_source  text,                -- 'wikipedia' | 'wikidata' for imported text (0018)
  description_license text,                -- 'CC BY-SA 4.0' | 'CC0', shown with the text
  description_url     text,                -- the article or item to credit
  description_checked_at timestamptz,      -- last lookup (pnpm db:import-descriptions)
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX place_location_gix ON place USING gist (location);
CREATE INDEX place_name_trgm ON place USING gin (name gin_trgm_ops);
CREATE INDEX place_status_idx ON place (status);
CREATE INDEX place_category_idx ON place (category_id);
-- Type-ahead on alternative names ("Ooty" -> Udhagamandalam); alt_names_text is an IMMUTABLE
-- wrapper around array_to_string so it can be indexed.
CREATE INDEX place_alt_names_trgm ON place USING gin (alt_names_text(alt_names) gin_trgm_ops);

-- Curated guide fields (one row per place) -------------------------------
CREATE TYPE vehicle AS ENUM ('bike', 'car', 'suv_4x4', 'on_foot', 'bus');

CREATE TABLE place_guide (
  place_id         uuid PRIMARY KEY REFERENCES place(id) ON DELETE CASCADE,
  best_vehicles    vehicle[] NOT NULL DEFAULT '{}',   -- ordered, best first
  last_mile_note   text,                              -- "Narrow road, last 3 km bike only"
  road_condition   text,                              -- good | fair | rough
  best_months      smallint[] NOT NULL DEFAULT '{}',  -- 1-12
  ok_months        smallint[] NOT NULL DEFAULT '{}',
  avoid_months     smallint[] NOT NULL DEFAULT '{}',
  best_time_of_day text,                              -- "Sunrise", "Before 10 am"
  visit_duration_min int,
  timings          text,
  entry_fee        text,
  dress_code       text,
  permit_needed    text,
  notes            text,
  verified_at      timestamptz,
  verified_by      uuid REFERENCES auth.users(id)
);

-- Items to carry ----------------------------------------------------------
CREATE TABLE carry_item (
  id    serial PRIMARY KEY,
  slug  text UNIQUE NOT NULL,        -- raincoat, leech_socks, cash, torch, jacket, water_2l ...
  name  text NOT NULL,
  icon  text
);

CREATE TABLE place_carry (
  place_id  uuid REFERENCES place(id) ON DELETE CASCADE,
  item_id   int  REFERENCES carry_item(id),
  months    smallint[] NOT NULL DEFAULT '{}',   -- empty = all year
  reason    text,                               -- "Leeches on the trail in monsoon"
  PRIMARY KEY (place_id, item_id)
);

-- Media -------------------------------------------------------------------
CREATE TABLE media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id    uuid NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  kind        text NOT NULL,           -- 'image' | 'video_embed'
  url         text NOT NULL,           -- storage URL, or embed URL for videos
  thumb_url   text,
  source      text NOT NULL,           -- 'user' | 'wikimedia' | 'youtube' (never 'google': not storable)
  license     text NOT NULL,           -- 'CC-BY-SA-4.0', 'user-granted', 'embed-only' ...
  author      text,
  author_url  text,                    -- Wikimedia: the file's Commons page (full credit, licence)
  width       int,
  height      int,
  status      place_status NOT NULL DEFAULT 'unverified',
  uploaded_by uuid REFERENCES auth.users(id),
  device_hash text,                 -- G5 (0023): a rider's photo, sha256 of the posting device's key
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX media_place_url_key ON media (place_id, url);

-- Reviews -----------------------------------------------------------------
-- G5 (step 14): riders review without an account. user_id becomes nullable, device_hash keeps one
-- review per place per device, and new reviews wait for an admin (status 'unverified').
CREATE TABLE review (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id      uuid NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id),      -- G5: null for riders (no accounts)
  device_hash   text,                                -- G5: sha256 of the posting device's key
  nickname      text,                                -- G5: the name given, shown with the review
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          text,
  visited_month smallint CHECK (visited_month BETWEEN 1 AND 12),
  visited_year  smallint,
  vehicle_used  vehicle,
  moderation    jsonb,                               -- G5: the AI pre-screen's verdict and reason
  status        place_status NOT NULL DEFAULT 'verified',     -- riders' reviews are written 'unverified'
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, user_id),
  UNIQUE (place_id, device_hash) WHERE device_hash IS NOT NULL   -- G5 (0023)
);

-- external_rating (Google ratings) is dropped: Google's terms forbid storing them.
-- Google ratings, reviews and photos are fetched live when a place's details open
-- (see "Google Maps Platform" in 02-architecture.md).

-- Daily Google call budget: one row per UTC day and SKU ('ids' | 'details_atmosphere' | 'photo').
CREATE TABLE google_usage (
  day    date NOT NULL,
  sku    text NOT NULL,
  count  int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, sku)
);

-- Social discovery (see 05-hidden-places.md) ---------------------------------
CREATE TYPE social_status AS ENUM ('new', 'extracted', 'matched', 'candidate', 'verified', 'rejected', 'ignored');

CREATE TABLE discovery_region (
  id          serial PRIMARY KEY,
  name        text NOT NULL,          -- 'Sakleshpur', 'Chikkamagaluru'
  center      geography(Point, 4326) NOT NULL,
  radius_km   int NOT NULL DEFAULT 30,
  keywords    text[] NOT NULL,        -- search phrases
  hashtags    text[] NOT NULL DEFAULT '{}',   -- unused since Instagram was dropped (2026-10-26); kept, not dropped
  active      boolean NOT NULL DEFAULT true,
  last_run_at timestamptz
);

CREATE TABLE social_post (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,        -- 'youtube' | 'user_link' (a rider's pasted link, YouTube or Instagram)
  external_id     text NOT NULL,
  url             text NOT NULL,
  creator_name    text,
  creator_url     text,
  title           text,
  caption         text,
  posted_at       timestamptz,
  view_count      bigint,
  like_count      bigint,
  geo             geography(Point, 4326),   -- only if the platform provides it
  search_query    text,
  region_id       int REFERENCES discovery_region(id),
  extracted       jsonb,                    -- LLM output, see 05
  place_id        uuid REFERENCES place(id),
  status          social_status NOT NULL DEFAULT 'new',
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);


-- Trips ---------------------------------------------------------------------
-- Trips are open (no sign-in): user_id stays empty and every trip is public.
CREATE TABLE trip (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id),
  title         text NOT NULL,
  vehicle       vehicle NOT NULL DEFAULT 'bike',
  corridor_m    int NOT NULL DEFAULT 5000,
  route_geom    geography(LineString, 4326),
  route_id      text,                          -- the picked route option, selected again on reopen
  via_label     text,                          -- "via Hassan, Sakleshpur"
  distance_m    int,
  duration_s    int,
  is_public     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_updated_at_idx ON trip (updated_at DESC);

CREATE TABLE trip_stop (
  trip_id   uuid REFERENCES trip(id) ON DELETE CASCADE,
  position  smallint NOT NULL,                 -- 0 = start, last = destination
  label     text NOT NULL,
  location  geography(Point, 4326) NOT NULL,
  place_id  uuid REFERENCES place(id),         -- set when a stop is a place
  PRIMARY KEY (trip_id, position)
);

-- Caches ----------------------------------------------------------------------
CREATE TABLE route_cache (
  key        text PRIMARY KEY,
  response   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE geocode_cache (
  query      text PRIMARY KEY,
  response   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Famous rides (migration 0013) ------------------------------------------------
-- Hand-picked rides from data/rides.json, routed once by `pnpm db:seed-rides`. Public, read-only.
CREATE TABLE ride (
  slug        text PRIMARY KEY,
  title       text NOT NULL,
  blurb       text NOT NULL,
  region      text NOT NULL,
  vehicle     vehicle NOT NULL DEFAULT 'bike',
  tags        text[] NOT NULL DEFAULT '{}',
  best_months smallint[] NOT NULL DEFAULT '{}',
  notes       text,                          -- permits, closures, seasons
  stops       jsonb NOT NULL,                -- [{label, location: [lng, lat]}], start to end
  route_geom  geography(LineString, 4326) NOT NULL,
  distance_m  integer NOT NULL,
  duration_s  integer NOT NULL,
  road_mix    jsonb,                         -- RoadMix
  curvature   jsonb,                         -- RouteCurvature
  profile     jsonb,                         -- ElevationProfile
  ascent_m    integer,
  hairpins    smallint NOT NULL DEFAULT 0,
  position    smallint NOT NULL DEFAULT 0,   -- gallery order
  seeded_at   timestamptz NOT NULL DEFAULT now()
);

-- Service points (migration 0015) -----------------------------------------------
-- Hospitals, police, ATMs, tyre and repair shops and stays from OpenStreetMap, for safety stops
-- and overnight stays. Kept apart from place: no pages, no sitemap, not in the place list.
CREATE TABLE service_point (
  osm_id     text PRIMARY KEY,               -- "node/123", "way/456"
  kind       text NOT NULL CHECK (kind IN ('hospital','police','atm','tyre','repair','stay','toll')),  -- 'toll': 0021, G5
  name       text,
  phone      text,                           -- hospitals, police and stays only
  region     text NOT NULL,                  -- the state it was imported with
  location   geography(Point, 4326) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_point_location_gix ON service_point USING gist (location);
CREATE INDEX service_point_region_idx ON service_point (region);

-- Open places (migration 0022, G5) ------------------------------------------------
-- Fuel, food and coffee from Overture Places (`pnpm db:import-open-places`), for the break
-- planner and the fuel gap only: no pages, no search, not in the place list. Public, read-only,
-- in the data snapshot with each row's licence.
CREATE TABLE open_place (
  id         text PRIMARY KEY,                     -- Overture's GERS id, stable across releases
  name       text NOT NULL,
  category   text NOT NULL CHECK (category IN ('fuel','food','coffee')),
  location   geography(Point, 4326) NOT NULL,
  confidence real NOT NULL,                        -- Overture's, 0.7 or more
  license    text NOT NULL,                        -- 'CDLA-Permissive-2.0' | 'Apache-2.0' | 'CC0-1.0', comma-joined
  datasets   text[] NOT NULL,                      -- {meta, Foursquare, AllThePlaces, ...}
  region     text NOT NULL,                        -- the state's key in OSM_REGIONS, from our districts
  release    text NOT NULL,                        -- '2026-10-21.0'
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX open_place_location_gix ON open_place USING gist (location);
CREATE INDEX open_place_region_idx ON open_place (region);
-- open_places_along_route(geojson, corridor_m, categories): like services_along_route.

-- Districts (migration 0019, G5) --------------------------------------------------
-- India's districts from OpenStreetMap (admin_level 5) with their LGD codes, for official alerts
-- (they name districts by LGD code). `pnpm db:import-districts`. Public, read-only.
CREATE TABLE district (
  osm_id     text PRIMARY KEY,                     -- "relation/2020603"
  lgd_code   integer UNIQUE,                       -- ref:LGD:district; null when OSM has none
  name       text NOT NULL,                        -- "Chikkamagaluru"
  names      text[] NOT NULL DEFAULT '{}',         -- every name, lower case letters: {chikkamagaluru, chikmagalur}
  region     text NOT NULL,                        -- the state's key in OSM_REGIONS ("karnataka")
  geom       geography(MultiPolygon, 4326) NOT NULL,  -- simplified to about 200 m
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX district_geom_gix ON district USING gist (geom);
CREATE INDEX district_region_idx ON district (region);

-- Road rules (migration 0020, G5) -------------------------------------------------
-- Night bans, permits, e-passes and fees, curated in data/road-rules.json and loaded by
-- `pnpm db:seed-road-rules`. Public, read-only, in the data snapshot.
CREATE TABLE road_rule (
  slug        text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('night_ban','permit','epass','fee')),
  title       text NOT NULL,
  geom        geography(Geometry, 4326) NOT NULL,  -- a LineString along the road, or a (Multi)Polygon area
  closed_from text,                                -- night bans: "21:00" India time; may be later than closed_to
  closed_to   text,
  vehicles    vehicle[] NOT NULL DEFAULT '{}',     -- empty = every vehicle
  months      smallint[] NOT NULL DEFAULT '{}',    -- empty = all year
  link        text NOT NULL,                       -- the authority's page, else the report checked against
  source      text,                                -- who says so, when the link is not the authority's page
  checked_on  date NOT NULL,                       -- when we last checked it there
  note        text,
  seeded_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX road_rule_geom_gix ON road_rule USING gist (geom);

-- Road reports (migration 0023, G5) ----------------------------------------------
-- A rider's report of a closure, landslide, flood, potholes or diversion. Never in the snapshot.
-- RLS: anyone reads approved reports still in force. reports_along_route(geojson, corridor_m).
CREATE TABLE road_report (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('closed','landslide','flooded','potholes','diversion')),
  location    geography(Point, 4326) NOT NULL,
  note        text NOT NULL DEFAULT '',
  nickname    text,
  device_hash text NOT NULL,
  moderation  jsonb,                               -- the AI pre-screen's verdict and reason
  status      place_status NOT NULL DEFAULT 'unverified',
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL                 -- 72 h for closed, landslide, flooded; 24 h otherwise
);
CREATE INDEX road_report_location_gix ON road_report USING gist (location);
CREATE INDEX road_report_expires_idx ON road_report (expires_at);

-- Spent proofs of work (0023): one solved challenge pays for one post. Server only (RLS on, no
-- policies); the daily clean-up removes rows past expires_at.
CREATE TABLE pow_spent (
  signature  text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

-- Usage counters (migration 0014) -----------------------------------------------
-- Counts per UTC day: routes planned, AI requests and tokens. Server only (RLS on, no policies).
CREATE TABLE usage_daily (
  day   date NOT NULL,
  key   text NOT NULL,                        -- 'route_planned' | 'ai_trip' | 'ai_tokens_in' | ...
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

-- Users -------------------------------------------------------------------------
CREATE TABLE profile (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  role         text NOT NULL DEFAULT 'user'   -- 'user' | 'moderator' | 'admin'
);
```

Also add:
- A trigger on `review` insert/update/delete that recomputes `place.rating_avg` and `rating_count`.
- A trigger that sets `updated_at`.
- RLS policies as described in `02-architecture.md`.
- The `places_along_route` function from `02-architecture.md`.
- `services_along_route(geojson, corridor_m, kinds text[] = NULL)` (migration 0015): the service points within `corridor_m` of the route, with `km_from_start` and `detour_m` worked out as in `places_along_route`, in km order, at most 4000 (the nearest to the road kept).
- `districts_along_route(geojson)` (migration 0019, G5): the districts the route passes through (`lgd_code`, `name`, `names`, `region`) with `km_from_start` where it first enters each, in km order.
- `rules_along_route(geojson, corridor_m = 150)` (migration 0020, G5): road rules the route runs along for 1 km or more (roads) or goes 100 m or more into (areas), with `km_from` and `km_to` (where the route meets the rule and leaves it), in km order.
- `reports_along_route(geojson, corridor_m = 300)` (G5, step 14): approved road reports that have not expired, within `corridor_m` of the route, with `km_from_start`.
- `places_near_point(origin_lng, origin_lat, radius_m, categories text[] = NULL, lim = 400)` (migration 0012), for the Near me screen. Verified places within `radius_m` (straight line) of the point, with the same columns as `places_along_route` except `distance_m` and `priority` in place of `km_from_start` and `detour_m`. `priority` is the category weight, +1 when curated (not OSM only) and +0.5 with a Wikidata link. Results are ordered by priority, then rating, then distance, and capped at `lim` (at most 1000). `categories` NULL means every category except towns. Inputs are named `origin_*` because the returned `lng`/`lat` columns are OUT parameters.

## API response types (TypeScript)

```ts
type LngLat = [number, number];

interface RouteOption {
  id: string;                  // hash
  geometry: GeoJSON.LineString;
  distanceKm: number;
  durationMin: number;
  viaLabel: string;            // "via Sakleshpur"
  towns: string[];
  roadMix: RoadMix | null;     // null when the routing engine reports no road numbers
}

interface RoadMix {            // metres; the parts add up to the route distance
  nationalM: number;           // NH / NE
  stateM: number;              // SH
  ghatM: number;               // winding hill sections, from the geometry (any road)
  otherM: number;              // district and local roads
}

interface PlaceAlong {
  id: string;
  slug: string;
  name: string;
  category: string;
  location: LngLat;
  kmFromStart: number;
  detourKm: number;            // approximate, one way
  rating: number | null;
  ratingCount: number;
  bestMonths: number[];
  thumbUrl: string | null;
  trending: boolean;
}

// GET /api/places/near (the Near me screen)
interface PlaceNear {
  id: string; slug: string; name: string; category: string;
  location: LngLat;
  distanceKm: number;          // straight line from the origin
  roadKm: number | null;       // OSRM; null when road times are unavailable
  rideMin: number | null;
  bearingDeg: number;          // from the origin, 0–360 clockwise from north
  rating: number | null; ratingCount: number;
  bestMonths: number[]; thumbUrl: string | null;
  trending: boolean; notable: boolean;
  fame: number;                // priority + rating / 5 + 0.3 if trending
}

interface NearbyResponse {
  places: PlaceNear[];
  roadTimes: "osrm" | "straight";   // "straight": OSRM failed, a straight-line guess
  radiusKm: number;
}

// Route-specific fields (km, detour) come from the places list, so PlaceDetail does not have them.
interface PlaceDetail {
  id: string;
  slug: string;
  name: string;
  category: string;
  location: LngLat;
  district: string | null;
  state: string | null;
  rating: number | null;       // our reviews
  ratingCount: number;
  trending: boolean;
  description: string | null;
  guide: {
    bestVehicles: ("bike" | "car" | "suv_4x4" | "on_foot" | "bus")[];
    lastMileNote: string | null;
    roadCondition: string | null;
    bestMonths: number[]; okMonths: number[]; avoidMonths: number[];
    bestTimeOfDay: string | null;
    visitDurationMin: number | null;
    timings: string | null; entryFee: string | null;
    dressCode: string | null; permitNeeded: string | null;
    notes: string | null;
  } | null;
  carry: { slug: string; name: string; months: number[]; reason: string | null }[];
  media: { url: string; thumbUrl: string | null; author: string | null; authorUrl: string | null; license: string; source: string }[];
  googlePlaceId: string | null;  // Google's rating, reviews and photos come separately: GoogleGapFill
  videos: { url: string; source: "youtube"; creator: string | null; title: string | null }[];
  reviews: { id: string; rating: number; body: string | null; visitedMonth: number | null; visitedYear: number | null;
             vehicleUsed: string | null; author: string | null; createdAt: string }[];
  osm: { id: string | null; openingHours: string | null; fee: string | null;   // from OSM tags, shown
         website: string | null; wikipediaUrl: string | null };               // where the guide is empty
}

// GET /api/places/[slug]/google: live, never stored or cached. Only the fields of the place's gaps are set.
export interface GoogleGapFill {
  googleMapsUri: string | null;
  rating: number | null;
  ratingCount: number | null;
  reviews: { authorName: string; authorUri: string | null; authorPhotoUri: string | null;
             rating: number; text: string | null; relativeTime: string }[];
  photos: { name: string; widthPx: number; heightPx: number;              // name → /api/google/photo?name=
            authors: { displayName: string; uri: string | null }[] }[];
}

interface SavedTrip {           // GET /api/trips/[id]
  id: string;
  title: string;
  vehicle: "bike" | "car";
  corridorKm: 2 | 5 | 10 | 25;
  stops: { label: string; location: LngLat }[];   // start, vias, destination
  routeId: string | null;
  viaLabel: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  updatedAt: string;
}

interface TripSummary {         // GET /api/trips (the /trips list)
  id: string; title: string; vehicle: "bike" | "car";
  from: string; to: string; viaCount: number; viaLabel: string | null;
  distanceKm: number | null; durationMin: number | null; updatedAt: string;
}

// POST /api/route/alerts (G5): official alerts whose area the route crosses, worst first.
interface RouteAlert {
  id: string;                  // the CAP identifier
  event: string;               // "Thunderstorm with Lightning"
  headline: string;
  severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
  urgency: string; certainty: string;
  issuer: string;              // "IMD Bengaluru", "CWC", "Karnataka SDMA"
  area: string;                // "5 districts of Karnataka"
  onset: string | null; expires: string;   // ISO times
  kmFromStart: number;         // where the route first enters the area
  url: string;                 // the CAP message
}

// G5: a road rule on the route (rules_along_route) and its verdict for a start time (checkRules).
interface RuleOnRoute {
  slug: string;
  kind: "night_ban" | "permit" | "epass" | "fee";
  title: string;
  kmFrom: number; kmTo: number;
  closedFrom: string | null; closedTo: string | null;   // "21:00", "06:00"
  vehicles: string[]; months: number[];
  link: string; checkedOn: string; note: string | null;
}
type RuleVerdict =
  | { state: "closed"; arriveAt: string; latestStart: string | null }   // night ban hit
  | { state: "open" }
  | { state: "needs"; what: "permit" | "epass" | "fee" };
```
