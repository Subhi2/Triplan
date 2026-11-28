import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { LngLat } from "@/lib/geo";
import type { NewPlaceInput, PendingPlace, SimilarPlace } from "@/lib/contribute";
import { slugify } from "@/lib/slug";
import { getDb } from "../db";

// "Add a place" (G11, A9): riders' new places wait as status 'unverified' (source 'rider') for an
// admin; approving one makes it a verified place, so it shows on routes like any other.

/** Names this alike (pg_trgm similarity) within this distance are probably the same place. */
const SIMILAR_NAME = 0.4;
const SIMILAR_WITHIN_M = 1_000;

/** Places we have (verified, or waiting) near the pin with a similar name. */
export async function similarPlaces(name: string, [lng, lat]: LngLat): Promise<SimilarPlace[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH pt AS (SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography AS g)
    SELECT p.slug, p.name, c.slug AS category, ST_Distance(p.location, pt.g) AS distance_m
    FROM place p JOIN category c ON c.id = p.category_id CROSS JOIN pt
    WHERE p.status IN ('verified', 'unverified')
      AND ST_DWithin(p.location, pt.g, ${SIMILAR_WITHIN_M})
      AND similarity(lower(p.name), lower(${name})) > ${SIMILAR_NAME}
    ORDER BY similarity(lower(p.name), lower(${name})) DESC
    LIMIT 5`);
  return rows.map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
    category: String(r.category),
    distanceM: Math.round(Number(r.distance_m)),
  }));
}

/** Saves a rider's new place to wait for an admin; returns its slug. */
export async function createPlace(input: NewPlaceInput): Promise<string> {
  const base = slugify(input.name) || "place";
  const slug = `${base.slice(0, 60)}-${randomBytes(3).toString("hex")}`;
  const [lng, lat] = input.location;
  await getDb().transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO place (slug, name, category_id, location, status, source)
      VALUES (${slug}, ${input.name},
              (SELECT id FROM category WHERE slug = ${input.category}),
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 'unverified', 'rider')
      RETURNING id`);
    const id = row!.id;
    if (input.bestMonths.length > 0 || input.note) {
      await tx.execute(sql`
        INSERT INTO place_guide (place_id, best_months, notes)
        VALUES (${id}, ${`{${input.bestMonths.join(",")}}`}::smallint[], ${input.note || null})`);
    }
    if (input.link) {
      await tx.execute(sql`
        INSERT INTO social_post (source, external_id, url, place_id, status)
        VALUES ('user_link', ${input.link}, ${input.link}, ${id}, 'new')
        ON CONFLICT (source, external_id) DO NOTHING`);
    }
  });
  return slug;
}

/** New places waiting for an admin, oldest first. */
export async function pendingPlaces(): Promise<PendingPlace[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT p.id, p.slug, p.name, c.slug AS category, ST_X(p.location::geometry) AS lng,
           ST_Y(p.location::geometry) AS lat, coalesce(g.best_months, '{}') AS best_months,
           g.notes, s.url AS link, p.created_at
    FROM place p
    JOIN category c ON c.id = p.category_id
    LEFT JOIN place_guide g ON g.place_id = p.id
    LEFT JOIN LATERAL (
      SELECT url FROM social_post WHERE place_id = p.id AND source = 'user_link' LIMIT 1
    ) s ON true
    WHERE p.status = 'unverified' AND p.source = 'rider'
    ORDER BY p.created_at LIMIT 100`);
  return rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    category: String(r.category),
    location: [Number(r.lng), Number(r.lat)],
    bestMonths: (r.best_months as number[]).map(Number),
    note: r.notes == null ? null : String(r.notes),
    link: r.link == null ? null : String(r.link),
    createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}

/**
 * Approves a rider's new place (it shows on routes from now on) or rejects it (deleted, with
 * its guide and link). Returns the slug, or undefined when there was no such waiting place.
 */
export async function decidePlace(
  id: string,
  decision: "approve" | "reject",
): Promise<string | undefined> {
  if (decision === "approve") {
    const [row] = await getDb().execute<{ slug: string }>(sql`
      UPDATE place SET status = 'verified', updated_at = now()
      WHERE id = ${id} AND status = 'unverified' AND source = 'rider' RETURNING slug`);
    return row?.slug;
  }
  return getDb().transaction(async (tx) => {
    // social_post does not cascade with its place: the rider's link goes first.
    await tx.execute(sql`
      DELETE FROM social_post s USING place p
      WHERE s.place_id = p.id AND p.id = ${id} AND p.status = 'unverified' AND p.source = 'rider'`);
    const [row] = await tx.execute<{ slug: string }>(sql`
      DELETE FROM place WHERE id = ${id} AND status = 'unverified' AND source = 'rider'
      RETURNING slug`);
    return row?.slug;
  });
}
