import { z } from "zod";
import type { LngLat } from "@/lib/geo";
import type { ForecastStep } from "@/lib/weather";
import type { JsonCache } from "../../db/cache";
import { fetchJson, ProviderError } from "../http";
import type { WeatherProvider } from "./types";

// MET Norway Locationforecast 2.0 (https://api.met.no): free, commercial use allowed, data under
// CC BY 4.0. Its terms: an identifying User-Agent, at most 4 decimals in coordinates, at most
// 20 requests a second, and cache until the Expires header (about 30 minutes).

const BASE_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete";
/** Forecast points snap to a 0.05° grid (about 5 km), so nearby routes share cached forecasts. */
const GRID = 0.05;

const num = z.number().optional();
const period = z
  .object({
    summary: z.object({ symbol_code: z.string() }).optional(),
    details: z.object({ precipitation_amount: num }).partial().optional(),
  })
  .optional();

export const locationforecastSchema = z.object({
  properties: z.object({
    timeseries: z.array(
      z.object({
        time: z.string(),
        data: z.object({
          instant: z.object({
            details: z.object({ air_temperature: num, wind_speed: num }).partial(),
          }),
          next_1_hours: period,
          next_6_hours: period,
        }),
      }),
    ),
  }),
});

/** Timeseries -> steps with the hour's rain where given, else the next 6 hours'. */
export function parseLocationforecast(
  data: z.infer<typeof locationforecastSchema>,
): ForecastStep[] {
  return data.properties.timeseries.map(({ time, data: d }) => {
    const hour = d.next_1_hours;
    const six = d.next_6_hours;
    const rainPeriod = hour?.details?.precipitation_amount !== undefined ? hour : six;
    return {
      time,
      tempC: d.instant.details.air_temperature ?? null,
      windMs: d.instant.details.wind_speed ?? null,
      rainMm: rainPeriod?.details?.precipitation_amount ?? null,
      rainHours: rainPeriod === undefined ? null : rainPeriod === hour ? 1 : 6,
      symbol: hour?.summary?.symbol_code ?? six?.summary?.symbol_code ?? null,
    };
  });
}

export function snapToGrid([lng, lat]: LngLat): LngLat {
  const snap = (n: number) => Number((Math.round(n / GRID) * GRID).toFixed(2));
  return [snap(lng), snap(lat)];
}

export function createMetnoProvider(userAgent: string, cache: JsonCache): WeatherProvider {
  return {
    async forecast(point) {
      const [lng, lat] = snapToGrid(point);
      const key = `metno:v1:${lat},${lng}`;
      const hit = (await cache.get(key)) as ForecastStep[] | undefined;
      if (hit) return hit;
      const { status, data } = await fetchJson(
        "metno",
        `${BASE_URL}?lat=${lat}&lon=${lng}`,
        locationforecastSchema,
        { headers: { "User-Agent": userAgent, Accept: "application/json" } },
        10_000,
      );
      if (status !== 200) throw new ProviderError(`MET Norway HTTP ${status}`, "metno", status);
      const steps = parseLocationforecast(data);
      await cache.set(key, steps);
      return steps;
    },
  };
}
