import { z } from "zod";
import { haversineM, type LngLat } from "@/lib/geo";
import { ProviderError } from "../http";
import {
  OsmServerBusyError,
  OsmTileTooBigError,
  type BBox,
  type OsmElement,
  type OsmPlacesProvider,
  type OsmPlacesRequest,
} from "./types";

// Overpass admits a query by the time and memory it declares; under load, big declarations are
// refused with HTTP 504. Tiles that really need more are split by the importer.
const QUERY_TIMEOUT_S = 90;
const QUERY_MAXSIZE_BYTES = 128 * 1024 * 1024;

/**
 * Tag filters for the places import (docs/04-build-plan.md, Phase 3 step 0). Additions to the
 * plan's list: waterway=waterfall and landuse=reservoir (the older tags most Indian waterfalls and
 * many reservoirs still use); and, from the coverage import of 2026-10-05, every named Hindu,
 * Jain and Buddhist temple (before, only those with a Wikidata link: 26 of 2,842 in Karnataka),
 * zoos, galleries, theme parks, botanical gardens, dams, tombs, palaces and city gates.
 */
const PLACE_FILTERS = [
  '["tourism"~"^(viewpoint|attraction|museum|camp_site|zoo|theme_park|aquarium|gallery)$"]',
  '["historic"~"^(fort|castle|monument|ruins|archaeological_site|memorial|tomb|palace|city_gate|monastery)$"]',
  '["natural"~"^(waterfall|peak|beach|cave_entrance)$"]',
  '["waterway"="waterfall"]',
  '["waterway"="dam"]["name"]',
  '["water"~"^(lake|reservoir)$"]["name"]',
  '["landuse"="reservoir"]["name"]',
  '["leisure"="garden"]["garden:type"="botanical"]["name"]',
  '["amenity"="place_of_worship"]["religion"~"^(hindu|jain|buddhist)$"]["name"]',
  '["amenity"="place_of_worship"]["wikidata"]',
  '["amenity"="place_of_worship"]["wikipedia"]',
  '["amenity"="fuel"]',
  // Added 2026-10-10 (G4): mountain passes, hot springs, glaciers, treks, and food stops riders
  // look for (highway services, dhabas, notable restaurants and coffee houses), not every eatery.
  '["mountain_pass"="yes"]["name"]',
  '["natural"~"^(hot_spring|glacier)$"]["name"]',
  '["route"="hiking"]["name"]',
  '["highway"="trailhead"]["name"]',
  '["highway"~"^(services|rest_area)$"]["name"]',
  '["amenity"~"^(restaurant|fast_food)$"]["name"~"dhaba",i]',
  '["amenity"~"^(restaurant|fast_food|cafe)$"]["wikidata"]',
  '["amenity"="cafe"]["name"~"coffee (house|day)",i]',
];

/**
 * National parks, wildlife sanctuaries and other protected areas: fetched with their outline
 * (out geom), so a road through the park finds it. The classifier keeps the wildlife ones.
 */
const AREA_FILTERS = [
  '["boundary"="national_park"]["name"]',
  '["boundary"="protected_area"]["name"]',
  '["leisure"="nature_reserve"]["name"]',
];

