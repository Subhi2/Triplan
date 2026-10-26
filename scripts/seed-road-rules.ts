// Loads the road rules in data/road-rules.json into road_rule (docs/02, "Road rules and permits").
//   pnpm db:seed-road-rules               (every rule; rules no longer in the file are deleted)
//   pnpm db:seed-road-rules -- --dry-run  (check and place every rule, write nothing)
// A rule on a road is routed between its points once (cached, like any route). Rules on districts
// and states are built from the district outlines: run pnpm db:import-districts first.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { roadRulesFileSchema } from "../src/lib/roadRules";
import { closeDb } from "../src/server/db";
import { getRoutingProvider } from "../src/server/providers/routing";
import {
  deleteRoadRulesExcept,
  ruleGeometry,
  upsertRoadRule,
} from "../src/server/services/roadRuleService";

const PAUSE_MS = 1_500;

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { "dry-run": { type: "boolean", default: false } },
});

async function main() {
  const rules = roadRulesFileSchema.parse(
    JSON.parse(await readFile("data/road-rules.json", "utf8")),
  );
  const slugs = new Set<string>();
  for (const r of rules) {
    if (slugs.has(r.slug)) throw new Error(`Duplicate slug ${r.slug}`);
    slugs.add(r.slug);
  }
  const routing = getRoutingProvider();
  const failed: string[] = [];
  for (const rule of rules) {
    try {
      let line = null;
      if ("road" in rule.where) {
        const [route] = await routing.route({
          waypoints: rule.where.road,
          alternatives: false,
          profile: "car",
        });
        if (!route) throw new Error("no route between its points");
        line = route.geometry;
        console.log(`  ${rule.slug}: road of ${(route.distanceM / 1000).toFixed(1)} km`);
        await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      }
      const geom = await ruleGeometry(rule.where, line);
      if (!values["dry-run"]) await upsertRoadRule(rule, geom);
      console.log(`✓ ${rule.slug} (${rule.kind})`);
    } catch (err) {
      console.log(`✗ ${rule.slug}: ${err instanceof Error ? err.message : String(err)}`);
      failed.push(rule.slug);
    }
  }
  if (!values["dry-run"] && failed.length === 0) {
    const removed = await deleteRoadRulesExcept([...slugs]);
    if (removed.length > 0) console.log(`Removed: ${removed.join(", ")}`);
  }
  console.log(
    `${rules.length - failed.length} of ${rules.length} rules ${values["dry-run"] ? "checked" : "stored"}.`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
