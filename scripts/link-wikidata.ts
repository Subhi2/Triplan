// Links places with no Wikidata id to Wikidata items (docs/04, Growth G4 step C3): per half-degree
// tile, one Wikidata query for the items with coordinates and an English name, then a match by
// similar name and distance. Run the photo and description imports afterwards.
//   pnpm db:link-wikidata                       (every tile with unlinked places)
//   pnpm db:link-wikidata -- --limit=20         (the 20 tiles with the most)
//   pnpm db:link-wikidata -- --dry-run          (print matches, write nothing)
// Finished tiles are kept in .import-progress/wikidata-links.json; a re-run skips them (--fresh
// starts over). One request at a time with a pause, identified by NOMINATIM_USER_AGENT.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { closeDb } from "../src/server/db";
import { getWikimediaProvider } from "../src/server/providers/wikimedia";
import { PROGRESS_DIR } from "../src/server/services/importProgress";
import { linkTile, tilesToLink } from "../src/server/services/wikidataLinkService";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    limit: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    fresh: { type: "boolean", default: false },
  },
});
const limit = values.limit ? Number(values.limit) : Infinity;
if (!(limit >= 1)) {
  console.error("--limit must be a positive whole number");
  process.exit(1);
}
const dryRun = values["dry-run"];
const FILE = join(PROGRESS_DIR, "wikidata-links.json");
const time = () => new Date().toTimeString().slice(0, 8);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readDone(): Set<string> {
  if (values.fresh) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(FILE, "utf8")) as string[]);
  } catch {
    return new Set();
  }
}

async function main() {
  const done = readDone();
  const tiles = (await tilesToLink()).filter((t) => !done.has(t.key)).slice(0, limit);
  console.log(`${time()} ${tiles.length} tiles to look at (${done.size} done before).`);
  let linked = 0;
  for (const [i, t] of tiles.entries()) {
    try {
      const r = await linkTile(getWikimediaProvider(), t.key, {
        dryRun,
        log: (line) => console.log(line),
      });
      linked += r.linked;
      console.log(
        `${time()} [${i + 1}/${tiles.length}] ${t.key}: ${r.places} places, ${r.items} items, ` +
          `${r.linked} ${dryRun ? "would be linked" : "linked"} (total ${linked})`,
      );
      if (!dryRun) {
        done.add(t.key);
        mkdirSync(PROGRESS_DIR, { recursive: true });
        writeFileSync(FILE, JSON.stringify([...done]));
      }
    } catch (err) {
      console.log(`${time()} ${t.key} failed: ${(err as Error).message}; re-run to retry`);
    }
    await sleep(1500);
  }
  console.log(`${time()} Done: ${linked} places ${dryRun ? "would be" : ""} linked.`);
}

main()
  .catch((err: unknown) => {
    console.error("Wikidata linking failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
