// Routes each famous ride in data/rides.json once and stores it in the ride table, with its road
// mix, hairpins and elevation profile, so ride pages never call the routing server.
//   pnpm db:seed-rides                     (every ride)
//   pnpm db:seed-rides -- --only=pollachi-to-valparai
//   pnpm db:seed-rides -- --dry-run        (route and check, write nothing)
// Rides whose route misses a checkpoint or is far from the expected distance are reported and not
// stored. One routing request per ride (cached), spaced out for the public OSRM server.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ridesFileSchema } from "../src/lib/rides";
import { closeDb } from "../src/server/db";
import { getRoutingProvider } from "../src/server/providers/routing";
import { routeProfile } from "../src/server/services/elevationService";
import { buildRide, upsertRide } from "../src/server/services/rideService";

const PAUSE_MS = 2_000;

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { only: { type: "string" }, "dry-run": { type: "boolean", default: false } },
});

async function main() {
  const rides = ridesFileSchema.parse(JSON.parse(await readFile("data/rides.json", "utf8")));
  const slugs = new Set<string>();
  for (const r of rides) {
    if (slugs.has(r.slug)) throw new Error(`Duplicate slug ${r.slug}`);
    slugs.add(r.slug);
  }
  const only = values.only?.split(",");
  const deps = {
    routing: getRoutingProvider(),
    profile: (g: Parameters<typeof routeProfile>[0]) => routeProfile(g, null),
  };

  let stored = 0;
  const failed: string[] = [];
  for (const [position, source] of rides.entries()) {
    if (only && !only.includes(source.slug)) continue;
    try {
      const built = await buildRide(source, deps);
      const c = built.curvature;
      const line =
        `${(built.route.distanceM / 1000).toFixed(1)} km, ${Math.round(built.route.durationS / 60)} min, ` +
        `${c.hairpins} hairpins, ${c.twistyKm} km twisty, ` +
        `climb ${built.profile?.ascentM ?? "?"} m, highest ${built.profile?.highest.m ?? "?"} m`;
      if (built.problems.length > 0) {
        console.log(`✗ ${source.slug}: ${built.problems.join("; ")} (${line})`);
        failed.push(source.slug);
      } else {
        if (!values["dry-run"]) await upsertRide(built, position);
        stored++;
        console.log(`✓ ${source.slug}: ${line}`);
      }
    } catch (err) {
      console.log(`✗ ${source.slug}: ${err instanceof Error ? err.message : String(err)}`);
      failed.push(source.slug);
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  console.log(
    `${values["dry-run"] ? "Checked" : "Stored"} ${stored} rides` +
      (failed.length ? `; not stored: ${failed.join(", ")}` : ""),
  );
}

main()
  .catch((err: unknown) => {
    console.error("Ride seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
