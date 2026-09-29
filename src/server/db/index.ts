import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };

// Supabase's session pooler allows 15 connections for the whole project, shared by the app, the
// import job and scripts. Keep each process small and release idle connections.
const MAX_CONNECTIONS = 5;
const IDLE_TIMEOUT_S = 20;

function createDb(url: string) {
  // prepare: false keeps this working through Supabase's transaction pooler.
  const client = postgres(url, {
    prepare: false,
    max: MAX_CONNECTIONS,
    idle_timeout: IDLE_TIMEOUT_S,
  });
  return { db: drizzle(client, { schema }), client };
}

// Held on globalThis so `next dev` hot reloads reuse the client instead of opening a new pool of
// connections on every reload (and leaking the old one).
const globalForDb = globalThis as { __tripDb?: ReturnType<typeof createDb> };

/** Lazily connects so importing this module never needs DATABASE_URL (e.g. during build). */
export function getDb() {
  if (!globalForDb.__tripDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    globalForDb.__tripDb = createDb(url);
  }
  return globalForDb.__tripDb.db;
}

export async function closeDb() {
  await globalForDb.__tripDb?.client.end();
  globalForDb.__tripDb = undefined;
}
