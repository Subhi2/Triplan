import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { forgetOldCache, forgetOldForecasts } from "@/server/db/cache";
import { isCronRequest } from "@/server/services/cron";
import { forgetOldVisitors } from "@/server/services/writeLimit";

// Called daily by Vercel Cron (vercel.json). The query keeps the free Supabase project active
// (it pauses after 7 days without activity). Only the cron, which sends
// `Authorization: Bearer $CRON_SECRET`, may clean up: old write-limit counters, cached weather
// forecasts and cache rows past their time. Anyone else gets the health check alone.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET -> { ok: true, places, cleaned? } or 503 if the database is unreachable. */
export async function GET(request: Request) {
  try {
    const [row] = await getDb().execute<{ places: number }>(
      sql`SELECT count(*)::int AS places FROM place WHERE status = 'verified'`,
    );
    const places = row?.places ?? 0;
    if (!isCronRequest(request)) {
      if (!process.env.CRON_SECRET) console.warn("CRON_SECRET is not set: daily clean-up skipped");
      return Response.json({ ok: true, places }, { headers: NO_STORE });
    }
    const cleaned = {
      visitors: await forgetOldVisitors(),
      forecasts: await forgetOldForecasts(),
      ...(await forgetOldCache()),
    };
    return Response.json({ ok: true, places, cleaned }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/health failed", err);
    return Response.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
