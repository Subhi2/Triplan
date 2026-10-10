import { sql } from "drizzle-orm";
import type { LngLat } from "@/lib/geo";
import { getDb } from "../db";
import {
  COMMONS_BATCH,
  WIKIDATA_BATCH,
  type CommonsImage,
  type WikimediaProvider,
} from "../providers/wikimedia";
import { wikidataFits } from "./wikidataCheck";

// Photos for places from Wikimedia Commons (docs/07, G1.2): the Wikidata item's main image (P18),
// stored in media with source 'wikimedia', its author, its licence and a link to the file page.
// Images are shown from Wikimedia's servers, never copied. A Wikidata item that is a person or
// lies far from the place gives no photo (src/server/services/wikidataCheck.ts).

/** Places are checked again after this long, in case their Wikidata item got an image. */
const RECHECK_AFTER = "90 days";

interface PlaceToCheck {
  id: string;
  wikidataId: string;
  location: LngLat;
  category: string;
}

interface PlaceRow extends Record<string, unknown> {
  id: string;
  wikidata_id: string;
  lng: number;
  lat: number;
  category: string;
}

const toPlace = (r: PlaceRow): PlaceToCheck => ({
  id: r.id,
  wikidataId: r.wikidata_id,
  location: [r.lng, r.lat],
  category: r.category,
});

/**
 * Verified places with a Wikidata id, no Wikimedia photo yet and not checked recently. Curated
 * places and higher-ranked categories first; fuel stations and towns are skipped. `onlyIds`
 * narrows it to those places.
 */
export async function placesNeedingPhotos(
  limit: number,
  onlyIds?: string[],
): Promise<PlaceToCheck[]> {
  const rows = await getDb().execute<PlaceRow>(sql`
    SELECT p.id, p.wikidata_id, ST_X(p.location::geometry) AS lng,
           ST_Y(p.location::geometry) AS lat, c.slug AS category
    FROM place p
    JOIN category c ON c.id = p.category_id
    WHERE p.status = 'verified' AND p.wikidata_id ~ '^Q[0-9]+$'
      AND c.slug NOT IN ('fuel', 'town')
      AND (p.photos_checked_at IS NULL
           OR p.photos_checked_at < now() - ${RECHECK_AFTER}::interval)
      AND NOT EXISTS (SELECT 1 FROM media m WHERE m.place_id = p.id AND m.source = 'wikimedia')
      AND (${onlyIds === undefined} OR p.id = ANY(${sql.param(onlyIds ?? [])}::uuid[]))
    ORDER BY EXISTS (SELECT 1 FROM place_guide g WHERE g.place_id = p.id) DESC,
             c.weight DESC, p.id
    LIMIT ${limit}`);
  return rows.map(toPlace);
}

/** Stores the photos found and marks every checked place, found or not. */
export async function savePhotos(
  checkedIds: string[],
  photos: { placeId: string; image: CommonsImage }[],
): Promise<void> {
  if (checkedIds.length === 0) return;
  await getDb().transaction(async (tx) => {
    for (const { placeId, image } of photos) {
      await tx.execute(sql`
        INSERT INTO media (place_id, kind, url, thumb_url, source, license, author, author_url,
                           width, height, status)
        VALUES (${placeId}, 'image', ${image.url}, ${image.thumbUrl}, 'wikimedia', ${image.license},
                ${image.author}, ${image.pageUrl}, ${image.width}, ${image.height}, 'verified')
        ON CONFLICT (place_id, url) DO NOTHING`);
    }
    await tx.execute(sql`
      UPDATE place SET photos_checked_at = now()
      WHERE id = ANY(${sql.param(checkedIds)}::uuid[])`);
  });
}

export interface PhotoImportResult {
  checked: number;
  found: number;
  /** Wikidata items that are a person or lie far from the place: no photo taken. */
  rejected: number;
}

