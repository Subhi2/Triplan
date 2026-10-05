// Drizzle schema. docs/03-data-model.md is the source of truth for types, constraints and indexes.
// Triggers, RLS policies and places_along_route live in hand-written SQL migrations.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import type { RouteCurvature } from "@/lib/curvature";
import type { ElevationProfile } from "@/lib/elevation";
import type { RoadMix } from "@/lib/trip";
import { geographyArea, geographyLine, geographyPoint } from "./postgis";

const emptyArray = sql`'{}'`;
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Categories -----------------------------------------------------------------

export const category = pgTable("category", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  parentId: integer("parent_id").references((): AnyPgColumn => category.id),
  weight: real("weight").notNull().default(1.0),
});

// Places ---------------------------------------------------------------------

export const placeStatus = pgEnum("place_status", [
  "draft",
  "unverified",
  "verified",
  "rejected",
  "closed",
]);

export const place = pgTable(
  "place",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    altNames: text("alt_names").array().notNull().default(emptyArray),
    categoryId: integer("category_id")
      .notNull()
      .references(() => category.id),
    location: geographyPoint("location").notNull(),
    // Outline of a big place (a national park): the corridor search measures to it, so a road
    // through the park lists it. Null for everything else, which is measured to its location.
    area: geographyArea("area"),
    address: text("address"),
    district: text("district"),
    state: text("state"),
    description: text("description"),
    status: placeStatus("status").notNull().default("unverified"),
    source: text("source").notNull(), // 'curated' | 'osm' | 'user' | 'youtube' | 'instagram'
    osmId: text("osm_id"), // "node/123", "way/456"; unique, the OSM import upserts on it
    googlePlaceId: text("google_place_id"), // the only Google data stored (Maps ToS 3.2.3(b))
    // When the Google place id was last looked up; with no id found, not retried for 30 days.
    googlePlaceCheckedAt: timestamp("google_place_checked_at", { withTimezone: true }),
    wikidataId: text("wikidata_id"),
    population: integer("population"), // towns, from OSM when tagged
    osmTags: jsonb("osm_tags"), // selected OSM tags kept for provenance and later guide fields
    ratingAvg: real("rating_avg"),
    ratingCount: integer("rating_count").notNull().default(0),
    trendingScore: real("trending_score").notNull().default(0),
    // When the photo import last looked for this place's Wikimedia Commons image (docs/07, G1.2).
    photosCheckedAt: timestamp("photos_checked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => authUsers.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("place_location_gix").using("gist", t.location),
    index("place_area_gix").using("gist", t.area).where(sql`${t.area} IS NOT NULL`),
    index("place_name_trgm").using("gin", t.name.op("gin_trgm_ops")),
    index("place_status_idx").on(t.status),
    index("place_category_idx").on(t.categoryId),
    uniqueIndex("place_osm_id_key").on(t.osmId),
  ],
);

// Curated guide fields (one row per place) -----------------------------------

export const vehicle = pgEnum("vehicle", ["bike", "car", "suv_4x4", "on_foot", "bus"]);

export const placeGuide = pgTable("place_guide", {
  placeId: uuid("place_id")
    .primaryKey()
    .references(() => place.id, { onDelete: "cascade" }),
  bestVehicles: vehicle("best_vehicles").array().notNull().default(emptyArray), // best first
  lastMileNote: text("last_mile_note"),
  roadCondition: text("road_condition"), // good | fair | rough
  bestMonths: smallint("best_months").array().notNull().default(emptyArray), // 1-12
  okMonths: smallint("ok_months").array().notNull().default(emptyArray),
  avoidMonths: smallint("avoid_months").array().notNull().default(emptyArray),
  bestTimeOfDay: text("best_time_of_day"),
  visitDurationMin: integer("visit_duration_min"),
  timings: text("timings"),
  entryFee: text("entry_fee"),
  dressCode: text("dress_code"),
  permitNeeded: text("permit_needed"),
  notes: text("notes"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: uuid("verified_by").references(() => authUsers.id),
});

// Items to carry --------------------------------------------------------------

export const carryItem = pgTable("carry_item", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon"),
});

