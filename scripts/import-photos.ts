// Adds photos from Wikimedia Commons to places that have a Wikidata id (docs/07, G1.2).
//   pnpm db:import-photos                 (up to 5,000 places)
//   pnpm db:import-photos -- --limit=200
// Re-running is safe: checked places are skipped for 90 days, and photos are stored once.
import { parseArgs } from "node:util";
import { closeDb } from "../src/server/db";
import { getWikimediaProvider } from "../src/server/providers/wikimedia";
import { importWikimediaPhotos } from "../src/server/services/photoImportService";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"), // pnpm passes the "--" through
  options: { limit: { type: "string", default: "5000" } },
});
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1) {
  console.error("--limit must be a positive whole number");
  process.exit(1);
}

const time = () => new Date().toTimeString().slice(0, 8);

async function main() {
  const { checked, found } = await importWikimediaPhotos(getWikimediaProvider(), {
    limit,
    log: (line) => console.log(`${time()} ${line}`),
  });
  console.log(`${time()} Done: ${found} photos for ${checked} places checked.`);
}

main()
  .catch((err: unknown) => {
    console.error("Photo import failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
