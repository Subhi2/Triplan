import { timingSafeEqual } from "node:crypto";

/**
 * True when the request comes from Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`
 * once CRON_SECRET is set in the project. False when the secret is not set.
 */
export function isCronRequest(request: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
