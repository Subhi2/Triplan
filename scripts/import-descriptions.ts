// Adds descriptions to places from open text (docs/04, Growth G4 step C2): the opening sentences
// of the English Wikipedia article (CC BY-SA 4.0, credited), else Wikidata's short description
// (CC0). Only places with no description and a Wikidata id or an English wikipedia tag.
//   pnpm db:import-descriptions                 (up to 5,000 places)
//   pnpm db:import-descriptions -- --limit=200
// Re-running is safe: checked places are skipped for 90 days, and no description is overwritten.
import { parseArgs } from "node:util";
import { closeDb } from "../src/server/db";
import { getWikimediaProvider, getWikipediaProvider } from "../src/server/providers/wikimedia";
import { importDescriptions } from "../src/server/services/descriptionImportService";

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
  const r = await importDescriptions(getWikimediaProvider(), getWikipediaProvider(), {
    limit,
    log: (line) => console.log(`${time()} ${line}`),
  });
  console.log(
    `${time()} Done: ${r.fromWikipedia} from Wikipedia and ${r.fromWikidata} from Wikidata, ` +
      `${r.checked} places checked.`,
  );
}

main()
  .catch((err: unknown) => {
    console.error("Description import failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
