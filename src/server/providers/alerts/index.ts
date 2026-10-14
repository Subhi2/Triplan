import { geocodeTtlCache } from "../../db/cache";
import { serverEnv } from "../../env";
import { createSachetProvider } from "./sachet";
import type { AlertsProvider } from "./types";

export * from "./types";

const MINUTE = 60 * 1000;

/**
 * NDMA SACHET alerts, identified by NOMINATIM_USER_AGENT. One provider per request: it carries
 * that request's limits on messages and area files fetched.
 */
export function getAlertsProvider(): AlertsProvider {
  const env = serverEnv();
  return createSachetProvider({
    baseUrl: env.SACHET_BASE_URL,
    userAgent: env.NOMINATIM_USER_AGENT,
    feedCache: geocodeTtlCache(10 * MINUTE),
    fileCache: geocodeTtlCache(7 * 24 * 60 * MINUTE),
  });
}
