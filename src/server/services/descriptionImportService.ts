import { sql } from "drizzle-orm";
import type { LngLat } from "@/lib/geo";
import { getDb } from "../db";
import {
  EXTRACT_BATCH,
  WIKIDATA_BATCH,
  type WikidataItem,
  type WikimediaProvider,
  type WikipediaIntro,
  type WikipediaProvider,
} from "../providers/wikimedia";
import { wikidataFits } from "./wikidataCheck";

// Descriptions for places from open text (docs/04, G4 step C2): the opening sentences of the
// English Wikipedia article (CC BY-SA 4.0, credited with a link), else Wikidata's own short
// description (CC0) when it says more than the category does. Only places with no description;
// a Wikidata link that is a person or lies far from the place gives no text.

/** Places are looked at again after this long, in case an article was written. */
const RECHECK_AFTER = "90 days";
/** Shorter intros are stubs ("X is a village."). */
const MIN_INTRO_CHARS = 80;
/** Shorter Wikidata descriptions only repeat the category ("temple in India"). */
const MIN_WIKIDATA_CHARS = 40;

export interface PlaceForText {
  id: string;
  wikidataId: string | null;
  /** The OSM wikipedia tag ("en:Jog Falls"). */
  wikipediaTag: string | null;
  location: LngLat;
  category: string;
}

export interface DescriptionFound {
  text: string;
  source: "wikipedia" | "wikidata";
  license: string;
  url: string;
}

interface PlaceRow extends Record<string, unknown> {
  id: string;
  wikidata_id: string | null;
  wikipedia: string | null;
  lng: number;
  lat: number;
  category: string;
}

/**
 * Verified places with no description, a Wikidata id or an English Wikipedia tag, not checked
 * recently. Curated places and higher-ranked categories first; fuel stations and towns skipped.
 */
export async function placesNeedingDescriptions(
  limit: number,
  onlyIds?: string[],
): Promise<PlaceForText[]> {
  const rows = await getDb().execute<PlaceRow>(sql`
    SELECT p.id, p.wikidata_id, p.osm_tags->>'wikipedia' AS wikipedia,
           ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat,
           c.slug AS category
    FROM place p
    JOIN category c ON c.id = p.category_id
    WHERE p.status = 'verified' AND p.description IS NULL
      AND c.slug NOT IN ('fuel', 'town')
      AND (p.wikidata_id ~ '^Q[0-9]+$' OR p.osm_tags->>'wikipedia' LIKE 'en:%')
      AND (p.description_checked_at IS NULL
           OR p.description_checked_at < now() - ${RECHECK_AFTER}::interval)
      AND (${onlyIds === undefined} OR p.id = ANY(${sql.param(onlyIds ?? [])}::uuid[]))
    ORDER BY (p.source <> 'osm') DESC, c.weight DESC, p.id
    LIMIT ${limit}`);
  return rows.map((r) => ({
    id: r.id,
    wikidataId: r.wikidata_id && /^Q\d+$/.test(r.wikidata_id) ? r.wikidata_id : null,
    wikipediaTag: r.wikipedia,
    location: [r.lng, r.lat],
    category: r.category,
  }));
}

/** The English article to read: the OSM wikipedia tag, else the Wikidata item's article. */
export function articleTitle(place: PlaceForText, item: WikidataItem | undefined): string | null {
  const tag = /^en:(.+)$/.exec(place.wikipediaTag?.trim() ?? "")?.[1]?.trim();
  return tag || item?.enwiki || null;
}

/** The text to show for a place, with its credit, or null. */
export function pickDescription(
  place: PlaceForText,
  item: WikidataItem | undefined,
  intro: WikipediaIntro | undefined,
): DescriptionFound | null {
  if (item && !wikidataFits(place, item)) return null;
  if (intro && intro.text.length >= MIN_INTRO_CHARS) {
    return { text: intro.text, source: "wikipedia", license: "CC BY-SA 4.0", url: intro.url };
  }
  const short = item?.description?.trim();
  if (short && short.length >= MIN_WIKIDATA_CHARS && place.wikidataId) {
    return {
      text: `${short.charAt(0).toUpperCase()}${short.slice(1)}${/[.!?]$/.test(short) ? "" : "."}`,
      source: "wikidata",
      license: "CC0",
      url: `https://www.wikidata.org/wiki/${place.wikidataId}`,
    };
  }
  return null;
}

