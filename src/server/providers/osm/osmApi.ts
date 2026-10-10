import { z } from "zod";
import type { LngLat } from "@/lib/geo";
import { createThrottle, ProviderError } from "../http";

// The OpenStreetMap editing API, read only: the current version of elements a places import did
// not see, so a place is closed only when it is really gone or retagged, never because an Overpass
// server answered a tile with nothing (2026-10-09). Multi-fetch, 100 ids per request, one request
// a second, with the import's User-Agent (https://operations.osmfoundation.org/policies/api/).

export const OSM_API_URL = "https://api.openstreetmap.org/api/0.6";
const BATCH = 100;

/** What OpenStreetMap holds for an element now. */
export type OsmCurrent =
  | { id: string; gone: true }
  | { id: string; gone: false; tags: Record<string, string>; location: LngLat | null };

export interface OsmCurrentProvider {
  /** The current state of each id ("node/1", "way/2"); ids that failed to load are left out. */
  fetchCurrent(ids: string[]): Promise<Map<string, OsmCurrent>>;
}

const elementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  visible: z.boolean().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  tags: z.record(z.string(), z.string()).optional(),
});
const responseSchema = z.object({ elements: z.array(elementSchema) });

const PLURAL = { node: "nodes", way: "ways", relation: "relations" } as const;
type OsmType = keyof typeof PLURAL;

export function createOsmApiProvider(
  userAgent: string,
  baseUrl = OSM_API_URL,
  minIntervalMs = 1000,
): OsmCurrentProvider {
  const wait = createThrottle(minIntervalMs);

  async function fetchBatch(type: OsmType, nums: string[], into: Map<string, OsmCurrent>) {
    await wait();
    const url = `${baseUrl}/${PLURAL[type]}.json?${PLURAL[type]}=${nums.join(",")}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new ProviderError(`OSM API request failed: ${String(err)}`, "osm-api");
    }
    // 404: one of the ids never existed (or was redacted). Split until it is found.
    if (res.status === 404 || res.status === 410) {
      if (nums.length === 1) {
        into.set(`${type}/${nums[0]}`, { id: `${type}/${nums[0]}`, gone: true });
        return;
      }
      const half = Math.ceil(nums.length / 2);
      await fetchBatch(type, nums.slice(0, half), into);
      await fetchBatch(type, nums.slice(half), into);
      return;
    }
    if (!res.ok) throw new ProviderError(`OSM API HTTP ${res.status}`, "osm-api", res.status);
    const parsed = responseSchema.safeParse(await res.json().catch(() => undefined));
    if (!parsed.success) throw new ProviderError("OSM API returned an unexpected body", "osm-api");
    for (const el of parsed.data.elements) {
      const id = `${el.type}/${el.id}`;
      into.set(
        id,
        el.visible === false
          ? { id, gone: true }
          : {
              id,
              gone: false,
              tags: el.tags ?? {},
              location: el.lat !== undefined && el.lon !== undefined ? [el.lon, el.lat] : null,
            },
      );
    }
  }

  return {
    async fetchCurrent(ids) {
      const byType = new Map<OsmType, string[]>();
      for (const id of ids) {
        const [type, num] = id.split("/") as [string, string];
        if (!(type in PLURAL) || !/^\d+$/.test(num ?? "")) continue;
        byType.set(type as OsmType, [...(byType.get(type as OsmType) ?? []), num]);
      }
      const found = new Map<string, OsmCurrent>();
      for (const [type, nums] of byType) {
        for (let i = 0; i < nums.length; i += BATCH) {
          try {
            await fetchBatch(type, nums.slice(i, i + BATCH), found);
          } catch (err) {
            // Left out: the caller keeps these places open.
            console.warn(`  OSM API: ${(err as Error).message}; ${type}s left unchecked`);
          }
        }
      }
      return found;
    },
  };
}
