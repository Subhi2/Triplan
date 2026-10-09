import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

// With no sign-in, anyone can save or rename trips. This caps writes per visitor so a script
// cannot flood the shared list. Counted in the database, so it holds across serverless instances.

/** Trip saves and renames allowed per visitor per hour. */
export const WRITES_PER_HOUR = 30;

/**
 * Per-visitor limits on endpoints that call rate-limited or billed services (OSRM, Nominatim,
 * Google). Generous, because many riders share one mobile carrier address; they stop one script
 * from getting the server blocked or using up the day's Google budget for everyone.
 */
export const REQUEST_LIMITS = {
  route: { scope: "route", limit: 120, windowS: 3600 },
  nominatim: { scope: "nominatim", limit: 60, windowS: 3600 },
  googleDetails: { scope: "google", limit: 30, windowS: 3600 },
  googlePhoto: { scope: "gphoto", limit: 40, windowS: 3600 },
} as const;

/** Rows for visitors not seen for this long are deleted by the daily health check. */
const FORGET_AFTER = "1 day";

/** The visitor's IP from the proxy headers (Vercel sets x-forwarded-for), or "unknown". */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** A salted hash, so the table never holds an IP address. */
export function visitorKey(ip: string): string {
  const salt = process.env.WRITE_LIMIT_SALT ?? "bike-travelling-guide";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Counts one write for the visitor; false once they are over the hourly limit. */
export async function allowWrite(request: Request): Promise<boolean> {
  const key = visitorKey(clientIp(request));
  const [row] = await getDb().execute<{ count: number }>(sql`
    INSERT INTO write_limit (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN write_limit.window_start < now() - interval '1 hour'
                   THEN 1 ELSE write_limit.count + 1 END,
      window_start = CASE WHEN write_limit.window_start < now() - interval '1 hour'
                          THEN now() ELSE write_limit.window_start END
    RETURNING count`);
  return (row?.count ?? 0) <= WRITES_PER_HOUR;
}

/** Deletes counters of visitors not seen for a day. Returns how many were deleted. */
export async function forgetOldVisitors(): Promise<number> {
  const rows = await getDb().execute(sql`
    DELETE FROM write_limit WHERE window_start < now() - ${FORGET_AFTER}::interval RETURNING key`);
  return rows.length;
}

/**
 * Counts one request for the visitor under `scope` (its own counter, apart from trip writes);
 * false once they have made more than `limit` in the current window of `windowS` seconds (at most
 * a day, after which the daily health check forgets the visitor).
 */
export async function allowRequest(
  request: Request,
  { scope, limit, windowS }: { scope: string; limit: number; windowS: number },
): Promise<boolean> {
  const key = `${scope}:${visitorKey(clientIp(request))}`;
  const window = `${Math.min(windowS, 86_400)} seconds`;
  const [row] = await getDb().execute<{ count: number }>(sql`
    INSERT INTO write_limit (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN write_limit.window_start < now() - ${window}::interval
                   THEN 1 ELSE write_limit.count + 1 END,
      window_start = CASE WHEN write_limit.window_start < now() - ${window}::interval
                          THEN now() ELSE write_limit.window_start END
    RETURNING count`);
  return (row?.count ?? 0) <= limit;
}

/**
 * allowRequest for endpoints that work without the database: when the count cannot be kept, the
 * request goes through rather than failing (routing and search still work with the database down).
 */
export async function allowRequestOrOpen(
  request: Request,
  limit: { scope: string; limit: number; windowS: number },
): Promise<boolean> {
  try {
    return await allowRequest(request, limit);
  } catch (err) {
    console.warn(`Request limit ${limit.scope} not checked: ${(err as Error).message}`);
    return true;
  }
}
