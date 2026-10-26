// Spike for G5 step 13: is Overture Places worth importing? For two test rides it counts fuel,
// food and coffee along the route in Overture and in our data, how many Overture records we
// already have (within 150 m, similar name), and prints new ones to check by hand.
//   pnpm spike:open-places                      (newest release)
//   pnpm spike:open-places -- --release=2026-10-21.0 --sample=25
// Read only: it writes nothing to the database.
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import type { LineString } from "geojson";
import type { LngLat } from "../src/lib/geo";
import { closeDb, getDb } from "../src/server/db";
import { getOpenPlacesProvider, type BBox } from "../src/server/providers/openPlaces";
import { getRoutingProvider } from "../src/server/providers/routing";
import {
  classifyOpenPlace,
  isOpenPlaceCandidate,
  OPEN_PLACE_BASIC_CATEGORIES,
  OPEN_PLACE_CATEGORIES,
  type OpenPlaceCandidate,
  type OpenPlaceCategory,
} from "../src/server/services/openPlaceClassify";

const RIDES: { name: string; waypoints: LngLat[] }[] = [
  {
    name: "Bengaluru → Kalasa via Sakleshpur",
    waypoints: [
      [77.5946, 12.9716],
      [75.785, 12.943],
      [75.3576, 13.2346],
    ],
  },
  {
    name: "Pune → Goa (Panaji)",
    waypoints: [
      [73.8567, 18.5204],
      [73.8278, 15.4909],
    ],
  },
];

const CORRIDOR_M = 5_000;
const NEAR_ROAD_M = 1_000;
const SAME_PLACE_M = 150;
const SIMILAR_NAME = 0.4;
const OPEN_ROAD_FROM_KM = 40;
const OPEN_ROAD_TO_END_KM = 20;
const CATEGORIES = Object.keys(OPEN_PLACE_CATEGORIES) as OpenPlaceCategory[];

interface Matched extends Record<string, unknown> {
  id: string;
  detour_m: number;
  km: number;
  same: boolean;
  near_same_kind: boolean;
}

function boxOf(line: LineString, padDeg = 0.05): BBox {
  const xs = line.coordinates.map((c) => c[0]!);
  const ys = line.coordinates.map((c) => c[1]!);
  return [
    Math.min(...xs) - padDeg,
    Math.min(...ys) - padDeg,
    Math.max(...xs) + padDeg,
    Math.max(...ys) + padDeg,
  ];
}

/** Overture candidates within the corridor, with whether one of ours is the same place. */
async function matchAlong(line: LineString, candidates: OpenPlaceCandidate[]) {
  const rows = candidates.map((c) => ({
    id: c.externalId,
    name: c.name,
    cat: c.category,
    lng: c.location[0],
    lat: c.location[1],
  }));
  return getDb().execute<Matched>(sql`
    WITH r AS MATERIALIZED (
      SELECT g, ST_Length(g::geography) AS len, g::geography AS gg
      FROM (SELECT ST_Simplify(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(line)}), 4326),
                               0.0005) AS g) s
    ), o AS (
      SELECT x.*, ST_SetSRID(ST_MakePoint(x.lng, x.lat), 4326)::geography AS loc
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
        AS x(id text, name text, cat text, lng float8, lat float8)
    ), along AS (
      SELECT o.*, ST_Distance(o.loc, r.gg) AS detour_m,
             ST_LineLocatePoint(r.g, o.loc::geometry) * r.len / 1000 AS km
      FROM o, r WHERE ST_DWithin(o.loc, r.gg, ${CORRIDOR_M})
    )
    SELECT a.id, a.detour_m, a.km,
      -- A pump is listed by brand in one dataset and by dealer in the other: distance is enough.
      (a.cat = 'fuel' AND EXISTS (SELECT 1 FROM place p JOIN category c ON c.id = p.category_id
                WHERE c.slug = 'fuel' AND ST_DWithin(p.location, a.loc, ${SAME_PLACE_M})))
      OR EXISTS (SELECT 1 FROM place p WHERE ST_DWithin(p.location, a.loc, ${SAME_PLACE_M})
                AND similarity(p.name, a.name) > ${SIMILAR_NAME})
      OR EXISTS (SELECT 1 FROM service_point s WHERE ST_DWithin(s.location, a.loc, ${SAME_PLACE_M})
                AND similarity(coalesce(s.name, ''), a.name) > ${SIMILAR_NAME}) AS same,
      EXISTS (SELECT 1 FROM place p JOIN category c ON c.id = p.category_id
                WHERE c.slug = a.cat AND ST_DWithin(p.location, a.loc, ${SAME_PLACE_M}))
        AS near_same_kind
    FROM along a`);
}

