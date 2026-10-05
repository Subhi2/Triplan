// Finds coordinates for the stops of a famous ride (data/rides.json), so they are never typed from
// memory: our own places first (towns, peaks, viewpoints…), then Nominatim (1 request a second).
//   pnpm rides:lookup -- "Agumbe" "Reckong Peo" --state="Himachal Pradesh"
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { closeDb, getDb } from "../src/server/db";
import { serverEnv } from "../src/server/env";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { state: { type: "string" } },
  allowPositionals: true,
});

const nominatimSchema = z.array(
  z.object({
    display_name: z.string(),
    lat: z.string(),
    lon: z.string(),
    type: z.string().optional(),
    addresstype: z.string().optional(),
  }),
);

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

async function ours(name: string, state: string | undefined) {
  return getDb().execute<{
    name: string;
    category: string;
    state: string | null;
    lng: number;
    lat: number;
  }>(sql`
    SELECT p.name, c.slug AS category, p.state,
           ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat
    FROM place p JOIN category c ON c.id = p.category_id
    WHERE p.status = 'verified' AND p.name ILIKE ${name + "%"}
      AND (${state ?? null}::text IS NULL OR p.state = ${state ?? null})
    ORDER BY (c.slug = 'town') DESC, p.population DESC NULLS LAST, length(p.name)
    LIMIT 5`);
}

async function nominatim(name: string, state: string | undefined) {
  const env = serverEnv();
  const params = new URLSearchParams({
    q: state ? `${name}, ${state}` : name,
    format: "jsonv2",
    countrycodes: "in",
    limit: "3",
  });
  const res = await fetch(`${env.NOMINATIM_BASE_URL}/search?${params}`, {
    headers: { "User-Agent": env.NOMINATIM_USER_AGENT },
  });
  return nominatimSchema.parse(await res.json());
}

async function main() {
  for (const [i, name] of positionals.entries()) {
    console.log(`\n${name}${values.state ? ` (${values.state})` : ""}`);
    const rows = await ours(name, values.state);
    for (const r of rows) {
      console.log(
        `  ours       ${r.category.padEnd(10)} [${round5(r.lng)}, ${round5(r.lat)}]  ${r.name}, ${r.state ?? ""}`,
      );
    }
    if (rows.length === 0) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1100)); // Nominatim: 1 req/s
      for (const r of await nominatim(name, values.state)) {
        const kind = (r.addresstype ?? r.type ?? "").padEnd(10);
        console.log(
          `  nominatim  ${kind} [${round5(Number(r.lon))}, ${round5(Number(r.lat))}]  ${r.display_name}`,
        );
      }
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
