// Records raw Photon responses into tests/fixtures/photon/ so tests never call Photon.
//   pnpm fixtures:photon                 (the default test queries)
//   pnpm fixtures:photon -- samse ooty   (just these)
import { mkdir, writeFile } from "node:fs/promises";
import {
  buildPhotonSearchUrl,
  parsePhotonResponse,
  photonResponseSchema,
} from "../src/server/providers/geocoding/photon";

/** The map centre and zoom the planner starts with (the initial view). */
export const DEFAULT_BIAS = { near: [76.75, 15.05] as [number, number], zoom: 5 };
const QUERIES = ["samse", "kalasa", "ooty", "sakleshpura"];

const baseUrl = process.env.PHOTON_BASE_URL ?? "https://photon.komoot.io/api";
const dir = "tests/fixtures/photon";

async function main() {
  const picked = process.argv.slice(2).filter((a) => a !== "--");
  await mkdir(dir, { recursive: true });
  for (const q of picked.length > 0 ? picked : QUERIES) {
    const res = await fetch(buildPhotonSearchUrl(baseUrl, q, { limit: 8, ...DEFAULT_BIAS }), {
      headers: { "User-Agent": process.env.NOMINATIM_USER_AGENT ?? "bike-travelling-guide" },
    });
    const body: unknown = await res.json();
    const hits = parsePhotonResponse(photonResponseSchema.parse(body));
    await writeFile(`${dir}/${q}.json`, JSON.stringify(body, null, 2));
    console.log(`${q}: ${hits.map((h) => h.name).join(" | ")}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000)); // be gentle with the public server
  }
}

void main();
