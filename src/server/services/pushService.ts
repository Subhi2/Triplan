import { sql } from "drizzle-orm";
import { after } from "next/server";
import webpush from "web-push";
import type { Notice, PushSubscriptionInput } from "@/lib/pushNotices";
import { siteUrl } from "@/lib/site";
import { getDb } from "../db";

// Push notices (G11, C9): Web Push with our own VAPID keys, sent from our server to the
// browsers' own push services. Off without the keys. Each notice names only the ride or club and
// what happened (src/lib/pushNotices.ts).

/** Push is on: both halves of our VAPID key are set. */
export function pushEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}

/**
 * Sends notices after the response has gone (Next's after()), so a slow push service never
 * holds a rider up. Nothing at all while notices are off.
 */
export function notifyLater(task: () => Promise<unknown>): void {
  if (!pushEnabled()) return;
  after(() => task().catch((err) => console.warn("Push notices failed:", (err as Error).message)));
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    siteUrl(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  configured = true;
}

export async function subscribe(riderId: string, s: PushSubscriptionInput): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO push_subscription (endpoint, rider_id, p256dh, auth)
    VALUES (${s.endpoint}, ${riderId}, ${s.keys.p256dh}, ${s.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET rider_id = excluded.rider_id, p256dh = excluded.p256dh,
      auth = excluded.auth`);
}

export async function unsubscribe(riderId: string, endpoint: string): Promise<void> {
  await getDb().execute(sql`
    DELETE FROM push_subscription WHERE rider_id = ${riderId} AND endpoint = ${endpoint}`);
}

/** Sends the notice to every device of these riders; drops subscriptions the browser gave up. */
export async function notifyRiders(riderIds: string[], notice: Notice): Promise<number> {
  if (!pushEnabled() || riderIds.length === 0) return 0;
  configure();
  const subs = await getDb().execute<{ endpoint: string; p256dh: string; auth: string }>(sql`
    SELECT endpoint, p256dh, auth FROM push_subscription
    WHERE rider_id = ANY(${sql.param(riderIds)}::uuid[])`);
  const payload = JSON.stringify({ ...notice, url: `${siteUrl()}${notice.url}` });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 24 * 60 * 60 },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await getDb().execute(sql`DELETE FROM push_subscription WHERE endpoint = ${s.endpoint}`);
        } else {
          console.warn("Push notice failed:", status ?? (err as Error).message);
        }
      }
    }),
  );
  return sent;
}

/** A ride's title, and who hosts it (host and co-hosts) or rides it (approved riders). */
export async function rideAudience(rideId: string) {
  const rows = await getDb().execute<{ title: string; rider_id: string; role: string }>(sql`
    SELECT r.title, m.rider_id, m.role
    FROM group_ride r JOIN group_ride_member m ON m.ride_id = r.id
    WHERE r.id = ${rideId} AND m.status = 'approved'`);
  return {
    title: rows[0]?.title ?? "Your group ride",
    hosts: rows.filter((r) => r.role !== "rider").map((r) => r.rider_id),
    riders: rows.filter((r) => r.role === "rider").map((r) => r.rider_id),
  };
}

/** A club's name and its owners and admins. */
export async function clubAdmins(slug: string) {
  const rows = await getDb().execute<{ name: string; rider_id: string }>(sql`
    SELECT c.name, m.rider_id FROM club c JOIN club_member m ON m.club_id = c.id
    WHERE c.slug = ${slug} AND m.status = 'active' AND m.role IN ('owner', 'admin')`);
  return { name: rows[0]?.name ?? "Your club", admins: rows.map((r) => r.rider_id) };
}

/** A club's name, by its link. */
export async function clubName(slug: string): Promise<string> {
  const [row] = await getDb().execute<{ name: string }>(
    sql`SELECT name FROM club WHERE slug = ${slug}`,
  );
  return row?.name ?? "Your club";
}
