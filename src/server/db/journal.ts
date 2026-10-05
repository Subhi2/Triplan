import { readFile } from "node:fs/promises";

export const MIGRATIONS_FOLDER = "src/server/db/migrations";

/** This clone's migration tags ("0015_service_point"), oldest first, from Drizzle's journal. */
export async function migrationTags(): Promise<string[]> {
  const journal = JSON.parse(await readFile(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8")) as {
    entries: { tag: string }[];
  };
  return journal.entries.map((e) => e.tag);
}
