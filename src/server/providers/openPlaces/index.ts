import { serverEnv } from "../../env";
import { createOvertureProvider, latestOvertureRelease } from "./overture";
import type { OpenPlacesProvider } from "./types";

export * from "./types";

/** Overture Places, the given release or the newest one. For import scripts only. */
export async function getOpenPlacesProvider(release?: string): Promise<OpenPlacesProvider> {
  return createOvertureProvider(
    release ?? (await latestOvertureRelease(serverEnv().NOMINATIM_USER_AGENT)),
  );
}
