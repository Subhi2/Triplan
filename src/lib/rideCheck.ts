import SunCalc from "suncalc";
import type { LngLat } from "./geo";
import type { Vehicle } from "./trip";

// Ride check (docs/07, G1.3): will the rider run out of fuel, and will they arrive before dark?

/** Distance on a full tank, by vehicle, until the rider sets their own. */
export const DEFAULT_RANGE_KM: Record<Vehicle, number> = { bike: 200, car: 450 };
export const RANGE_LIMITS_KM = { min: 50, max: 1500 } as const;

/** Fuel stations this far from the route (straight line) count as on the way. */
export const FUEL_CORRIDOR_KM = 2;

export interface FuelStation {
  name: string;
  kmFromStart: number;
}

export interface FuelGap {
  fromKm: number;
  toKm: number;
  km: number;
  from: string; // station name, or the start's label
  to: string; // station name, or the destination's label
}

/** The longest stretch of the route without a fuel station, start and destination included. */
export function longestFuelGap(
  stations: FuelStation[],
  totalKm: number,
  startLabel: string,
  endLabel: string,
): FuelGap {
  const points = [
    { name: startLabel, km: 0 },
    ...stations
      .filter((s) => s.kmFromStart >= 0 && s.kmFromStart <= totalKm)
      .map((s) => ({ name: s.name, km: s.kmFromStart }))
      .sort((a, b) => a.km - b.km),
    { name: endLabel, km: totalKm },
  ];
  let best: FuelGap = { fromKm: 0, toKm: 0, km: 0, from: startLabel, to: startLabel };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.km - a.km > best.km) {
      best = { fromKm: a.km, toKm: b.km, km: b.km - a.km, from: a.name, to: b.name };
    }
  }
  return best;
}

/**
 * "ok": the longest gap uses at most 3/4 of the range (reserve left for detours and a closed
 * pump); "tight": within range but with little reserve; "short": the tank will not last.
 */
export function fuelVerdict(gapKm: number, rangeKm: number): "ok" | "tight" | "short" {
  if (gapKm <= rangeKm * 0.75) return "ok";
  return gapKm <= rangeKm ? "tight" : "short";
}

/** Rest stops: 15 minutes for every full 2 hours of riding. */
export function breakMinutes(rideMin: number): number {
  return Math.floor(rideMin / 120) * 15;
}

/** Arrive at least this long before sunset: roads are harder to read at dusk. */
export const DAYLIGHT_MARGIN_MIN = 60;
/** More riding than this in a day (with breaks) is worth splitting with a night stop. */
export const LONG_DAY_MIN = 10 * 60;

export interface DaylightPlan {
  departAt: Date;
  arriveAt: Date; // riding time plus breaks
  breakMin: number;
  /** Civil dawn at the start: light enough to ride from here on. */
  dawnAtStart: Date;
  sunsetAtEnd: Date; // on the arrival day
  /** Latest start that still arrives DAYLIGHT_MARGIN_MIN before sunset. */
  latestStart: Date;
  verdict: "day" | "dusk" | "dark";
  startsInDark: boolean;
  longDay: boolean;
}

const MINUTE = 60_000;

/** Noon of the same calendar day in the runtime's time zone, so SunCalc picks the right day. */
function noonOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

export function planDaylight({
  departAt,
  rideMin,
  start,
  end,
}: {
  departAt: Date;
  rideMin: number;
  start: LngLat;
  end: LngLat;
}): DaylightPlan {
  const breakMin = breakMinutes(rideMin);
  const arriveAt = new Date(departAt.getTime() + (rideMin + breakMin) * MINUTE);
  const dawnAtStart = SunCalc.getTimes(noonOf(departAt), start[1], start[0]).dawn;
  const sunsetAtEnd = SunCalc.getTimes(noonOf(arriveAt), end[1], end[0]).sunset;
  const latestStart = new Date(
    sunsetAtEnd.getTime() - (DAYLIGHT_MARGIN_MIN + rideMin + breakMin) * MINUTE,
  );
  const verdict =
    arriveAt.getTime() <= sunsetAtEnd.getTime() - DAYLIGHT_MARGIN_MIN * MINUTE
      ? "day"
      : arriveAt.getTime() <= sunsetAtEnd.getTime()
        ? "dusk"
        : "dark";
  return {
    departAt,
    arriveAt,
    breakMin,
    dawnAtStart,
    sunsetAtEnd,
    latestStart,
    verdict,
    startsInDark: departAt.getTime() < dawnAtStart.getTime(),
    longDay: rideMin + breakMin > LONG_DAY_MIN,
  };
}

/** Tomorrow at 06:00 local time, as a datetime-local value ("2026-09-30T06:00"). */
export function defaultDeparture(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 6, 0);
  return toDateTimeLocal(d);
}

export function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses a datetime-local value as local time; null if it is not one. */
export function fromDateTimeLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  return Number.isNaN(date.getTime()) ? null : date;
}
