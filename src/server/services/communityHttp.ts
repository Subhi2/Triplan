import { z } from "zod";
import { communityEnabled } from "@/lib/community/enabled";
import type { RiderMe } from "@/lib/community/views";
import { CommunityError } from "./clubService";
import { currentRider } from "./riderService";

// What every community route shares (docs/02, "Community (G6)"): answers are never cached, a
// rider's own requests need their device account and nickname, and service errors become the
// status they name.

export const NO_STORE = { "Cache-Control": "no-store" };

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

export const invalid = (error: z.ZodError) =>
  json({ error: "Invalid request", issues: z.flattenError(error) }, 400);

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}

/** The rider behind the request, or the response to send instead (off, or no nickname yet). */
export async function requireRider(): Promise<RiderMe | Response> {
  if (!communityEnabled) return json({ error: "Clubs and group rides are off" }, 404);
  const me = await currentRider();
  return me ?? json({ error: "Pick a nickname first", code: "NO_RIDER" }, 401);
}

/** The rider behind the request, or null; never an error (for pages anyone may read). */
export async function optionalRider(): Promise<RiderMe | null> {
  return communityEnabled ? currentRider() : null;
}

/** A failed community call as its response. */
export function failed(where: string, err: unknown): Response {
  if (err instanceof CommunityError) return json({ error: err.message }, err.status);
  console.error(`${where} failed`, err);
  return json({ error: "Something went wrong. Try again." }, 500);
}
