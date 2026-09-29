import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

// With no sign-in, anyone can save or rename trips. This caps writes per visitor so a script
// cannot flood the shared list. Counted in the database, so it holds across serverless instances.

/** Trip saves and renames allowed per visitor per hour. */
export const WRITES_PER_HOUR = 30;

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
