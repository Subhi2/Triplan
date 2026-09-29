// Records raw OSRM responses for the test trips into tests/fixtures/osrm/.
// Tests parse these instead of calling OSRM. Re-run only when the fixtures need refreshing:
//   pnpm fixtures:routes
import { mkdir, writeFile } from "node:fs/promises";
import type { LngLat } from "../src/lib/geo";
import { buildOsrmRouteUrl, parseOsrmResponse } from "../src/server/providers/routing/osrm";

const BENGALURU: LngLat = [77.5946, 12.9716];
const SAKLESHPUR: LngLat = [75.785, 12.943];
const BELUR: LngLat = [75.865, 13.165];
const CHIKKAMAGALURU: LngLat = [75.772, 13.3161];
const BALEHONNUR: LngLat = [75.46, 13.36];
const KALASA: LngLat = [75.356, 13.234];
const SAMSE: LngLat = [75.33432, 13.18798];
// Other trips (the app must work for any trip). Endpoints as our geocoder returns them.
const OOTY: LngLat = [76.7031, 11.4127]; // Udhagamandalam
const PUNE: LngLat = [73.8545, 18.5214];
const PANAJI: LngLat = [73.8282, 15.499]; // "Goa" geocodes to the middle of the state

export const ROUTE_FIXTURES = {
  // Direct search: OSRM returns the Chikkamagaluru-town route and the NH75/Sakleshpur alternative.
  "bengaluru-kalasa": [BENGALURU, KALASA],
  // What a rider gets after adding "Sakleshpur" as a via stop.
  "bengaluru-sakleshpur-kalasa": [BENGALURU, SAKLESHPUR, KALASA],
  // The reference Chikkamagaluru route (CLAUDE.md), forced with via stops.
  "bengaluru-belur-chikkamagaluru-balehonnur-kalasa": [
    BENGALURU,
    BELUR,
    CHIKKAMAGALURU,
    BALEHONNUR,
    KALASA,
  ],
  // OSRM finds only two routes here; the app adds a third through a town (e.g. Belur).
  "bengaluru-samse": [BENGALURU, SAMSE],
  // The extra route the app requests through Belur.
  "bengaluru-belur-samse": [BENGALURU, BELUR, SAMSE],
  "bengaluru-ooty": [BENGALURU, OOTY],
  "pune-goa": [PUNE, PANAJI],
} satisfies Record<string, LngLat[]>;

const baseUrl = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";
const dir = "tests/fixtures/osrm";

/** Keeps only the step fields the app reads (distance, ref, name), so fixtures stay small. */
function slimSteps(body: unknown): unknown {
  const b = body as { routes?: { legs: { steps?: Record<string, unknown>[] }[] }[] };
  for (const route of b.routes ?? []) {
    for (const leg of route.legs) {
      leg.steps = leg.steps?.map(({ distance, ref, name }) => ({ distance, ref, name }));
    }
  }
  return b;
}

async function main() {
  await mkdir(dir, { recursive: true });
  // Optional names limit the run: pnpm fixtures:routes -- pune-goa
  const only = process.argv.slice(2).filter((a) => a !== "--");
  for (const [name, waypoints] of Object.entries(ROUTE_FIXTURES)) {
    if (only.length > 0 && !only.includes(name)) continue;
    const url = buildOsrmRouteUrl(baseUrl, { waypoints, alternatives: true, profile: "car" });
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const body: unknown = await res.json();
    const routes = parseOsrmResponse(body, "car"); // throws if the response is unusable
    await writeFile(`${dir}/${name}.json`, JSON.stringify(slimSteps(body)));
    console.log(name);
    for (const r of routes) {
      console.log(
        `  ${(r.distanceM / 1000).toFixed(1)} km, ${(r.durationS / 60).toFixed(0)} min, ` +
          `${r.geometry.coordinates.length} points, legs: ${r.legs.map((l) => l.summary).join(" | ")}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500)); // stay well under the demo limit
  }
}

void main();
