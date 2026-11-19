import { sql } from "drizzle-orm";
import { haversineM, metresAlong, resampleLine, type LngLat } from "@/lib/geo";
import { captionOf, GALLERY_MAX, pickGallery, type PhotoCandidate } from "@/lib/ridePhotos";
import { getDb } from "../db";
import {
  COMMONS_BATCH,
  type CommonsGeoFile,
  type CommonsImage,
  type WikimediaProvider,
} from "../providers/wikimedia/types";

// Fills each famous ride's photo gallery from Wikimedia Commons (docs/02, "Famous rides"): files
// with coordinates near the road, found from points along it, then checked for licence, shape
// and title, and spread along the ride. Only Commons URLs and credits are kept, never the files.

/** Search from a point every this far along the road, within RADIUS_M of it. */
const SAMPLE_EVERY_M = 15_000;
const MAX_SAMPLES = 24;
const RADIUS_M = 6_000;
/** A file may be this far from the road and still count as seen from it. */
const MAX_FROM_ROAD_M = 6_000;
const ROAD_STEP_M = 250;

interface RideRow extends Record<string, unknown> {
  slug: string;
  distanceM: number;
  line: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Search points along the road: at least the two ends and the middle, about every 15 km. */
export function samplePoints(line: LngLat[], distanceM: number): LngLat[] {
  const step = Math.max(distanceM / MAX_SAMPLES, Math.min(SAMPLE_EVERY_M, distanceM / 3));
  const points = resampleLine(line, step);
  const end = line[line.length - 1];
  return end ? [...points, end] : points;
}

/** Geosearch hits to candidates: how far along and how far from the road each file is. */
export function toCandidates(
  hits: CommonsGeoFile[],
  images: Map<string, CommonsImage>,
  line: LngLat[],
): PhotoCandidate[] {
  const road = resampleLine(line, ROAD_STEP_M);
  const out: PhotoCandidate[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const image = images.get(hit.file);
    if (!image || seen.has(hit.file)) continue;
    seen.add(hit.file);
    const distM = Math.min(...road.map((p) => haversineM(p, hit.location)));
    if (distM > MAX_FROM_ROAD_M) continue;
    out.push({ image, distM, kmAlong: metresAlong(line, hit.location) / 1000 });
  }
  return out;
}

/** Stores a ride's gallery, replacing the old one. */
async function storeGallery(slug: string, picks: PhotoCandidate[]): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM ride_photo WHERE ride_slug = ${slug}`);
    for (const [position, c] of picks.entries()) {
      const i = c.image;
      await tx.execute(sql`
        INSERT INTO ride_photo (ride_slug, position, file, url, thumb_url, page_url, caption,
                                author, license, km_from_start, width, height)
        VALUES (${slug}, ${position}, ${i.file}, ${i.url}, ${i.thumbUrl}, ${i.pageUrl},
                ${captionOf(i.file)}, ${i.author}, ${i.license}, ${Math.round(c.kmAlong * 10) / 10},
                ${i.width}, ${i.height})`);
    }
  });
}

export interface RidePhotoImportOptions {
  only?: string[];
  /** Rebuild galleries that already exist. */
  force?: boolean;
  pauseMs?: number;
  log?: (line: string) => void;
}

/** Builds the galleries; returns how many rides got one and how many photos in all. */
export async function importRidePhotos(
  provider: WikimediaProvider,
  { only, force = false, pauseMs = 1_100, log = () => {} }: RidePhotoImportOptions = {},
): Promise<{ rides: number; photos: number; empty: string[] }> {
  const rides = await getDb().execute<RideRow>(sql`
    SELECT slug, distance_m AS "distanceM",
           ST_AsGeoJSON(ST_Simplify(route_geom::geometry, 0.0005), 5) AS line
    FROM ride
    WHERE ${
      only
        ? sql`slug IN (${sql.join(
            only.map((o) => sql`${o}`),
            sql`, `,
          )})`
        : sql`true`
    }
      AND ${force ? sql`true` : sql`slug NOT IN (SELECT ride_slug FROM ride_photo)`}
    ORDER BY position, slug`);
  let done = 0;
  let photos = 0;
  const empty: string[] = [];
  for (const r of rides) {
    const line = (JSON.parse(r.line) as { coordinates: LngLat[] }).coordinates;
    const hits = new Map<string, CommonsGeoFile>();
    for (const p of samplePoints(line, r.distanceM)) {
      for (const hit of await provider.filesNear(p, RADIUS_M)) {
        if (!hits.has(hit.file)) hits.set(hit.file, hit);
      }
      await wait(pauseMs);
    }
    // Cheap title checks before asking Commons for each file's credit and size.
    const titles = [...hits.keys()].filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    const images = new Map<string, CommonsImage>();
    for (let i = 0; i < titles.length; i += COMMONS_BATCH) {
      for (const [file, image] of await provider.imageInfo(titles.slice(i, i + COMMONS_BATCH))) {
        images.set(file, image);
      }
      await wait(pauseMs);
    }
    const picks = pickGallery(
      toCandidates([...hits.values()], images, line),
      r.distanceM / 1000,
      GALLERY_MAX,
    );
    await storeGallery(r.slug, picks);
    done++;
    photos += picks.length;
    if (picks.length === 0) empty.push(r.slug);
    log(`${r.slug}: ${picks.length} photos (from ${titles.length} files near the road)`);
  }
  return { rides: done, photos, empty };
}
