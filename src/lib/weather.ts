import { z } from "zod";
import { haversineM, type LngLat } from "./geo";
import { lineStringSchema, ROUTE_ID_PATTERN } from "./places";

// Weather on the ride (docs/07, G1.5): the forecast at points along the route, each at the time the
// rider gets there. Forecasts from MET Norway (CC BY 4.0).

/** One forecast step: hourly for about 2.5 days, then every 6 hours, up to about 9 days ahead. */
export interface ForecastStep {
  time: string; // ISO, start of the step
  tempC: number | null;
  windMs: number | null;
  rainMm: number | null; // over the next rainHours
  rainHours: 1 | 6 | null;
  symbol: string | null; // MET symbol code: "lightrain", "heavyrainandthunder", "clearsky_day"...
}

export type RainLevel = "dry" | "light" | "rain" | "heavy";

export interface WeatherPoint {
  km: number;
  label: string; // "Hassan", or "km 142" away from towns
  location: LngLat;
  eta: string; // ISO
  /** Null when the time is beyond the forecast (about 9 days ahead) or before it starts. */
  forecast: {
    tempC: number | null;
    windMs: number | null;
    rainMm: number | null;
    rainHours: 1 | 6 | null;
    symbol: string | null;
    rain: RainLevel;
    thunder: boolean;
  } | null;
}

export const weatherRequestSchema = z
  .object({
    routeId: z.string().regex(ROUTE_ID_PATTERN).optional(),
    geometry: lineStringSchema.optional(),
    departAt: z.iso.datetime({ offset: true }),
    rideMin: z
      .number()
      .positive()
      .max(7 * 24 * 60),
  })
  .refine((b) => b.routeId !== undefined || b.geometry !== undefined, {
    message: "Send a routeId or a geometry",
  });

export type WeatherRequest = z.infer<typeof weatherRequestSchema>;

/** Forecast points: one every SAMPLE_EVERY_KM, at most MAX_SAMPLES, always start and end. */
export const SAMPLE_EVERY_KM = 40;
export const MAX_SAMPLES = 8;

/** The point `km` along a line (measured with haversine), or its end. */
export function pointAtKm(line: LngLat[], km: number): LngLat {
  let left = km * 1000;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const d = haversineM(a, b);
    if (d >= left && d > 0) {
      const t = left / d;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= d;
  }
  return line[line.length - 1]!;
}

/** Evenly spaced km marks from 0 to totalKm, SAMPLE_EVERY_KM apart but never more than MAX_SAMPLES. */
export function sampleKms(totalKm: number): number[] {
  const n = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(totalKm / SAMPLE_EVERY_KM) + 1));
  return Array.from({ length: n }, (_, i) => (totalKm * i) / (n - 1));
}

/**
 * The step covering `at`: the last one starting at or before it. After the last step only its own
 * period counts (1 or 6 hours), so a time past the end of the forecast has none.
 */
export function stepAt(steps: ForecastStep[], at: Date): ForecastStep | null {
  let i = -1;
  while (i + 1 < steps.length && Date.parse(steps[i + 1]!.time) <= at.getTime()) i++;
  const found = steps[i];
  if (!found) return null;
  const isLast = i === steps.length - 1;
  if (isLast && at.getTime() - Date.parse(found.time) >= (found.rainHours ?? 1) * 3_600_000) {
    return null;
  }
  return found;
}

/** Rain per hour: under 0.2 mm dry, under 1 mm light, under 4 mm rain, else heavy. */
export function rainLevel(rainMm: number | null, rainHours: 1 | 6 | null): RainLevel {
  if (rainMm === null || rainHours === null) return "dry";
  const perHour = rainMm / rainHours;
  if (perHour < 0.2) return "dry";
  if (perHour < 1) return "light";
  return perHour < 4 ? "rain" : "heavy";
}

export function toWeatherForecast(step: ForecastStep): NonNullable<WeatherPoint["forecast"]> {
  return {
    tempC: step.tempC,
    windMs: step.windMs,
    rainMm: step.rainMm,
    rainHours: step.rainHours,
    symbol: step.symbol,
    rain: rainLevel(step.rainMm, step.rainHours),
    thunder: step.symbol?.includes("thunder") ?? false,
  };
}

/** Wind from this speed makes a bike hard to hold on open roads and ghats (about 36 km/h). */
export const STRONG_WIND_MS = 10;

const RAIN_RANK: Record<RainLevel, number> = { dry: 0, light: 1, rain: 2, heavy: 3 };

export interface WeatherSummary {
  /** "none": no point has a forecast yet (too far ahead). */
  level: "none" | "dry" | "light" | "rain" | "heavy" | "thunder";
  /** Where it is worst: thunder first, then the heaviest rain (the earliest when equal). */
  worst: WeatherPoint | null;
  minTempC: number | null;
  maxTempC: number | null;
  /** The first point with strong wind, if any. */
  windy: WeatherPoint | null;
  /** Points past the end of the forecast. */
  missing: number;
}

export function summarizeWeather(points: WeatherPoint[]): WeatherSummary {
  const known = points.filter((p) => p.forecast !== null);
  const temps = known.flatMap((p) => (p.forecast!.tempC === null ? [] : [p.forecast!.tempC]));
  const thunder = known.find((p) => p.forecast!.thunder) ?? null;
  let wettest: WeatherPoint | null = null;
  for (const p of known) {
    if (!wettest || RAIN_RANK[p.forecast!.rain] > RAIN_RANK[wettest.forecast!.rain]) wettest = p;
  }
  const level: WeatherSummary["level"] =
    known.length === 0 ? "none" : thunder ? "thunder" : (wettest?.forecast?.rain ?? "dry");
  return {
    level,
    worst: thunder ?? (level === "dry" ? null : wettest),
    minTempC: temps.length ? Math.min(...temps) : null,
    maxTempC: temps.length ? Math.max(...temps) : null,
    windy: known.find((p) => (p.forecast!.windMs ?? 0) >= STRONG_WIND_MS) ?? null,
    missing: points.length - known.length,
  };
}
