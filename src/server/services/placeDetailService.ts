import { sql } from "drizzle-orm";
import {
  GUIDE_VEHICLES,
  type GuideVehicle,
  type PlaceDetail,
  type PlaceGuide,
  type PlaceReview,
  type PlaceVideo,
} from "@/lib/placeDetail";
import { TRENDING_MIN_SCORE } from "@/lib/places";
import { getDb } from "../db";

interface DetailRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  category: string;
  lng: number;
  lat: number;
  district: string | null;
  state: string | null;
  description: string | null;
  rating_avg: number | null;
  rating_count: number;
  trending_score: number;
  osm_id: string | null;
  osm_tags: Record<string, string> | null;
  has_guide: boolean;
  best_vehicles: string[] | null;
  last_mile_note: string | null;
  road_condition: string | null;
  best_months: number[] | null;
  ok_months: number[] | null;
  avoid_months: number[] | null;
  best_time_of_day: string | null;
  visit_duration_min: number | null;
  timings: string | null;
  entry_fee: string | null;
  dress_code: string | null;
  permit_needed: string | null;
  notes: string | null;
}

const isVehicle = (v: string | null | undefined): v is GuideVehicle =>
  GUIDE_VEHICLES.includes(v as GuideVehicle);

/** "en:Mysore Palace" (the OSM wikipedia tag) -> https://en.wikipedia.org/wiki/Mysore_Palace */
export function wikipediaUrl(tag: string | undefined): string | null {
  const m = /^([a-z][a-z-]{1,11}):(.+)$/.exec(tag?.trim() ?? "");
  if (!m) return null;
  const title = encodeURIComponent(m[2]!.trim().replace(/ /g, "_"));
  return `https://${m[1]}.wikipedia.org/wiki/${title}`;
}

/** The OSM fee tag in words: "yes" and "no" say little on their own. */
export function feeText(tag: string | undefined): string | null {
  const fee = tag?.trim();
  if (!fee) return null;
  if (fee.toLowerCase() === "yes") return "Entry fee charged (amount not known)";
  if (fee.toLowerCase() === "no") return "Free";
  return fee;
}

/** Only http(s) links are shown; OSM website tags are free text. */
export function httpUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function toGuide(r: DetailRow): PlaceGuide | null {
  if (!r.has_guide) return null;
  return {
    bestVehicles: (r.best_vehicles ?? []).filter(isVehicle),
    lastMileNote: r.last_mile_note,
    roadCondition: r.road_condition,
    bestMonths: r.best_months ?? [],
    okMonths: r.ok_months ?? [],
    avoidMonths: r.avoid_months ?? [],
    bestTimeOfDay: r.best_time_of_day,
    visitDurationMin: r.visit_duration_min,
    timings: r.timings,
    entryFee: r.entry_fee,
    dressCode: r.dress_code,
    permitNeeded: r.permit_needed,
    notes: r.notes,
  };
}

const MAX_MEDIA = 20;
const MAX_VIDEOS = 10;
const MAX_REVIEWS = 20;

interface CarryRow extends Record<string, unknown> {
  slug: string;
  name: string;
  months: number[];
  reason: string | null;
}

interface MediaRow extends Record<string, unknown> {
  url: string;
  thumb_url: string | null;
  author: string | null;
  author_url: string | null;
  license: string;
  source: string;
}

interface ExternalRatingRow extends Record<string, unknown> {
  source: string;
  rating: number;
  count: number | null;
}

interface VideoRow extends Record<string, unknown> {
  url: string;
  source: PlaceVideo["source"];
  creator_name: string | null;
  title: string | null;
}

interface ReviewRow extends Record<string, unknown> {
  id: string;
  rating: number;
  body: string | null;
  visited_month: number | null;
  visited_year: number | null;
  vehicle_used: string | null;
  author: string | null;
  created_at: string | Date;
}