/** Our own fuel, food and coffee along the route, by category (within the corridor). */
async function oursAlong(line: LineString) {
  const geo = JSON.stringify(line);
  const places = await getDb().execute<{ category: string; n: number; near: number }>(sql`
    SELECT category, count(*)::int AS n, count(*) FILTER (WHERE detour_m <= ${NEAR_ROAD_M})::int AS near
    FROM places_along_route(${geo}, ${CORRIDOR_M}, ${sql.param(CATEGORIES)}::text[])
    GROUP BY 1`);
  const out = new Map(CATEGORIES.map((c) => [c, { n: 0, near: 0 }]));
  for (const p of places) out.set(p.category as OpenPlaceCategory, { n: p.n, near: p.near });
  return out;
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const hashOrder = (id: string) => createHash("md5").update(id).digest("hex");

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: { release: { type: "string" }, sample: { type: "string", default: "25" } },
  });
  const sampleSize = Number(values.sample);
  const provider = await getOpenPlacesProvider(values.release);
  console.log(`Overture Places ${provider.release}; corridor ${CORRIDOR_M / 1000} km\n`);

  try {
    for (const ride of RIDES) {
      const [route] = await getRoutingProvider().route({
        waypoints: ride.waypoints,
        alternatives: false,
        profile: "bike",
      });
      if (!route) throw new Error(`No route for ${ride.name}`);
      const line = route.geometry;
      const records = await provider.placesInBox(boxOf(line), OPEN_PLACE_BASIC_CATEGORIES);
      const classified = records.map((r) => classifyOpenPlace(r));
      const skips = new Map<string, number>();
      for (const c of classified) {
        if (!isOpenPlaceCandidate(c)) skips.set(c.skip, (skips.get(c.skip) ?? 0) + 1);
      }
      const candidates = classified.filter(isOpenPlaceCandidate);
      // Below the confidence floor, for comparison: how many more there would be at 0.5.
      const lowConfidence = records
        .map((r) => classifyOpenPlace(r, 0.5))
        .filter(isOpenPlaceCandidate).length;
      const matched = new Map((await matchAlong(line, candidates)).map((m) => [m.id, m]));
      const ours = await oursAlong(line);

      console.log(`## ${ride.name}: ${(route.distanceM / 1000).toFixed(1)} km`);
      console.log(
        `In the box: ${records.length} records; ${candidates.length} pass (0.7), ` +
          `${lowConfidence} would at 0.5; skipped ${[...skips].map(([k, n]) => `${k} ${n}`).join(", ")}`,
      );
      console.log(
        "category | ours (≤1 km) | Overture along (≤1 km) | same as ours | near ours, other name | new (≤1 km)",
      );
      const newOnes: (OpenPlaceCandidate & Matched)[] = [];
      for (const cat of CATEGORIES) {
        const along = candidates
          .filter((c) => c.category === cat && matched.has(c.externalId))
          .map((c) => ({ ...c, ...matched.get(c.externalId)! }));
        const fresh = along.filter((a) => !a.same && !a.near_same_kind);
        newOnes.push(...fresh);
        const near = (xs: typeof along) => xs.filter((a) => a.detour_m <= NEAR_ROAD_M).length;
        const o = ours.get(cat)!;
        console.log(
          `${cat.padEnd(8)} | ${pad(o.n, 4)} (${pad(o.near, 3)}) | ${pad(along.length, 5)} (${pad(near(along), 4)}) | ` +
            `${pad(along.filter((a) => a.same).length, 4)} | ` +
            `${pad(along.filter((a) => !a.same && a.near_same_kind).length, 4)} | ` +
            `${pad(fresh.length, 4)} (${pad(near(fresh), 4)})`,
        );
      }

      // The open road, where riders need food and fuel most: not the first 40 km or last 20 km.
      const routeKm = route.distanceM / 1000;
      const openRoad = newOnes.filter(
        (n) => n.km >= OPEN_ROAD_FROM_KM && n.km <= routeKm - OPEN_ROAD_TO_END_KM,
      );
      const byCategory = CATEGORIES.map((c) => {
        const ofCategory = openRoad.filter((n) => n.category === c);
        const near = ofCategory.filter((n) => n.detour_m <= NEAR_ROAD_M).length;
        return `${c} ${ofCategory.length} (${near})`;
      });
      console.log(`New on the open road (≤1 km): ${byCategory.join(", ")}`);
      const sample = openRoad
        .sort((a, b) => hashOrder(a.externalId).localeCompare(hashOrder(b.externalId)))
        .slice(0, sampleSize)
        .sort((a, b) => a.km - b.km);
      console.log(`\nNew on the open road, to check by hand (${sample.length}):`);
      for (const s of sample) {
        const r = records.find((x) => x.id === s.externalId)!;
        console.log(
          `- km ${s.km.toFixed(0)} +${(s.detour_m / 1000).toFixed(1)} km | ${s.category} | ${s.name} | ` +
            `${r.detailCategory ?? r.basicCategory} | conf ${s.confidence.toFixed(2)} | ` +
            `${s.datasets.join("+")} | ${r.locality ?? "-"} | ${r.website ?? "-"} | ` +
            `${s.location[1].toFixed(5)},${s.location[0].toFixed(5)}`,
        );
      }
      console.log("");
    }
  } finally {
    provider.close();
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
