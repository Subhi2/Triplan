import { serverEnv } from "../../env";
import { createWikimediaProvider } from "./commons";
import type { WikimediaProvider } from "./types";

export * from "./types";

/** Wikidata and Wikimedia Commons, for place photos. Identified by NOMINATIM_USER_AGENT. */
export function getWikimediaProvider(): WikimediaProvider {
  return createWikimediaProvider(serverEnv().NOMINATIM_USER_AGENT);
}
