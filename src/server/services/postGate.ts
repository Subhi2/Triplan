import type { PowPayload } from "./proofOfWork";
import { powKey, spendProofOfWork } from "./proofOfWork";
import { allowWrite } from "./writeLimit";

// The checks every rider's post passes before it is read (docs/02, "Reviews, photos and road
// reports"): posting is open, the visitor is under the hourly write limit, and the proof of work
// is valid and not spent before.

const json = (error: string, status: number, headers?: HeadersInit) =>
  Response.json({ error }, { status, headers });

/** An error response, or null when the post may go ahead (and its proof of work is now spent). */
export async function gatePost(request: Request, pow: PowPayload): Promise<Response | null> {
  if (!powKey()) return json("Posting is not open yet", 503);
  if (!(await allowWrite(request))) {
    return json("Too many posts from here. Try again in an hour.", 429, { "Retry-After": "3600" });
  }
  const check = await spendProofOfWork(pow);
  if (check === "expired") return json("The check took too long. Send again.", 403);
  if (check !== "ok")
    return json("The anti-spam check failed. Reload the page and try again.", 403);
  return null;
}
