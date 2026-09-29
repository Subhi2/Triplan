import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { forgetOldForecasts } from "@/server/db/cache";
import { forgetOldVisitors } from "@/server/services/writeLimit";

// Called daily by Vercel Cron (vercel.json). The query keeps the free Supabase project active
// (it pauses after 7 days without activity); old write-limit counters and cached weather
// forecasts are cleared.
export const dynamic = "force-dynamic";

/** GET -> { ok: true, places, forgotten, forecasts } or 503 if the database is unreachable. */
export async function GET() {
  try {
    const [row] = await getDb().execute<{ places: number }>(
      sql`SELECT count(*)::int AS places FROM place WHERE status = 'verified'`,
    );
    const forgotten = await forgetOldVisitors();
    const forecasts = await forgetOldForecasts();
    return Response.json(
      { ok: true, places: row?.places ?? 0, forgotten, forecasts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("GET /api/health failed", err);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
