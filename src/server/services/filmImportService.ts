import { sql } from "drizzle-orm";
import { WIKIDATA_BATCH, type WikimediaProvider } from "../providers/wikimedia/types";
import { getDb } from "../db";

// "Seen in films" (G12, C11): films and series that Wikidata says were shot at our places
// (filming location, P915; CC0). Places are matched by their wikidata_id only.

/** Films kept per place: the page lists a few, oldest first. */
const MAX_PER_PLACE = 12;

export async function importFilms(
  provider: WikimediaProvider,
  { pauseMs = 1_500, log = () => {} }: { pauseMs?: number; log?: (line: string) => void } = {},
): Promise<{ places: number; films: number }> {
  const rows = await getDb().execute<{ id: string; wikidata_id: string }>(sql`
    SELECT id, wikidata_id FROM place
    WHERE status = 'verified' AND wikidata_id ~ '^Q[0-9]+$'
    ORDER BY id`);
  const byQid = new Map(rows.map((r) => [r.wikidata_id, r.id]));
  const qids = [...byQid.keys()];
  let places = 0;
  let films = 0;
  for (let i = 0; i < qids.length; i += WIKIDATA_BATCH) {
    const batch = qids.slice(i, i + WIKIDATA_BATCH);
    const found = await provider.filmsAt(batch);
    for (const [qid, list] of found) {
      const placeId = byQid.get(qid);
      if (!placeId) continue;
      await getDb().transaction(async (tx) => {
        await tx.execute(sql`DELETE FROM place_film WHERE place_id = ${placeId}`);
        for (const f of list.slice(0, MAX_PER_PLACE)) {
          await tx.execute(sql`
            INSERT INTO place_film (place_id, film_qid, title, year)
            VALUES (${placeId}, ${f.qid}, ${f.title}, ${f.year})
            ON CONFLICT DO NOTHING`);
        }
      });
      places++;
      films += Math.min(list.length, MAX_PER_PLACE);
    }
    log(
      `${Math.min(i + WIKIDATA_BATCH, qids.length)}/${qids.length} places checked, ${places} with films`,
    );
    await new Promise((r) => setTimeout(r, pauseMs));
  }
  return { places, films };
}
