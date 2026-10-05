import { z } from "zod";
import { haversineM } from "@/lib/geo";
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
 * Tag filters for the places import (docs/04-build-plan.md, Phase 3 step 0). Two additions to the
 * plan's list: waterway=waterfall and landuse=reservoir, the older tags most Indian waterfalls and
 * many reservoirs still use.
 */
const PLACE_FILTERS = [
  '["tourism"~"^(viewpoint|attraction|museum|camp_site)$"]',
  '["historic"~"^(fort|castle|monument|ruins|archaeological_site|memorial)$"]',
  '["natural"~"^(waterfall|peak|beach|cave_entrance)$"]',
  '["waterway"="waterfall"]',
  '["water"~"^(lake|reservoir)$"]["name"]',
  '["landuse"="reservoir"]["name"]',
  '["amenity"="place_of_worship"]["wikidata"]',
  '["amenity"="place_of_worship"]["wikipedia"]',
  '["amenity"="fuel"]',
];

export function buildPlacesQuery({ areaIso, bbox }: OsmPlacesRequest): string {
  const [west, south, east, north] = bbox;
  const box = `(${south},${west},${north},${east})`; // Overpass order: S, W, N, E
  const statements = [
    ...PLACE_FILTERS.map((f) => `nwr${f}(area.region)${box};`),
    `node["place"~"^(town|city)$"](area.region)${box};`,
  ];
  // Nodes need "body" for their coordinates; ways and relations only need tags and bounds.
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_S}][maxsize:${QUERY_MAXSIZE_BYTES}];`,
    `area["ISO3166-2"="${areaIso}"]["admin_level"="4"]->.region;`,
    `(${statements.join("")})->.all;`,
    "node.all;out body qt;",
    "way.all;out tags bb qt;",
    "rel.all;out tags bb qt;",
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

export const overpassResponseSchema = z.object({
  elements: z.array(
    z.object({
      type: z.enum(["node", "way", "relation"]),
      id: z.number(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      bounds: boundsSchema.optional(),
      tags: z.record(z.string(), z.string()).default({}),
    }),
  ),
  remark: z.string().optional(),
});

/** Validates a raw Overpass JSON response. Elements without a position are dropped. */
export function parseOverpassResponse(body: unknown): OsmElement[] {
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

  return elements.flatMap((e): OsmElement[] => {
    const id = `${e.type}/${e.id}`;
    if (e.lat !== undefined && e.lon !== undefined) {
      return [{ id, location: [e.lon, e.lat], extentM: 0, tags: e.tags }];
    }
    if (e.bounds) {
      const { minlat, minlon, maxlat, maxlon } = e.bounds;
      return [
        {
          id,
          location: [(minlon + maxlon) / 2, (minlat + maxlat) / 2],
          extentM: haversineM([minlon, minlat], [maxlon, maxlat]),
          tags: e.tags,
        },
      ];
    }
    return [];
  });
}

async function fetchFrom(url: string, userAgent: string, query: string): Promise<OsmElement[]> {
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
  if (res.status === 429 || res.status === 503 || res.status === 504) {
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
  return parseOverpassResponse(await res.json().catch(() => undefined));
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
  async function run(query: string): Promise<OsmElement[]> {
    let lastBusy: OsmServerBusyError | undefined;
    for (let i = 0; i < urls.length; i++) {
      const index = (preferred + i) % urls.length;
      try {
        const elements = await fetchFrom(urls[index]!, userAgent, query);
        preferred = index;
        return elements;
      } catch (err) {
        if (!(err instanceof OsmServerBusyError)) throw err;
        lastBusy = err;
      }
    }
    throw lastBusy!;
  }
  return {
    fetchPlaces: (request) => run(buildPlacesQuery(request)),
    fetchServices: (request) => run(buildServicesQuery(request)),
  };
}

export type { BBox };