/** Stores what was found and marks every checked place. Never overwrites a description. */
export async function saveDescriptions(
  checkedIds: string[],
  found: { placeId: string; description: DescriptionFound }[],
): Promise<void> {
  if (checkedIds.length === 0) return;
  await getDb().transaction(async (tx) => {
    if (found.length > 0) {
      const rows = found.map((f) => ({ id: f.placeId, ...f.description }));
      await tx.execute(sql`
        UPDATE place p
        SET description = d.text, description_source = d.source,
            description_license = d.license, description_url = d.url
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          AS d(id uuid, text text, source text, license text, url text)
        WHERE p.id = d.id AND p.description IS NULL`);
    }
    await tx.execute(sql`
      UPDATE place SET description_checked_at = now()
      WHERE id = ANY(${sql.param(checkedIds)}::uuid[])`);
  });
}

export interface DescriptionImportResult {
  checked: number;
  fromWikipedia: number;
  fromWikidata: number;
}

/**
 * Looks for descriptions for up to `limit` places, WIKIDATA_BATCH at a time, pausing between
 * requests so the run stays a light user of Wikidata and Wikipedia. Safe to stop and re-run.
 */
export async function importDescriptions(
  wikidata: WikimediaProvider,
  wikipedia: WikipediaProvider,
  {
    limit,
    onlyIds,
    pauseMs = 1000,
    log = () => {},
  }: { limit: number; onlyIds?: string[]; pauseMs?: number; log?: (line: string) => void },
): Promise<DescriptionImportResult> {
  const pause = () => new Promise((resolve) => setTimeout(resolve, pauseMs));
  const result: DescriptionImportResult = { checked: 0, fromWikipedia: 0, fromWikidata: 0 };
  while (result.checked < limit) {
    const places = await placesNeedingDescriptions(
      Math.min(WIKIDATA_BATCH, limit - result.checked),
      onlyIds,
    );
    if (places.length === 0) break;

    const ids = [...new Set(places.flatMap((p) => (p.wikidataId ? [p.wikidataId] : [])))];
    const items = ids.length > 0 ? await wikidata.items(ids) : new Map<string, WikidataItem>();
    const titleOf = new Map(
      places.map((p) => {
        const item = p.wikidataId ? items.get(p.wikidataId) : undefined;
        return [p.id, item && !wikidataFits(p, item) ? null : articleTitle(p, item)];
      }),
    );
    const titles = [...new Set([...titleOf.values()].filter((t): t is string => !!t))];
    const intros = new Map<string, WikipediaIntro>();
    for (let i = 0; i < titles.length; i += EXTRACT_BATCH) {
      await pause();
      for (const [t, intro] of await wikipedia.intros(titles.slice(i, i + EXTRACT_BATCH))) {
        intros.set(t, intro);
      }
    }

    const found = places.flatMap((p) => {
      const title = titleOf.get(p.id);
      const description = pickDescription(
        p,
        p.wikidataId ? items.get(p.wikidataId) : undefined,
        title ? intros.get(title) : undefined,
      );
      return description ? [{ placeId: p.id, description }] : [];
    });
    await saveDescriptions(
      places.map((p) => p.id),
      found,
    );
    result.checked += places.length;
    result.fromWikipedia += found.filter((f) => f.description.source === "wikipedia").length;
    result.fromWikidata += found.filter((f) => f.description.source === "wikidata").length;
    log(
      `${places.length} places checked, ${found.length} descriptions ` +
        `(total ${result.fromWikipedia} Wikipedia, ${result.fromWikidata} Wikidata, ` +
        `${result.checked} checked)`,
    );
    await pause();
  }
  return result;
}
