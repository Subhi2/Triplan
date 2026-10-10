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
 * With `maxWaitMs`, a call that would wait longer throws a busy ProviderError (HTTP 503) instead,
 * so a burst of web requests fails fast rather than running past the function's time limit.
 */
export function createThrottle(
  minIntervalMs: number,
  now: () => number = Date.now,
  maxWaitMs = Infinity,
) {
  let nextSlot = 0;
  return async function waitForSlot(): Promise<void> {
    const t = now();
    const slot = Math.max(t, nextSlot);
    if (slot - t > maxWaitMs) {
      throw new ProviderError("Too many requests queued for this service", "throttle", 503);
    }
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
  timeoutMs = 15_000,
): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
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

/** GETs a binary body (an image tile). Throws on non-2xx answers and bodies over `maxBytes`. */
export async function fetchBytes(
  provider: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
  maxBytes = 5_000_000,
): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ProviderError(`${provider} request failed: ${String(err)}`, provider);
  }
  if (!res.ok)
    throw new ProviderError(`${provider} returned HTTP ${res.status}`, provider, res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new ProviderError(`${provider} response too large (${bytes.byteLength} bytes)`, provider);
  }
  return bytes;
}
