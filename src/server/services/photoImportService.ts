import { sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  COMMONS_BATCH,
  WIKIDATA_BATCH,
  type CommonsImage,
  type WikimediaProvider,
} from "../providers/wikimedia";

// Photos for places from Wikimedia Commons (docs/07, G1.2): the Wikidata item's main image (P18),
// stored in media with source 'wikimedia', its author, its licence and a link to the file page.
// Images are shown from Wikimedia's servers, never copied.

/** Places are checked again after this long, in case their Wikidata item got an image. */
const RECHECK_AFTER = "90 days";

interface PlaceToCheck {
  id: string;
  wikidataId: string;
}

/**
 * Verified places with a Wikidata id, no Wikimedia photo yet and not checked recently. Curated
 * places and higher-ranked categories first; fuel stations and towns are skipped. `onlyIds`
 * narrows it to those places.
 */
export async function placesNeedingPhotos(
  limit: number,
  onlyIds?: string[],
): Promise<PlaceToCheck[]> {
  const rows = await getDb().execute<{ id: string; wikidata_id: string }>(sql`
    SELECT p.id, p.wikidata_id
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
  return rows.map((r) => ({ id: r.id, wikidataId: r.wikidata_id }));
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
  const result: PhotoImportResult = { checked: 0, found: 0 };
  while (result.checked < limit) {
    const places = await placesNeedingPhotos(
      Math.min(WIKIDATA_BATCH, limit - result.checked),
      onlyIds,
    );
    if (places.length === 0) break;

    const files = await provider.imageFiles(places.map((p) => p.wikidataId));
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
      `${places.length} places checked, ${photos.length} photos (total ${result.found}/${result.checked})`,
    );
    await pause();
  }
  return result;
}
