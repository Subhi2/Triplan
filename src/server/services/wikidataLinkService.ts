import { sql } from "drizzle-orm";
import { haversineM, type LngLat } from "@/lib/geo";
import { getDb } from "../db";
import type { WikidataPlaceItem, WikimediaProvider } from "../providers/wikimedia";

// Wikidata links for places that have none (docs/04, G4 step C3). Only 14% of places had one, and
// photos and descriptions come through it. Places are grouped into tiles; each tile's Wikidata
// items with coordinates and an English name are fetched once, and a place takes the item with a
// clearly similar name close by. Links are stored as place.wikidata_id; the OSM import keeps them.

/** Categories worth a link: the ones with photos and articles. */
export const LINK_CATEGORIES = [
  "heritage",
  "fort",
  "temple",
  "worship",
  "museum",
  "waterfall",
  "lake",
  "peak",
  "pass",
  "viewpoint",
  "cave",
  "beach",
  "wildlife",
  "attraction",
] as const;

/** Degrees per tile side: one Wikidata query each. */
export const TILE_DEG = 0.5;
/** Name similarity needed (trigrams, as pg_trgm): "Jog Falls" ~ "Jog falls" yes, "Jog" no. */
const MIN_SIMILARITY = 0.6;
/** A runner-up this close in similarity makes the match ambiguous: no link. */
const AMBIGUOUS_GAP = 0.05;
/** How far the item may be from our point; big places have their point far from the item's. */
const MAX_OFF_M: Record<string, number> = {
  wildlife: 20_000,
  lake: 5_000,
  beach: 5_000,
  peak: 3_000,
  pass: 3_000,
};
const DEFAULT_MAX_OFF_M = 1_000;

export interface PlaceToLink {
  id: string;
  name: string;
  category: string;
  location: LngLat;
}

