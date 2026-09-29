import { weatherDbCache } from "../../db/cache";
import { serverEnv } from "../../env";
import { createMetnoProvider } from "./metno";
import type { WeatherProvider } from "./types";

export * from "./types";

/** MET Norway forecasts, cached for an hour. Identified by NOMINATIM_USER_AGENT. */
export function getWeatherProvider(): WeatherProvider {
  return createMetnoProvider(serverEnv().NOMINATIM_USER_AGENT, weatherDbCache);
}
