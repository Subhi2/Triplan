import { cookies, headers } from "next/headers";
import { userAgentFromString } from "next/server";
import {
  guessViewport,
  parseViewportHint,
  VIEWPORT_COOKIE,
  type ViewportHint,
} from "@/lib/viewport";

/**
 * The screen this request most likely comes from (src/lib/viewport.ts): the browser's own answer
 * from its last visit, else a guess from the device type. Only for pages that already render
 * per request (the planner and Near me read the address), as it reads cookies and headers.
 */
export async function viewportHint(): Promise<ViewportHint> {
  const saved = parseViewportHint((await cookies()).get(VIEWPORT_COOKIE)?.value);
  if (saved) return saved;
  const ua = userAgentFromString((await headers()).get("user-agent") ?? undefined);
  return guessViewport(ua.device.type);
}
