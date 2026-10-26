import { createHash, randomUUID } from "node:crypto";
import type { LineString } from "geojson";
import { sql } from "drizzle-orm";
import {
  reportExpiresAt,
  type ReviewInput,
  type RoadReportAlong,
  type RoadReportInput,
  type RoadReportKind,
} from "@/lib/riderPosts";
import { getDb } from "../db";
import { getModerationProvider, type Moderation, type PostKind } from "../providers/llm/moderation";
import { getPhotoStore } from "../providers/storage";
import { processPhoto } from "./photoService";

// Riders' reviews, photos and road reports without sign-in (docs/02, "Reviews, photos and road
// reports"). Every post waits for an admin; the AI pre-screen only tells the admin what it thinks.
// The device that posted holds a key (in localStorage); only its sha256 is stored, and the same
// key lets that device change or delete its posts.

export const deviceHash = (deviceKey: string) =>
  createHash("sha256").update(`device:${deviceKey}`).digest("hex");

interface PlaceRef extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
}

/** A verified place by its slug, or null. */
export async function placeBySlug(slug: string): Promise<PlaceRef | null> {
  const [row] = await getDb().execute<PlaceRef>(sql`
    SELECT id, name, slug FROM place WHERE slug = ${slug} AND status = 'verified'`);
  return row ?? null;
}

/** The pre-screen's verdict, or null without a key or when the model fails (the post waits). */
async function screen(kind: PostKind, place: string, text: string): Promise<Moderation | null> {
  if (!text.trim()) return null;
  const provider = getModerationProvider();
  if (!provider) return null;
  try {
    return await provider.screen(kind, place, text);
  } catch (err) {
    console.error("Pre-screen failed; the post waits for an admin", err);
    return null;
  }
}

/** Saves this device's review of the place, or replaces it; either way it waits for an admin. */
export async function saveReview(place: PlaceRef, input: ReviewInput, deviceKey: string) {
  const moderation = await screen("review", place.name, input.body);
  await getDb().execute(sql`
    INSERT INTO review (place_id, rating, body, visited_month, visited_year, vehicle_used,
                        status, device_hash, nickname, moderation)
    VALUES (${place.id}, ${input.rating}, ${input.body || null}, ${input.visitedMonth},
            ${input.visitedYear}, ${input.vehicleUsed}::vehicle, 'unverified',
            ${deviceHash(deviceKey)}, ${input.nickname}, ${moderation ? JSON.stringify(moderation) : null}::jsonb)
    ON CONFLICT (place_id, device_hash) WHERE device_hash IS NOT NULL DO UPDATE SET
      rating = excluded.rating, body = excluded.body, visited_month = excluded.visited_month,
      visited_year = excluded.visited_year, vehicle_used = excluded.vehicle_used,
      nickname = excluded.nickname, moderation = excluded.moderation,
      status = 'unverified', created_at = now()`);
  return { moderation };
}

/** Deletes this device's review of the place; false when it has none. */
export async function deleteReview(place: PlaceRef, deviceKey: string): Promise<boolean> {
  const rows = await getDb().execute(sql`
    DELETE FROM review WHERE place_id = ${place.id} AND device_hash = ${deviceHash(deviceKey)}
    RETURNING 1`);
  return rows.length > 0;
}

export class PhotoStoreMissing extends Error {}

/** Resizes the photo, strips its metadata, stores both sizes and queues it for an admin. */
export async function savePhoto(
  place: PlaceRef,
  bytes: Uint8Array,
  nickname: string,
  deviceKey: string,
): Promise<{ id: string }> {
  const store = getPhotoStore();
  if (!store) throw new PhotoStoreMissing("No photo storage configured");
  const photo = await processPhoto(bytes);
  const id = randomUUID();
  const base = `${place.id}/${id}`;
  const url = await store.put(`${base}.webp`, photo.full, "image/webp");
  const thumbUrl = await store.put(`${base}-400.webp`, photo.thumb, "image/webp");
  await getDb().execute(sql`
    INSERT INTO media (id, place_id, kind, url, thumb_url, source, license, author, width, height,
                       status, device_hash)
    VALUES (${id}, ${place.id}, 'image', ${url}, ${thumbUrl}, 'user', 'user-granted', ${nickname},
            ${photo.width}, ${photo.height}, 'unverified', ${deviceHash(deviceKey)})`);
  return { id };
}

/** Saves a road report; it shows on routes once an admin approves it, until it expires. */
export async function saveRoadReport(input: RoadReportInput, deviceKey: string, now = new Date()) {
  const moderation = await screen("road_report", "a road in India", input.note);
  const [lng, lat] = input.location;
  const [row] = await getDb().execute<{ id: string }>(sql`
    INSERT INTO road_report (kind, location, note, nickname, device_hash, moderation, expires_at)
    VALUES (${input.kind}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${input.note}, ${input.nickname}, ${deviceHash(deviceKey)},
            ${moderation ? JSON.stringify(moderation) : null}::jsonb,
            ${reportExpiresAt(input.kind, now).toISOString()}::timestamptz)
    RETURNING id`);
  return { id: row!.id, moderation };
}

/** Approved reports in force within `corridorM` of the route, by km from start. */
export async function reportsAlong(geometry: LineString, corridorM: number) {
  const rows = await getDb().execute<{
    id: string;
    kind: RoadReportKind;
    note: string;
    nickname: string | null;
    lng: number;
    lat: number;
    km_from_start: number;
    detour_m: number;
    created_at: string;
    expires_at: string;
  }>(sql`SELECT * FROM reports_along_route(${JSON.stringify(geometry)}, ${Math.round(corridorM)})`);
  return rows.map((r): RoadReportAlong => ({
    id: r.id,
    kind: r.kind,
    note: r.note,
    nickname: r.nickname,
    location: [r.lng, r.lat],
    kmFromStart: Number(r.km_from_start),
    detourKm: Number(r.detour_m) / 1000,
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
  }));
}

