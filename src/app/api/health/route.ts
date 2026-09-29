import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { forgetOldVisitors } from "@/server/services/writeLimit";

// Called daily by Vercel Cron (vercel.json). The query keeps the free Supabase project active
// (it pauses after 7 days without activity) and old write-limit counters are cleared.
export const dynamic = "force-dynamic";

/** GET -> { ok: true, places, forgotten } or 503 if the database is unreachable. */
export async function GET() {
  try {
    const [row] = await getDb().execute<{ places: number }>(
      sql`SELECT count(*)::int AS places FROM place WHERE status = 'verified'`,
    );
    const forgotten = await forgetOldVisitors();
    return Response.json(
      { ok: true, places: row?.places ?? 0, forgotten },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("GET /api/health failed", err);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