export function buildPlacesQuery({ areaIso, bbox }: OsmPlacesRequest): string {
  const [west, south, east, north] = bbox;
  const box = `(${south},${west},${north},${east})`; // Overpass order: S, W, N, E
  const statements = [
    ...PLACE_FILTERS.map((f) => `nwr${f}(area.region)${box};`),
    // Every village: the classifier keeps the well-known ones (names in two or more languages,
    // a Wikidata link or 5,000 people), such as Masinagudi.
    `node["place"~"^(town|city|village)$"](area.region)${box};`,
  ];
  const areas = AREA_FILTERS.map((f) => `wr${f}(area.region)${box};`);
  // Nodes need "body" for their coordinates; ways and relations only need tags and bounds,
  // except protected areas, which come with their outline.
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_S}][maxsize:${QUERY_MAXSIZE_BYTES}];`,
    `area["ISO3166-2"="${areaIso}"]["admin_level"="4"]->.region;`,
    ".region out ids;",
    `(${areas.join("")})->.areas;`,
    `(${statements.join("")})->.found;`,
    "(.found; - .areas;)->.all;",
    "node.all;out body qt;",
    "way.all;out tags bb qt;",
    "rel.all;out tags bb qt;",
    "way.areas;out geom qt;",
    "rel.areas;out geom qt;",
  ].join("\n");
}

/**
 * Tag filters for service points (docs/02, "Safety stops"): hospitals, police, ATMs, tyre and
 * repair shops and stays, kept apart from places (no pages) in service_point.
 */
const SERVICE_FILTERS = [
  '["amenity"="hospital"]',
  '["healthcare"="hospital"]',
  '["amenity"="police"]',
  '["amenity"="atm"]',
  '["amenity"="bank"]["atm"="yes"]',
  '["shop"~"^(tyres|motorcycle_repair|car_repair|motorcycle)$"]',
  '["tourism"~"^(hotel|guest_house|hostel|motel)$"]',
];

export function buildServicesQuery({ areaIso, bbox }: OsmPlacesRequest): string {
  const [west, south, east, north] = bbox;
  const box = `(${south},${west},${north},${east})`;
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_S}][maxsize:${QUERY_MAXSIZE_BYTES}];`,
    `area["ISO3166-2"="${areaIso}"]["admin_level"="4"]->.region;`,
    ".region out ids;",
    `(${SERVICE_FILTERS.map((f) => `nwr${f}(area.region)${box};`).join("")})->.all;`,
    "node.all;out body qt;",
    "way.all;out tags bb qt;",
    "rel.all;out tags bb qt;",
  ].join("\n");
}

const boundsSchema = z.object({
  minlat: z.number(),
  minlon: z.number(),
  maxlat: z.number(),
  maxlon: z.number(),
});

const geometrySchema = z.array(z.object({ lat: z.number(), lon: z.number() }).nullable());

