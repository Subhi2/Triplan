import type { LineString } from "geojson";
import { haversineM, type LngLat } from "@/lib/geo";
import { breakMinutes } from "@/lib/rideCheck";
import {
  pointAtKm,
  sampleKms,
  stepAt,
  toWeatherForecast,
  type ForecastStep,
  type WeatherPoint,
} from "@/lib/weather";
import type { WeatherProvider } from "../providers/weather";
import { townsAlong } from "./corridorService";

/** Forecast requests at a time; MET Norway allows 20 a second. */
const CONCURRENCY = 4;
/** A sample point takes a town's name when the town is this close to it along the route. */
const TOWN_NAME_KM = 10;

function lineKm(line: LngLat[]): number {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += haversineM(line[i - 1]!, line[i]!);
  return m / 1000;
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * The forecast at up to MAX_SAMPLES points along the route, each at the time the rider reaches it:
 * departure plus that share of the riding time and breaks. A point whose forecast cannot be
 * fetched has no forecast; if none can be fetched, this throws.
 */
export async function weatherAlong(
  geometry: LineString,
  departAt: Date,
  rideMin: number,
  provider: WeatherProvider,
): Promise<WeatherPoint[]> {
  const line = geometry.coordinates as LngLat[];
  const totalKm = lineKm(line);
  const totalMin = rideMin + breakMinutes(rideMin);
  const towns = await townsAlong(geometry, 3000).catch(() => []);

  const samples = sampleKms(totalKm).map((km) => {
    const town = towns
      .filter((t) => Math.abs(t.kmFromStart - km) <= TOWN_NAME_KM)
      .sort((a, b) => Math.abs(a.kmFromStart - km) - Math.abs(b.kmFromStart - km))[0];
    return {
      km,
      label: town?.name ?? `km ${Math.round(km)}`,
      location: pointAtKm(line, km),
      eta: new Date(departAt.getTime() + (totalKm > 0 ? (km / totalKm) * totalMin : 0) * 60_000),
    };
  });

  let failures = 0;
  const steps = await mapLimited(samples, CONCURRENCY, (s) =>
    provider.forecast(s.location).catch((err: unknown): ForecastStep[] | null => {
      failures++;
      console.error("Weather forecast failed", err);
      return null;
    }),
  );
  if (failures === samples.length) throw new Error("No weather forecast could be fetched");

  return samples.map((s, i) => {
    const step = steps[i] ? stepAt(steps[i], s.eta) : null;
    return {
      km: Math.round(s.km * 10) / 10,
      label: s.label,
      location: s.location,
      eta: s.eta.toISOString(),
      forecast: step ? toWeatherForecast(step) : null,
    };
  });
}
