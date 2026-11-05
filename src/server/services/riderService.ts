import { sql } from "drizzle-orm";
import type { RiderMe } from "@/lib/community/views";
import { currentAccount, deleteAuthAccount, type Account } from "../auth/session";
import { getDb } from "../db";

// Riders' device accounts (docs/02, "Community (G6)"): a nickname kept against the account's id,
// and nothing else about them. Deleting the account hands the rider's clubs and rides on.

/** How long an account with no clubs or rides is kept without being used. */
export const IDLE_RIDER_DAYS = 90;

interface RiderRow extends Record<string, unknown> {
  id: string;
  nickname: string;
}

/** The rider behind this request (account and nickname), or null before they picked one. */
export async function currentRider(): Promise<RiderMe | null> {
  const account = await currentAccount();
  return account ? riderFor(account) : null;
}

export async function riderFor(account: Account): Promise<RiderMe | null> {
  const [row] = await getDb().execute<RiderRow>(sql`
    UPDATE rider SET last_seen_at = now()
    WHERE id = ${account.id}
    RETURNING id, nickname`);
  return row ? { id: row.id, nickname: row.nickname, isAnonymous: account.isAnonymous } : null;
}

/** Sets the account's nickname, making the rider the first time. */
export async function saveRider(account: Account, nickname: string): Promise<RiderMe> {
  await getDb().execute(sql`
    INSERT INTO rider (id, nickname) VALUES (${account.id}, ${nickname})
    ON CONFLICT (id) DO UPDATE SET nickname = excluded.nickname, last_seen_at = now()`);
  return { id: account.id, nickname, isAnonymous: account.isAnonymous };
}

/**
 * Deletes a rider and everything that is only theirs. Clubs they own pass to their longest-standing
 * admin, else member; a club with nobody else goes. Rides they host that have not happened pass to
 * a co-host, else are called off. Then the account itself is deleted.
 */
export async function deleteRider(id: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`
      WITH owned AS (
        SELECT club_id FROM club_member WHERE rider_id = ${id} AND role = 'owner'
      ), heir AS (
        SELECT DISTINCT ON (m.club_id) m.club_id, m.rider_id
        FROM club_member m JOIN owned o USING (club_id)
        WHERE m.rider_id <> ${id} AND m.status = 'active'
        ORDER BY m.club_id, (m.role = 'admin') DESC, m.created_at
      )
      UPDATE club_member m SET role = 'owner'
      FROM heir h WHERE m.club_id = h.club_id AND m.rider_id = h.rider_id`);
    await tx.execute(sql`
      DELETE FROM club c
      WHERE EXISTS (SELECT 1 FROM club_member WHERE club_id = c.id AND rider_id = ${id} AND role = 'owner')
        AND NOT EXISTS (SELECT 1 FROM club_member WHERE club_id = c.id AND role = 'owner' AND rider_id <> ${id})`);
    await tx.execute(sql`
      WITH hosted AS (
        SELECT ride_id FROM group_ride_member WHERE rider_id = ${id} AND role = 'host'
      ), heir AS (
        SELECT DISTINCT ON (m.ride_id) m.ride_id, m.rider_id
        FROM group_ride_member m JOIN hosted h USING (ride_id)
        WHERE m.role = 'cohost' AND m.status = 'approved'
        ORDER BY m.ride_id, m.created_at
      )
      UPDATE group_ride_member m SET role = 'host'
      FROM heir h WHERE m.ride_id = h.ride_id AND m.rider_id = h.rider_id`);
    await tx.execute(sql`
      UPDATE group_ride g SET cancelled = true, updated_at = now()
      WHERE EXISTS (SELECT 1 FROM group_ride_member WHERE ride_id = g.id AND rider_id = ${id} AND role = 'host')
        AND NOT EXISTS (SELECT 1 FROM group_ride_member WHERE ride_id = g.id AND role = 'host' AND rider_id <> ${id})`);
    await tx.execute(sql`DELETE FROM rider WHERE id = ${id}`);
  });
  await deleteAuthAccount(id);
}

/**
 * The daily clean-up: device accounts that never kept an email, unused for IDLE_RIDER_DAYS and with
 * no club or ride, and device accounts that never picked a nickname after a week. At most 200 a day.
 */
export async function forgetIdleRiders(): Promise<number> {
  const rows = await getDb().execute<{ id: string }>(sql`
    (SELECT u.id FROM auth.users u
     JOIN rider r ON r.id = u.id
     WHERE u.is_anonymous
       AND r.last_seen_at < now() - make_interval(days => ${IDLE_RIDER_DAYS})
       AND NOT EXISTS (SELECT 1 FROM club_member WHERE rider_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM group_ride_member WHERE rider_id = r.id))
    UNION ALL
    (SELECT u.id FROM auth.users u
     WHERE u.is_anonymous AND u.created_at < now() - interval '7 days'
       AND NOT EXISTS (SELECT 1 FROM rider WHERE id = u.id))
    LIMIT 200`);
  let deleted = 0;
  for (const { id } of rows) {
    await getDb().execute(sql`DELETE FROM rider WHERE id = ${id}`);
    if (await deleteAuthAccount(id)) deleted++;
  }
  return deleted;
}
