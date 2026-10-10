// Adds photos from Wikimedia Commons to places that have a Wikidata id (docs/07, G1.2).
//   pnpm db:import-photos                 (up to 5,000 places)
//   pnpm db:import-photos -- --limit=200
//   pnpm db:import-photos -- --recheck    (remove photos whose Wikidata link is a person or far away)
// Re-running is safe: checked places are skipped for 90 days, and photos are stored once.
import { parseArgs } from "node:util";
import { closeDb } from "../src/server/db";
import { getWikimediaProvider } from "../src/server/providers/wikimedia";
import {
  importWikimediaPhotos,
  recheckWikimediaPhotos,
} from "../src/server/services/photoImportService";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"), // pnpm passes the "--" through
  options: {
    limit: { type: "string", default: "5000" },
    recheck: { type: "boolean", default: false },
  },
});
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1) {
  console.error("--limit must be a positive whole number");
  process.exit(1);
}

const time = () => new Date().toTimeString().slice(0, 8);

async function main() {
  const log = (line: string) => console.log(`${time()} ${line}`);
  if (values.recheck) {
    const { checked, removed } = await recheckWikimediaPhotos(getWikimediaProvider(), { log });
    console.log(`${time()} Done: ${removed} photos removed from ${checked} places rechecked.`);
    return;
  }
  const { checked, found, rejected } = await importWikimediaPhotos(getWikimediaProvider(), {
    limit,
    log,
  });
  console.log(
    `${time()} Done: ${found} photos for ${checked} places checked; ${rejected} Wikidata links ` +
      "rejected (a person, or far from the place).",
  );
}

main()
  .catch((err: unknown) => {
    console.error("Photo import failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
