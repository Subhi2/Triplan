import type { MeUpdates } from "@/lib/community/views";
import { decidedClubRequests, waitingClubRequests } from "@/server/services/clubService";
import { failed, json, optionalRider } from "@/server/services/communityHttp";
import { decidedRideRequests, waitingRideRequests } from "@/server/services/groupRideService";

/**
 * GET ?since=<ISO> -> MeUpdates: requests waiting on this rider's clubs and rides, and decisions on
 * their own requests since they last looked (the browser keeps `since`). Zeros for no rider.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("since");
  const since = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : new Date(0);
  try {
    const me = await optionalRider();
    if (!me) return json({ waiting: 0, decided: 0 } satisfies MeUpdates);
    const [wc, wr, dc, dr] = await Promise.all([
      waitingClubRequests(me.id),
      waitingRideRequests(me.id),
      decidedClubRequests(me.id, since),
      decidedRideRequests(me.id, since),
    ]);
    return json({ waiting: wc + wr, decided: dc + dr } satisfies MeUpdates);
  } catch (err) {
    return failed("GET /api/me/updates", err);
  }
}
