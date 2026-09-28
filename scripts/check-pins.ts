// Compares each seed place pin in docs/06-seed-data.md with OpenStreetMap via the Nominatim
// geocoder (cached in geocode_cache, throttled to 1 req/s). Prints every candidate so a human
// can confirm the match before editing the seed doc.
//   pnpm check:pins
import { haversineM, type LngLat } from "../src/lib/geo";
import { closeDb } from "../src/server/db";
import { getGeocodingProvider, type GeocodeHit } from "../src/server/providers/geocoding";
import { readSeedDoc } from "./seed-doc";

const THRESHOLD_M = 300;
const SEARCH_RADIUS_M = 50_000;

// Other spellings / names used in OSM for places the default queries miss.
const EXTRA_QUERIES: Record<string, string[]> = {
  shravanabelagola: [
    "Gommateshwara statue, Shravanabelagola",
    "Bahubali, Shravanabelagola",
    "Vindhyagiri, Shravanabelagola",
  ],
  "ballalarayana-durga": [
    "Ballalarayanadurga",
    "Ballalarayana Durga Fort",
    "Ballalrayana Durga",
    "Ballalarayanadurga Fort, Karnataka",
  ],
  "belur-chennakeshava": [
    "Chennakeshava Temple, Beluru",
    "Chennakesava Temple, Belur",
    "Chennakeshava Swamy Temple, Belur",
  ],
  "hirekolale-lake": ["Hirekolale", "Hirekolale Kere", "Hirekolale Lake, Chikkamagaluru"],
  "horanadu-annapoorneshwari": [
    "Annapoorneshwari Temple, Horanadu",
    "Sri Annapoorneshwari Temple, Horanadu",
    "Horanadu",
  ],
  "hanuman-gundi-falls": [
    "Hanumana Gundi Falls",
    "Hanumanagundi Falls",
    "Suthanabbe Falls",
    "Hanuman Gundi",
  ],
};

// Short keywords searched inside a ~9 km box around the seed pin when names don't match.
const NEARBY_KEYWORDS: Record<string, string[]> = {
  "ballalarayana-durga": ["Ballalarayana", "Durga", "fort", "Sunkasale"],
  "belur-chennakeshava": ["Chennakeshava", "Chennakesava", "Channakeshava", "temple"],
};

function queriesFor(slug: string, name: string, district: string | undefined): string[] {
  // "Shravanabelagola (Gommateshwara)" -> "Shravanabelagola"; "Chennakeshava Temple, Belur" stays.
  const simple = name.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const inner = /\((.*?)\)/.exec(name)?.[1];
  return [
    `${name}, Karnataka`,
    `${simple}, ${district ?? ""}, Karnataka`,
    ...(inner ? [`${inner}, ${district ?? ""}, Karnataka`] : []),
    ...(EXTRA_QUERIES[slug] ?? []),
  ];
}

async function main() {
  const { places } = await readSeedDoc();
  const geocoder = getGeocodingProvider();

  for (const p of places) {
    const seed: LngLat = [p.lng, p.lat];
    const seen = new Map<string, GeocodeHit & { distanceM: number; query: string }>();
    for (const q of queriesFor(p.slug, p.name, p.district)) {
      for (const hit of await geocoder.search(q, { limit: 5 })) {
        const distanceM = haversineM(seed, hit.location);
        if (distanceM <= SEARCH_RADIUS_M && !seen.has(hit.id)) {
          seen.set(hit.id, { ...hit, distanceM, query: q });
        }
      }
    }
    const box: [number, number, number, number] = [
      p.lng - 0.08,
      p.lat - 0.08,
      p.lng + 0.08,
      p.lat + 0.08,
    ];
    for (const q of NEARBY_KEYWORDS[p.slug] ?? []) {
      for (const hit of await geocoder.search(q, { limit: 10, viewbox: box })) {
        if (!seen.has(hit.id)) {
          seen.set(hit.id, { ...hit, distanceM: haversineM(seed, hit.location), query: q });
        }
      }
    }
    const hits = [...seen.values()].sort((a, b) => a.distanceM - b.distanceM);
    const best = hits[0];
    const flag = !best ? "NO MATCH" : best.distanceM > THRESHOLD_M ? "OFF" : "ok";
    console.log(`\n[${flag}] ${p.slug}  seed ${p.lat}, ${p.lng}`);
    for (const h of hits.slice(0, 5)) {
      console.log(
        `   ${(h.distanceM / 1000).toFixed(2).padStart(6)} km  ${h.location[1].toFixed(5)}, ` +
          `${h.location[0].toFixed(5)}  ${h.kind.padEnd(24)} ${h.id.padEnd(18)} ${h.label}`,
      );
    }
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
