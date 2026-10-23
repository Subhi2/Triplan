import { newChallenge, powKey } from "@/server/services/proofOfWork";
import { allowRequestOrOpen, REQUEST_LIMITS } from "@/server/services/writeLimit";

export const dynamic = "force-dynamic";

/**
 * GET -> a signed proof-of-work challenge for one post (review, photo or road report), which the
 * browser solves in the background (docs/02, "Reviews, photos and road reports"). 503 when
 * ALTCHA_HMAC_KEY is not set: posting is closed.
 */
export async function GET(request: Request) {
  const key = powKey();
  if (!key) return Response.json({ error: "Posting is not open yet" }, { status: 503 });
  if (!(await allowRequestOrOpen(request, REQUEST_LIMITS.pow))) {
    return Response.json(
      { error: "Too many posts from here. Try again in an hour." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  return Response.json(await newChallenge(key), { headers: { "Cache-Control": "no-store" } });
}