export const placeCarry = pgTable(
  "place_carry",
  {
    placeId: uuid("place_id").references(() => place.id, { onDelete: "cascade" }),
    itemId: integer("item_id").references(() => carryItem.id),
    months: smallint("months").array().notNull().default(emptyArray), // empty = all year
    reason: text("reason"),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.itemId] })],
);

// Media -----------------------------------------------------------------------

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => place.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'image' | 'video_embed'
    url: text("url").notNull(),
    thumbUrl: text("thumb_url"),
    source: text("source").notNull(), // 'user' | 'wikimedia' | 'youtube' | 'instagram' (never 'google')
    license: text("license").notNull(),
    author: text("author"),
    authorUrl: text("author_url"),
    width: integer("width"),
    height: integer("height"),
    status: placeStatus("status").notNull().default("unverified"),
    uploadedBy: uuid("uploaded_by").references(() => authUsers.id),
    createdAt: createdAt(),
  },
  // The photo import re-runs safely: one row per place and image.
  (t) => [uniqueIndex("media_place_url_key").on(t.placeId, t.url)],
);

// Reviews ---------------------------------------------------------------------

export const review = pgTable(
  "review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => place.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    rating: smallint("rating").notNull(),
    body: text("body"),
    visitedMonth: smallint("visited_month"),
    visitedYear: smallint("visited_year"),
    vehicleUsed: vehicle("vehicle_used"),
    status: placeStatus("status").notNull().default("verified"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.placeId, t.userId),
    check("review_rating_check", sql`${t.rating} BETWEEN 1 AND 5`),
    check("review_visited_month_check", sql`${t.visitedMonth} BETWEEN 1 AND 12`),
  ],
);

// No external_rating table: Google's ratings may not be stored (Maps ToS 3.2.3(b)); they are
// fetched live when a place's details open (services/googleGapService.ts).

// Social discovery (see docs/05-hidden-places.md) -----------------------------

export const socialStatus = pgEnum("social_status", [
  "new",
  "extracted",
  "matched",
  "candidate",
  "verified",
  "rejected",
  "ignored",
]);

export const discoveryRegion = pgTable("discovery_region", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  center: geographyPoint("center").notNull(),
  radiusKm: integer("radius_km").notNull().default(30),
  keywords: text("keywords").array().notNull(),
  hashtags: text("hashtags").array().notNull().default(emptyArray),
  active: boolean("active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
});

export const socialPost = pgTable(
  "social_post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // 'youtube' | 'instagram' | 'user_link'
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    creatorName: text("creator_name"),
    creatorUrl: text("creator_url"),
    title: text("title"),
    caption: text("caption"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    viewCount: bigint("view_count", { mode: "number" }),
    likeCount: bigint("like_count", { mode: "number" }),
    geo: geographyPoint("geo"), // only if the platform provides it
    searchQuery: text("search_query"),
    regionId: integer("region_id").references(() => discoveryRegion.id),
    extracted: jsonb("extracted"), // LLM output, see docs/05
    placeId: uuid("place_id").references(() => place.id),
    status: socialStatus("status").notNull().default("new"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.source, t.externalId)],
);

// Trips -----------------------------------------------------------------------

// Trips are open: no sign-in, so user_id stays empty and every trip is public (see docs/03).
export const trip = pgTable(
  "trip",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => authUsers.id),
    title: text("title").notNull(),
    vehicle: vehicle("vehicle").notNull().default("bike"),
    corridorM: integer("corridor_m").notNull().default(5000),
    routeGeom: geographyLine("route_geom"),
    routeId: text("route_id"), // the picked route option, selected again when the trip reopens
    viaLabel: text("via_label"), // "via Hassan, Sakleshpur"
    distanceM: integer("distance_m"),
    durationS: integer("duration_s"),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trip_updated_at_idx").on(t.updatedAt.desc())],
);

