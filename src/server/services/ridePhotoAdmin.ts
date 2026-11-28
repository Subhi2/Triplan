import { sql } from "drizzle-orm";
import { getDb } from "../db";

// Hiding a ride photo that does not show its road (G11): the admin finds the ride by its link,
// hides a photo, and the photo import skips that file from then on (ride_photo_block).

export interface RidePhotoRow {
  position: number;
  file: string;
  thumbUrl: string;
  caption: string;
  kmFromStart: number;
}

/** A ride's gallery, in order along the road. */
export async function ridePhotosOf(slug: string): Promise<RidePhotoRow[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT position, file, thumb_url, caption, km_from_start
    FROM ride_photo WHERE ride_slug = ${slug} ORDER BY position`);
  return rows.map((r) => ({
    position: Number(r.position),
    file: String(r.file),
    thumbUrl: String(r.thumb_url),
    caption: String(r.caption),
    kmFromStart: Number(r.km_from_start),
  }));
}

/** Takes the file off the ride's gallery and keeps it off. False when it was not on it. */
export async function hideRidePhoto(slug: string, file: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const gone = await tx.execute(sql`
      DELETE FROM ride_photo WHERE ride_slug = ${slug} AND file = ${file} RETURNING 1`);
    if (gone.length === 0) return false;
    await tx.execute(sql`
      INSERT INTO ride_photo_block (ride_slug, file) VALUES (${slug}, ${file})
      ON CONFLICT DO NOTHING`);
    return true;
  });
}

/** "/rides/<slug>", the full link to it, or the slug alone: the ride's slug, else null. */
export function rideSlugFromLink(link: string, siteOrigin: string): string | null {
  const s = link.trim();
  const input = s.includes("/") ? s : `/rides/${s}`;
  try {
    const path = new URL(input, siteOrigin).pathname;
    const m = /^\/rides\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(path);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}