/** Everything the place page shows, or null for an unknown (or not yet verified) place. */
export async function getPlaceDetail(slug: string): Promise<PlaceDetail | null> {
  const db = getDb();
  // The vehicle enum array is cast to text[]: postgres-js only parses arrays of built-in types.
  const [row] = await db.execute<DetailRow>(sql`
    SELECT p.id, p.slug, p.name, c.slug AS category,
           ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat,
           p.district, p.state, p.description, p.rating_avg, p.rating_count, p.trending_score,
           p.osm_id, p.osm_tags,
           pg.place_id IS NOT NULL AS has_guide, pg.best_vehicles::text[] AS best_vehicles,
           pg.last_mile_note, pg.road_condition, pg.best_months, pg.ok_months, pg.avoid_months,
           pg.best_time_of_day, pg.visit_duration_min, pg.timings, pg.entry_fee, pg.dress_code,
           pg.permit_needed, pg.notes
    FROM place p
    JOIN category c ON c.id = p.category_id
    LEFT JOIN place_guide pg ON pg.place_id = p.id
    WHERE p.slug = ${slug} AND p.status = 'verified'`);
  if (!row) return null;

  const [carry, media, external, videos, reviews] = await Promise.all([
    db.execute<CarryRow>(sql`
      SELECT ci.slug, ci.name, pc.months, pc.reason
      FROM place_carry pc JOIN carry_item ci ON ci.id = pc.item_id
      WHERE pc.place_id = ${row.id}
      ORDER BY ci.name`),
    db.execute<MediaRow>(sql`
      SELECT url, thumb_url, author, author_url, license, source
      FROM media
      WHERE place_id = ${row.id} AND kind = 'image' AND status = 'verified'
      ORDER BY created_at
      LIMIT ${MAX_MEDIA}`),
    db.execute<ExternalRatingRow>(sql`
      SELECT source, rating, count FROM external_rating
      WHERE place_id = ${row.id} AND rating IS NOT NULL
      ORDER BY source`),
    db.execute<VideoRow>(sql`
      SELECT url, source, creator_name, title FROM social_post
      WHERE place_id = ${row.id} AND status IN ('matched', 'verified')
        AND source IN ('youtube', 'instagram')
      ORDER BY view_count DESC NULLS LAST, posted_at DESC NULLS LAST
      LIMIT ${MAX_VIDEOS}`),
    db.execute<ReviewRow>(sql`
      SELECT r.id, r.rating, r.body, r.visited_month, r.visited_year,
             r.vehicle_used::text AS vehicle_used, pr.display_name AS author, r.created_at
      FROM review r LEFT JOIN profile pr ON pr.user_id = r.user_id
      WHERE r.place_id = ${row.id} AND r.status = 'verified'
      ORDER BY r.created_at DESC
      LIMIT ${MAX_REVIEWS}`),
  ]);

  const tags = row.osm_tags ?? {};
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    location: [row.lng, row.lat],
    district: row.district,
    state: row.state,
    description: row.description ?? (tags.description?.trim() || null),
    rating: row.rating_avg,
    ratingCount: row.rating_count,
    trending: row.trending_score >= TRENDING_MIN_SCORE,
    guide: toGuide(row),
    carry: carry.map((c) => ({ slug: c.slug, name: c.name, months: c.months, reason: c.reason })),
    media: media.map((m) => ({
      url: m.url,
      thumbUrl: m.thumb_url,
      author: m.author,
      authorUrl: m.author_url,
      license: m.license,
      source: m.source,
    })),
    externalRatings: external.map((e) => ({ source: e.source, rating: e.rating, count: e.count })),
    videos: videos.map((v) => ({
      url: v.url,
      source: v.source,
      creator: v.creator_name,
      title: v.title,
    })),
    reviews: reviews.map((r): PlaceReview => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      visitedMonth: r.visited_month,
      visitedYear: r.visited_year,
      vehicleUsed: isVehicle(r.vehicle_used) ? r.vehicle_used : null,
      author: r.author,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    osm: {
      id: row.osm_id,
      openingHours: tags.opening_hours?.trim() || null,
      fee: feeText(tags.fee),
      website: httpUrl(tags.website),
      wikipediaUrl: wikipediaUrl(tags.wikipedia),
    },
  };
}
