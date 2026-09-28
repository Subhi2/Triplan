import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };

function createDb(url: string) {
  // prepare: false keeps this working through Supabase's transaction pooler.
  const client = postgres(url, { prepare: false });
  return { db: drizzle(client, { schema }), client };
}

let instance: ReturnType<typeof createDb> | undefined;

/** Lazily connects so importing this module never needs DATABASE_URL (e.g. during build). */
export function getDb() {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    instance = createDb(url);
  }
  return instance.db;
}

export async function closeDb() {
  await instance?.client.end();
  instance = undefined;
}