export const overpassResponseSchema = z.object({
  elements: z.array(
    z.object({
      // "area": the state's boundary, printed first by the queries above (see AREA_MISSING).
      type: z.enum(["node", "way", "relation", "area"]),
      id: z.number(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      bounds: boundsSchema.optional(),
      tags: z.record(z.string(), z.string()).default({}),
      // With "out geom": a way's points, a relation's members with theirs.
      geometry: geometrySchema.optional(),
      members: z
        .array(
          z.object({
            type: z.string(),
            role: z.string().default(""),
            geometry: geometrySchema.optional(),
          }),
        )
        .optional(),
    }),
  ),
  remark: z.string().optional(),
});

/**
 * Validates a raw Overpass JSON response. Elements without a position are dropped. With
 * `areaIso`, the answer must include that state's area (the queries print it first): a server
 * whose area index lacks the state answers every tile with nothing and HTTP 200, which looked
 * like empty tiles (Jhansi, Lalitpur, 2026-10-07). That server is treated as busy, so the next
 * one is tried.
 */
export function parseOverpassResponse(body: unknown, areaIso?: string): OsmElement[] {
  const parsed = overpassResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new ProviderError("Overpass returned an unexpected response", "overpass");
  const { elements, remark } = parsed.data;

  // Overpass reports runtime errors in "remark" with HTTP 200 and partial data.
  if (remark && /error/i.test(remark)) {
    if (/timed out|out of memory|too (much|many)/i.test(remark))
      throw new OsmTileTooBigError(remark);
    throw new ProviderError(`Overpass: ${remark}`, "overpass");
  }
  if (areaIso && !elements.some((e) => e.type === "area")) {
    throw new OsmServerBusyError(`the server has no area for ${areaIso} (empty answer)`, 0);
  }

  return elements.flatMap((e): OsmElement[] => {
    if (e.type === "area") return [];
    const id = `${e.type}/${e.id}`;
    if (e.lat !== undefined && e.lon !== undefined) {
      return [{ id, location: [e.lon, e.lat], extentM: 0, tags: e.tags }];
    }
    if (e.bounds) {
      const { minlat, minlon, maxlat, maxlon } = e.bounds;
      const outline = outlineOf(e);
      return [
        {
          id,
          location: [(minlon + maxlon) / 2, (minlat + maxlat) / 2],
          extentM: haversineM([minlon, minlat], [maxlon, maxlat]),
          tags: e.tags,
          ...(outline ? { outline } : {}),
        },
      ];
    }
    return [];
  });
}

type OverpassElement = z.infer<typeof overpassResponseSchema>["elements"][number];

/** A way's line, or a relation's outer ways, from "out geom"; undefined without geometry. */
function outlineOf(e: OverpassElement): LngLat[][] | undefined {
  const line = (g: z.infer<typeof geometrySchema>): LngLat[] =>
    g.flatMap((p): LngLat[] => (p ? [[p.lon, p.lat]] : []));
  const lines =
    e.type === "way"
      ? e.geometry
        ? [line(e.geometry)]
        : []
      : (e.members ?? [])
          .filter((m) => m.type === "way" && m.role !== "inner" && m.geometry)
          .map((m) => line(m.geometry!));
  const kept = lines.filter((l) => l.length >= 2);
  return kept.length > 0 ? kept : undefined;
}

async function fetchFrom(
  url: string,
  userAgent: string,
  query: string,
  areaIso: string,
): Promise<OsmElement[]> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": userAgent },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout((QUERY_TIMEOUT_S + 60) * 1000),
    });
  } catch (err) {
    // Status 0: the server could not be reached (network error or no answer in time).
    throw new OsmServerBusyError(`${new URL(url).host} unreachable: ${String(err)}`, 0);
  }
  // 500 and 502: the server or its proxy is in trouble (kumi and private.coffee, 2026-10-09);
  // another server may answer.
  if ([429, 500, 502, 503, 504].includes(res.status)) {
    throw new OsmServerBusyError(`${new URL(url).host} HTTP ${res.status}`, res.status);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(
      `Overpass HTTP ${res.status}: ${text.slice(0, 300)}`,
      "overpass",
      res.status,
    );
  }
  try {
    return parseOverpassResponse(await res.json().catch(() => undefined), areaIso);
  } catch (err) {
    if (err instanceof OsmServerBusyError) {
      throw new OsmServerBusyError(`${new URL(url).host}: ${err.message}`, err.status);
    }
    throw err;
  }
}

/**
 * Overpass API client over one or more public endpoints. Each request starts with the endpoint
 * that last answered and moves on to the next when one is unreachable or busy, so one server
 * being down does not stop an import. Callers must send one request at a time
 * (see scripts/import-osm.ts).
 */
export function createOverpassProvider(urls: string[], userAgent: string): OsmPlacesProvider {
  if (urls.length === 0) throw new Error("No Overpass endpoints configured");
  let preferred = 0;
  // An empty answer is checked with the next server that answers: some servers answer tiles
  // full of places (Jaipur, 2026-10-09) with nothing, the state's area included. Empty is
  // accepted when another server agrees (or only one is configured). When no other server
  // answers, the tile is treated as busy and retried, never taken as empty: an empty tile
  // ends with its places marked closed.
  async function run(query: string, areaIso: string): Promise<OsmElement[]> {
    let lastBusy: OsmServerBusyError | undefined;
    let sawEmpty = false;
    for (let i = 0; i < urls.length; i++) {
      const index = (preferred + i) % urls.length;
      try {
        const elements = await fetchFrom(urls[index]!, userAgent, query, areaIso);
        if (elements.length === 0 && !sawEmpty && urls.length > 1) {
          sawEmpty = true;
          continue;
        }
        preferred = index;
        return elements;
      } catch (err) {
        if (!(err instanceof OsmServerBusyError)) throw err;
        lastBusy = err;
      }
    }
    if (sawEmpty) {
      throw new OsmServerBusyError("empty answer, and no other server answered to confirm it", 429);
    }
    throw lastBusy!;
  }
  return {
    fetchPlaces: (request) => run(buildPlacesQuery(request), request.areaIso),
    fetchServices: (request) => run(buildServicesQuery(request), request.areaIso),
  };
}

export type { BBox };