/**
 * Looks up photos for up to `limit` places, WIKIDATA_BATCH at a time, pausing between requests
 * so the run stays a light user of Wikidata and Commons. Safe to stop and re-run.
 */
export async function importWikimediaPhotos(
  provider: WikimediaProvider,
  {
    limit,
    onlyIds,
    pauseMs = 1000,
    log = () => {},
  }: { limit: number; onlyIds?: string[]; pauseMs?: number; log?: (line: string) => void },
): Promise<PhotoImportResult> {
  const pause = () => new Promise((resolve) => setTimeout(resolve, pauseMs));
  const result: PhotoImportResult = { checked: 0, found: 0, rejected: 0 };
  while (result.checked < limit) {
    const places = await placesNeedingPhotos(
      Math.min(WIKIDATA_BATCH, limit - result.checked),
      onlyIds,
    );
    if (places.length === 0) break;

    const items = await provider.items(places.map((p) => p.wikidataId));
    const files = new Map<string, string>();
    for (const p of places) {
      const item = items.get(p.wikidataId);
      if (!item?.file) continue;
      if (wikidataFits(p, item)) files.set(p.wikidataId, item.file);
      else result.rejected++;
    }
    const uniqueFiles = [...new Set(files.values())];
    const images = new Map<string, CommonsImage>();
    for (let i = 0; i < uniqueFiles.length; i += COMMONS_BATCH) {
      await pause();
      for (const [file, image] of await provider.imageInfo(
        uniqueFiles.slice(i, i + COMMONS_BATCH),
      )) {
        images.set(file, image);
      }
    }

    const photos = places.flatMap((p) => {
      const file = files.get(p.wikidataId);
      const image = file ? images.get(file) : undefined;
      return image ? [{ placeId: p.id, image }] : [];
    });
    await savePhotos(
      places.map((p) => p.id),
      photos,
    );
    result.checked += places.length;
    result.found += photos.length;
    log(
      `${places.length} places checked, ${photos.length} photos ` +
        `(total ${result.found}/${result.checked}, ${result.rejected} links rejected)`,
    );
    await pause();
  }
  return result;
}

/**
 * Checks the Wikidata links behind photos already imported and removes the photos of links that
 * are a person or lie far from the place (`pnpm db:import-photos -- --recheck`).
 */
export async function recheckWikimediaPhotos(
  provider: WikimediaProvider,
  { pauseMs = 1000, log = () => {} }: { pauseMs?: number; log?: (line: string) => void } = {},
): Promise<{ checked: number; removed: number }> {
  const result = { checked: 0, removed: 0 };
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const rows = await getDb().execute<PlaceRow>(sql`
      SELECT p.id, p.wikidata_id, ST_X(p.location::geometry) AS lng,
             ST_Y(p.location::geometry) AS lat, c.slug AS category
      FROM place p JOIN category c ON c.id = p.category_id
      WHERE p.id > ${after}::uuid AND p.wikidata_id ~ '^Q[0-9]+$'
        AND EXISTS (SELECT 1 FROM media m WHERE m.place_id = p.id AND m.source = 'wikimedia')
      ORDER BY p.id
      LIMIT ${WIKIDATA_BATCH}`);
    if (rows.length === 0) break;
    after = rows.at(-1)!.id;
    const places = rows.map(toPlace);
    const items = await provider.items(places.map((p) => p.wikidataId));
    const wrong = places.filter((p) => {
      const item = items.get(p.wikidataId);
      return item !== undefined && !wikidataFits(p, item);
    });
    if (wrong.length > 0) {
      const removed = await getDb().execute(sql`
        DELETE FROM media
        WHERE source = 'wikimedia'
          AND place_id = ANY(${sql.param(wrong.map((p) => p.id))}::uuid[])
        RETURNING id`);
      result.removed += removed.length;
    }
    result.checked += places.length;
    log(
      `${places.length} rechecked, ${wrong.length} wrong links (${result.removed} photos removed)`,
    );
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  return result;
}
