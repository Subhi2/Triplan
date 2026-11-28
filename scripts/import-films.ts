// "Seen in films" (G12): films and series Wikidata says were shot at our places (P915, CC0).
//   pnpm db:import-films
// Re-running is safe: each place's films are replaced by what Wikidata says now.
import { closeDb } from "../src/server/db";
import { getWikimediaProvider } from "../src/server/providers/wikimedia";
import { importFilms } from "../src/server/services/filmImportService";

const time = () => new Date().toTimeString().slice(0, 8);

importFilms(getWikimediaProvider(), { log: (line) => console.log(`${time()} ${line}`) })
  .then((r) => console.log(`${time()} Done: ${r.films} films at ${r.places} places.`))
  .catch((err: unknown) => {
    console.error("Film import failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
