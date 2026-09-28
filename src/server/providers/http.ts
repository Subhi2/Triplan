import type { z } from "zod";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * Returns a function that resolves no sooner than `minIntervalMs` after the previous call's slot,
 * so concurrent callers queue up instead of bursting (Nominatim allows 1 request/second).
 */
export function createThrottle(minIntervalMs: number, now: () => number = Date.now) {
  let nextSlot = 0;
  return async function waitForSlot(): Promise<void> {
    const t = now();
    const slot = Math.max(t, nextSlot);
    nextSlot = slot + minIntervalMs;
    if (slot > t) await new Promise((resolve) => setTimeout(resolve, slot - t));
  };
}

/** GETs JSON and validates it. Non-2xx bodies are still parsed, since some APIs put the error code there. */
export async function fetchJson<T>(
  provider: string,
  url: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new ProviderError(`${provider} request failed: ${String(err)}`, provider);
  }
  const body: unknown = await res.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ProviderError(
      `${provider} returned an unexpected response (HTTP ${res.status})`,
      provider,
      res.status,
    );
  }
  return { status: res.status, data: parsed.data };
}
