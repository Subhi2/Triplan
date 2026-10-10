import { isUsageEvent } from "@/lib/usageEvents";
import { countLater } from "@/server/services/usage";
import { allowRequestOrOpen } from "@/server/services/writeLimit";

/**
 * POST { event } -> 204: counts one use of a feature for today (src/lib/usageEvents.ts). Unknown
 * events are ignored; a visitor's counts are capped per hour. Nothing about the visitor is kept.
 * USAGE_EVENTS_OFF (end-to-end tests) turns counting off.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => undefined)) as { event?: unknown } | undefined;
  if (!isUsageEvent(body?.event) || process.env.USAGE_EVENTS_OFF) {
    return new Response(null, { status: 204 });
  }
  if (await allowRequestOrOpen(request, { scope: "event", limit: 200, windowS: 3600 })) {
    countLater(`event:${body.event}`);
  }
  return new Response(null, { status: 204 });
}