function trigrams(text: string): Set<string> {
  const grams = new Set<string>();
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  for (const w of words) {
    const padded = `  ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

function gramSimilarity(ta: Set<string>, tb: Set<string>): number {
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** Trigram similarity of two names, 0–1, like Postgres' pg_trgm similarity(). */
export function nameSimilarity(a: string, b: string): number {
  return gramSimilarity(trigrams(a), trigrams(b));
}

/**
 * Words that say what a place is. A place named with one ("Kadinamkulam Lake") only takes an
 * item whose name has it too, never the village it is named after ("Kadinamkulam").
 */
const KIND_WORDS =
  /\b(lake|kere|beach|fort|kote|falls?|waterfalls?|temple|mandir|church|mosque|masjid|dam|caves?|palace|museum|peak|park|sanctuary|reservoir)\b/gi;

function kindWords(name: string): Set<string> {
  return new Set([...name.toLowerCase().matchAll(KIND_WORDS)].map((m) => m[1]!.replace(/s$/, "")));
}

/**
 * The item for each place: a similar name within the category's distance, not ambiguous, not
 * already linked elsewhere, and each item to one place only (the closest). Place id -> item id.
 */
export function matchItems(
  places: PlaceToLink[],
  items: WikidataPlaceItem[],
  taken: Set<string> = new Set(),
): Map<string, string> {
  // Names are split into trigrams once; distance is checked before names.
  const pool = items
    .filter((i) => !taken.has(i.id))
    .map((i) => ({ item: i, grams: trigrams(i.label), kinds: kindWords(i.label) }));
  const best = new Map<string, { itemId: string; sim: number; distanceM: number }>();
  for (const p of places) {
    const max = MAX_OFF_M[p.category] ?? DEFAULT_MAX_OFF_M;
    const maxDeg = max / 100_000; // generous: a degree is at least 100 km in India
    const grams = trigrams(p.name);
    const kinds = kindWords(p.name);
    const scored = pool
      .filter(
        (c) =>
          Math.abs(c.item.location[1] - p.location[1]) <= maxDeg &&
          Math.abs(c.item.location[0] - p.location[0]) <= maxDeg * 1.1,
      )
      .map((c) => ({
        itemId: c.item.id,
        sim: gramSimilarity(grams, c.grams),
        distanceM: haversineM(p.location, c.item.location),
        kindsMatch: [...kinds].every((k) => c.kinds.has(k)),
      }))
      .filter((c) => c.sim >= MIN_SIMILARITY && c.distanceM <= max && c.kindsMatch)
      .sort((a, b) => b.sim - a.sim || a.distanceM - b.distanceM);
    const [top, next] = scored;
    if (!top) continue;
    if (next && next.itemId !== top.itemId && top.sim - next.sim < AMBIGUOUS_GAP) continue;
    best.set(p.id, top);
  }
  // One place per item: the closest keeps it.
  const byItem = new Map<string, { placeId: string; distanceM: number }>();
  for (const [placeId, m] of best) {
    const held = byItem.get(m.itemId);
    if (!held || m.distanceM < held.distanceM) {
      byItem.set(m.itemId, { placeId, distanceM: m.distanceM });
    }
  }
  return new Map([...byItem].map(([itemId, { placeId }]) => [placeId, itemId]));
}

/** "77.5,12.5" -> the tile's box [west, south, east, north]. */
export function tileBox(key: string): [number, number, number, number] {
  const [w, s] = key.split(",").map(Number) as [number, number];
  return [w, s, w + TILE_DEG, s + TILE_DEG];
}

export function tileKey([lng, lat]: LngLat): string {
  const snap = (v: number) => Math.floor(v / TILE_DEG) * TILE_DEG;
  return `${snap(lng)},${snap(lat)}`;
}

/** Tiles that hold verified places of the link categories with no Wikidata id, most first. */
export async function tilesToLink(): Promise<{ key: string; places: number }[]> {
  const rows = await getDb().execute<{ w: number; s: number; n: number }>(sql`
    SELECT floor(ST_X(p.location::geometry) / ${TILE_DEG}) * ${TILE_DEG} AS w,
           floor(ST_Y(p.location::geometry) / ${TILE_DEG}) * ${TILE_DEG} AS s,
           count(*)::int AS n
    FROM place p JOIN category c ON c.id = p.category_id
    WHERE p.status = 'verified' AND p.wikidata_id IS NULL
      AND c.slug = ANY(${sql.param([...LINK_CATEGORIES])}::text[])
    GROUP BY 1, 2
    ORDER BY n DESC`);
  return rows.map((r) => ({ key: `${Number(r.w)},${Number(r.s)}`, places: r.n }));
}

async function placesInTile(key: string): Promise<PlaceToLink[]> {
  const [w, s, e, n] = tileBox(key);
  const rows = await getDb().execute<{
    id: string;
    name: string;
    category: string;
    lng: number;
    lat: number;
  }>(sql`
    SELECT p.id, p.name, c.slug AS category,
           ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat
    FROM place p JOIN category c ON c.id = p.category_id
    WHERE p.status = 'verified' AND p.wikidata_id IS NULL
      AND c.slug = ANY(${sql.param([...LINK_CATEGORIES])}::text[])
      AND ST_X(p.location::geometry) >= ${w} AND ST_X(p.location::geometry) < ${e}
      AND ST_Y(p.location::geometry) >= ${s} AND ST_Y(p.location::geometry) < ${n}`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    location: [r.lng, r.lat],
  }));
}

/** Wikidata ids already on some place: never given to a second one. */
async function linkedIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await getDb().execute<{ wikidata_id: string }>(sql`
    SELECT DISTINCT wikidata_id FROM place
    WHERE wikidata_id = ANY(${sql.param(ids)}::text[])`);
  return new Set(rows.map((r) => r.wikidata_id));
}

/** Links one tile's places; returns how many links were (or, dry, would be) made. */
export async function linkTile(
  provider: WikimediaProvider,
  key: string,
  { dryRun = false, log = () => {} }: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<{ places: number; items: number; linked: number }> {
  const places = await placesInTile(key);
  if (places.length === 0) return { places: 0, items: 0, linked: 0 };
  const items = await provider.itemsInBox(tileBox(key));
  const taken = await linkedIds(items.map((i) => i.id));
  const matches = matchItems(places, items, taken);
  if (dryRun) {
    const name = new Map(places.map((p) => [p.id, p.name]));
    const label = new Map(items.map((i) => [i.id, i.label]));
    for (const [placeId, itemId] of [...matches].slice(0, 10)) {
      log(`    ${name.get(placeId)} -> ${itemId} ${label.get(itemId)}`);
    }
  } else if (matches.size > 0) {
    const rows = [...matches].map(([id, q]) => ({ id, q }));
    await getDb().execute(sql`
      UPDATE place p SET wikidata_id = m.q
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS m(id uuid, q text)
      WHERE p.id = m.id AND p.wikidata_id IS NULL`);
  }
  return { places: places.length, items: items.length, linked: matches.size };
}
