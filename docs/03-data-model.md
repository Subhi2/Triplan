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
  address       text,
  district      text,
  state         text,
  description   text,
  status        place_status NOT NULL DEFAULT 'unverified',
  source        text NOT NULL,             -- 'curated' | 'osm' | 'user' | 'youtube' | 'instagram'
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
  source      text NOT NULL,           -- 'user' | 'wikimedia' | 'youtube' | 'instagram' (never 'google': not storable)
  license     text NOT NULL,           -- 'CC-BY-SA-4.0', 'user-granted', 'embed-only' ...
  author      text,
  author_url  text,                    -- Wikimedia: the file's Commons page (full credit, licence)
  width       int,
  height      int,
  status      place_status NOT NULL DEFAULT 'unverified',
  uploaded_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX media_place_url_key ON media (place_id, url);

-- Reviews -----------------------------------------------------------------
CREATE TABLE review (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id      uuid NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          text,
  visited_month smallint CHECK (visited_month BETWEEN 1 AND 12),
  visited_year  smallint,
  vehicle_used  vehicle,
  status        place_status NOT NULL DEFAULT 'verified',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, user_id)
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
  hashtags    text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  last_run_at timestamptz
);

CREATE TABLE social_post (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,        -- 'youtube' | 'instagram' | 'user_link'
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
  videos: { url: string; source: "youtube" | "instagram"; creator: string | null; title: string | null }[];
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
```
