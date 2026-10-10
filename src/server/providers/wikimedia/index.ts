import { serverEnv } from "../../env";
import { createWikimediaProvider } from "./commons";
import type { WikimediaProvider } from "./types";
import { createWikipediaProvider, type WikipediaProvider } from "./wikipedia";

export * from "./types";
export { EXTRACT_BATCH, type WikipediaIntro, type WikipediaProvider } from "./wikipedia";

/** Wikidata and Wikimedia Commons, for place photos. Identified by NOMINATIM_USER_AGENT. */
export function getWikimediaProvider(): WikimediaProvider {
  return createWikimediaProvider(serverEnv().NOMINATIM_USER_AGENT);
}

/** English Wikipedia intros, for place descriptions. Identified by NOMINATIM_USER_AGENT. */
export function getWikipediaProvider(): WikipediaProvider {
  return createWikipediaProvider(serverEnv().NOMINATIM_USER_AGENT);
}