/** Removes spent proofs of work past their time, and reports a week after they expired. */
export async function forgetOldPosts(): Promise<{ pow: number; reports: number }> {
  const pow = await getDb().execute(
    sql`DELETE FROM pow_spent WHERE expires_at < now() RETURNING 1`,
  );
  const reports = await getDb().execute(
    sql`DELETE FROM road_report WHERE expires_at < now() - interval '7 days' RETURNING 1`,
  );
  return { pow: pow.length, reports: reports.length };
}

// Admin queue -----------------------------------------------------------------

export interface PendingReview {
  id: string;
  placeSlug: string;
  placeName: string;
  rating: number;
  body: string | null;
  nickname: string | null;
  moderation: Moderation | null;
  createdAt: string;
}
export interface PendingPhoto {
  id: string;
  placeSlug: string;
  placeName: string;
  thumbUrl: string | null;
  url: string;
  author: string | null;
  createdAt: string;
}
export interface PendingReport {
  id: string;
  kind: RoadReportKind;
  note: string;
  nickname: string | null;
  location: [number, number];
  moderation: Moderation | null;
  createdAt: string;
  expiresAt: string;
}

const QUEUE_LIMIT = 100;

/** Riders' posts waiting for an admin, oldest first (reports only while still in force). */
export async function pendingPosts(): Promise<{
  reviews: PendingReview[];
  photos: PendingPhoto[];
  reports: PendingReport[];
}> {
  const db = getDb();
  const [reviews, photos, reports] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT r.id, p.slug, p.name, r.rating, r.body, r.nickname, r.moderation, r.created_at
      FROM review r JOIN place p ON p.id = r.place_id
      WHERE r.status = 'unverified' AND r.device_hash IS NOT NULL
      ORDER BY r.created_at LIMIT ${QUEUE_LIMIT}`),
    db.execute<Record<string, unknown>>(sql`
      SELECT m.id, p.slug, p.name, m.thumb_url, m.url, m.author, m.created_at
      FROM media m JOIN place p ON p.id = m.place_id
      WHERE m.status = 'unverified' AND m.source = 'user'
      ORDER BY m.created_at LIMIT ${QUEUE_LIMIT}`),
    db.execute<Record<string, unknown>>(sql`
      SELECT id, kind, note, nickname, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat,
             moderation, created_at, expires_at
      FROM road_report
      WHERE status = 'unverified' AND expires_at > now()
      ORDER BY created_at LIMIT ${QUEUE_LIMIT}`),
  ]);
  const iso = (v: unknown) => new Date(String(v)).toISOString();
  return {
    reviews: reviews.map((r) => ({
      id: String(r.id),
      placeSlug: String(r.slug),
      placeName: String(r.name),
      rating: Number(r.rating),
      body: (r.body as string | null) ?? null,
      nickname: (r.nickname as string | null) ?? null,
      moderation: (r.moderation as Moderation | null) ?? null,
      createdAt: iso(r.created_at),
    })),
    photos: photos.map((m) => ({
      id: String(m.id),
      placeSlug: String(m.slug),
      placeName: String(m.name),
      thumbUrl: (m.thumb_url as string | null) ?? null,
      url: String(m.url),
      author: (m.author as string | null) ?? null,
      createdAt: iso(m.created_at),
    })),
    reports: reports.map((r) => ({
      id: String(r.id),
      kind: r.kind as RoadReportKind,
      note: String(r.note ?? ""),
      nickname: (r.nickname as string | null) ?? null,
      location: [Number(r.lng), Number(r.lat)],
      moderation: (r.moderation as Moderation | null) ?? null,
      createdAt: iso(r.created_at),
      expiresAt: iso(r.expires_at),
    })),
  };
}

export type PostKindForAdmin = "review" | "photo" | "report";

/**
 * Approves or rejects a waiting post. Returns the place's slug for reviews and photos (its page
 * is then rebuilt), null for reports, or undefined when there is no such waiting post.
 */
export async function moderatePost(
  kind: PostKindForAdmin,
  id: string,
  decision: "verified" | "rejected",
): Promise<string | null | undefined> {
  const db = getDb();
  if (kind === "report") {
    const rows = await db.execute(sql`
      UPDATE road_report SET status = ${decision}::place_status
      WHERE id = ${id} AND status = 'unverified' RETURNING 1`);
    return rows.length > 0 ? null : undefined;
  }
  if (kind === "review") {
    const rows = await db.execute<{ slug: string }>(sql`
      UPDATE review r SET status = ${decision}::place_status FROM place p
      WHERE r.id = ${id} AND r.status = 'unverified' AND p.id = r.place_id
      RETURNING p.slug`);
    return rows[0]?.slug;
  }
  if (decision === "verified") {
    const rows = await db.execute<{ slug: string }>(sql`
      UPDATE media m SET status = 'verified' FROM place p
      WHERE m.id = ${id} AND m.status = 'unverified' AND m.source = 'user' AND p.id = m.place_id
      RETURNING p.slug`);
    return rows[0]?.slug;
  }
  // A rejected photo is not kept: the row and both files go.
  const rows = await db.execute<{ slug: string; place_id: string }>(sql`
    DELETE FROM media m USING place p
    WHERE m.id = ${id} AND m.status = 'unverified' AND m.source = 'user' AND p.id = m.place_id
    RETURNING p.slug, m.place_id`);
  const row = rows[0];
  if (!row) return undefined;
  await getPhotoStore()?.remove([`${row.place_id}/${id}.webp`, `${row.place_id}/${id}-400.webp`]);
  return row.slug;
}