export const tripStop = pgTable(
  "trip_stop",
  {
    tripId: uuid("trip_id").references(() => trip.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(), // 0 = start, last = destination
    label: text("label").notNull(),
    location: geographyPoint("location").notNull(),
    placeId: uuid("place_id").references(() => place.id), // set when a stop is a place
  },
  (t) => [primaryKey({ columns: [t.tripId, t.position] })],
);

// Famous rides ------------------------------------------------------------------
// Hand-picked rides from data/rides.json, routed once by `pnpm db:seed-rides` (docs/02, "Famous
// rides"). Public and read-only.

export const ride = pgTable("ride", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  blurb: text("blurb").notNull(),
  region: text("region").notNull(),
  vehicle: vehicle("vehicle").notNull().default("bike"),
  tags: text("tags").array().notNull().default(emptyArray),
  bestMonths: smallint("best_months").array().notNull().default(emptyArray), // 1-12
  notes: text("notes"), // permits, closures, seasons
  stops: jsonb("stops").$type<{ label: string; location: [number, number] }[]>().notNull(),
  routeGeom: geographyLine("route_geom").notNull(),
  distanceM: integer("distance_m").notNull(),
  durationS: integer("duration_s").notNull(),
  roadMix: jsonb("road_mix").$type<RoadMix | null>(),
  curvature: jsonb("curvature").$type<RouteCurvature | null>(),
  profile: jsonb("profile").$type<ElevationProfile | null>(),
  ascentM: integer("ascent_m"),
  hairpins: smallint("hairpins").notNull().default(0),
  position: smallint("position").notNull().default(0), // gallery order
  seededAt: timestamp("seeded_at", { withTimezone: true }).notNull().defaultNow(),
});

// Write limits ------------------------------------------------------------------
// With no sign-in, saving and renaming trips is limited per visitor: a salted hash of the IP
// address (never the address itself), counted per one-hour window.

export const writeLimit = pgTable("write_limit", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(0),
});

// Google call budget ------------------------------------------------------------
// Calls to Google per UTC day and SKU, so usage stays inside Google's free monthly caps
// (src/server/providers/google/budget.ts).

export const googleUsage = pgTable(
  "google_usage",
  {
    day: date("day").notNull(),
    sku: text("sku").notNull(), // 'ids' | 'details_atmosphere' | 'photo'
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.sku] })],
);

// Service points ----------------------------------------------------------------
// Hospitals, police, ATMs, tyre and repair shops and stays from OpenStreetMap, for safety stops and
// overnight stays (docs/02, "Safety stops"). Kept apart from place: no pages, no sitemap, not in
// the place list. Imported with `pnpm db:import-services`.

export const servicePoint = pgTable(
  "service_point",
  {
    osmId: text("osm_id").primaryKey(), // "node/123", "way/456"
    kind: text("kind").notNull(), // hospital | police | atm | tyre | repair | stay
    name: text("name"),
    phone: text("phone"),
    region: text("region").notNull(), // the state it was imported with
    location: geographyPoint("location").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("service_point_location_gix").using("gist", t.location),
    index("service_point_region_idx").on(t.region),
    check(
      "service_point_kind_check",
      sql`${t.kind} IN ('hospital', 'police', 'atm', 'tyre', 'repair', 'stay')`,
    ),
  ],
);

// Usage counters ----------------------------------------------------------------
// Counts per UTC day: routes planned, AI requests and tokens (src/server/services/usage.ts).
// Nothing about who: no visitor keys, no addresses.

export const usageDaily = pgTable(
  "usage_daily",
  {
    day: date("day").notNull(),
    key: text("key").notNull(), // 'route_planned' | 'ai_trip' | 'ai_tokens_in' | ...
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.key] })],
);

// Caches ----------------------------------------------------------------------

export const routeCache = pgTable("route_cache", {
  key: text("key").primaryKey(),
  response: jsonb("response").notNull(),
  createdAt: createdAt(),
});

export const geocodeCache = pgTable("geocode_cache", {
  query: text("query").primaryKey(),
  response: jsonb("response").notNull(),
  createdAt: createdAt(),
});

// Users -----------------------------------------------------------------------

export const profile = pgTable("profile", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  role: text("role").notNull().default("user"), // 'user' | 'moderator' | 'admin'
});
