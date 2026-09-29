"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePlacesAlong } from "@/components/place/usePlacesAlong";
import { formatDuration } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import {
  DEFAULT_RANGE_KM,
  defaultDeparture,
  FUEL_CORRIDOR_KM,
  fromDateTimeLocal,
  fuelVerdict,
  longestFuelGap,
  planDaylight,
  RANGE_LIMITS_KM,
} from "@/lib/rideCheck";
import type { RouteOption, Vehicle } from "@/lib/trip";
import { summarizeWeather, type WeatherPoint } from "@/lib/weather";
import { useWeatherAlong } from "./useWeatherAlong";

interface Props {
  route: RouteOption;
  vehicle: Vehicle;
  from: { label: string; location: LngLat };
  to: { label: string; location: LngLat };
  /** The chosen start time (datetime-local value), shared with the weather check. */
  departure: string;
  onDepartureChange: (value: string) => void;
}

const FUEL_CATEGORIES = ["fuel"];
const rangeKey = (v: Vehicle) => `ride-check-range-${v}`;

function readRange(vehicle: Vehicle): number {
  try {
    const n = Number(localStorage.getItem(rangeKey(vehicle)));
    if (n >= RANGE_LIMITS_KM.min && n <= RANGE_LIMITS_KM.max) return n;
  } catch {
    // Storage blocked (private window): use the default.
  }
  return DEFAULT_RANGE_KM[vehicle];
}

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayAndTime = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});
const short = (label: string) => label.split(",")[0]!.trim();

type Tone = "ok" | "warn" | "bad" | "muted";
const DOT: Record<Tone, string> = {
  ok: "bg-emerald-600",
  warn: "bg-amber-500",
  bad: "bg-red-600",
  muted: "bg-stone-400",
};

function Check({ tone, title, children }: { tone: Tone; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`} />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

const inputClass =
  "min-h-11 w-full rounded-md border border-stone-300 bg-white px-2 text-base md:min-h-0 md:py-1 md:text-sm dark:border-stone-700 dark:bg-stone-900";

const RAIN_WORDS = { light: "Light rain", rain: "Rain", heavy: "Heavy rain" } as const;
const kmh = (ms: number) => Math.round(ms * 3.6);

function pointWeather(p: WeatherPoint): string {
  const f = p.forecast;
  if (!f) return "no forecast yet";
  const rain =
    f.rain === "dry"
      ? "dry"
      : `${RAIN_WORDS[f.rain].toLowerCase()} (${f.rainMm} mm/${f.rainHours} h)`;
  return [
    f.tempC !== null && `${Math.round(f.tempC)} °C`,
    f.thunder ? "thunder" : rain,
    f.windMs !== null && f.windMs >= 8 && `wind ${kmh(f.windMs)} km/h`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Before you ride: the longest stretch without a fuel station against the vehicle's range, the
 * arrival time against sunset (docs/07, G1.3) and the weather on the way (G1.5).
 */
export function RideCheck({ route, vehicle, from, to, departure, onDepartureChange }: Props) {
  const [rangeKm, setRangeKm] = useState(() => DEFAULT_RANGE_KM[vehicle]);
  const [rangeText, setRangeText] = useState(String(DEFAULT_RANGE_KM[vehicle]));
  useEffect(() => {
    const saved = readRange(vehicle);
    setRangeKm(saved);
    setRangeText(String(saved));
  }, [vehicle]);

  function changeRange(text: string) {
    setRangeText(text);
    const n = Number(text);
    if (Number.isFinite(n) && n >= RANGE_LIMITS_KM.min && n <= RANGE_LIMITS_KM.max) {
      setRangeKm(n);
      try {
        localStorage.setItem(rangeKey(vehicle), String(n));
      } catch {
        // Not remembered; still used for this trip.
      }
    }
  }

  const fuel = usePlacesAlong(route, FUEL_CORRIDOR_KM, FUEL_CATEGORIES);
  const gap = useMemo(
    () =>
      fuel.status === "ok"
        ? longestFuelGap(fuel.places, route.distanceKm, short(from.label), short(to.label))
        : null,
    [fuel, route.distanceKm, from.label, to.label],
  );

  const departAt = fromDateTimeLocal(departure);
  const daylight = departAt
    ? planDaylight({
        departAt,
        rideMin: route.durationMin,
        start: from.location,
        end: to.location,
      })
    : null;
  const sameDay = daylight && daylight.arriveAt.toDateString() === daylight.departAt.toDateString();
  const fmtArrive = (d: Date) => (sameDay ? time.format(d) : dayAndTime.format(d));

  const verdict = gap ? fuelVerdict(gap.km, rangeKm) : null;
  const stationCount = fuel.status === "ok" ? fuel.places.length : 0;
  const fuelTone: Tone = !verdict
    ? "muted"
    : verdict === "ok"
      ? "ok"
      : verdict === "tight"
        ? "warn"
        : "bad";
  const dayTone: Tone = !daylight
    ? "muted"
    : daylight.verdict === "day"
      ? "ok"
      : daylight.verdict === "dusk"
        ? "warn"
        : "bad";

  const weather = useWeatherAlong(route, departAt);
  // The first and last points are the trip's own start and destination.
  const points = useMemo(
    () =>
      weather.status === "ok"
        ? weather.points.map((p, i, all) => ({
            ...p,
            label: i === 0 ? short(from.label) : i === all.length - 1 ? short(to.label) : p.label,
          }))
        : [],
    [weather, from.label, to.label],
  );
  const sky = summarizeWeather(points);
  const skyTone: Tone =
    weather.status !== "ok" || sky.level === "none"
      ? "muted"
      : sky.level === "thunder" || sky.level === "heavy"
        ? "bad"
        : sky.level === "rain" || sky.windy
          ? "warn"
          : "ok";
  const at = (p: WeatherPoint) => time.format(new Date(p.eta));
  const temps =
    sky.minTempC !== null && sky.maxTempC !== null
      ? `${Math.round(sky.minTempC)}–${Math.round(sky.maxTempC)} °C`
      : null;
  const skyTitle =
    sky.level === "none"
      ? "Weather: no forecast yet for that day (about 9 days ahead)"
      : sky.level === "thunder"
        ? `Weather: thunderstorms near ${sky.worst!.label} around ${at(sky.worst!)}`
        : sky.level === "dry"
          ? `Weather: dry on the way${temps ? `, ${temps}` : ""}`
          : `Weather: ${RAIN_WORDS[sky.level].toLowerCase()} near ${sky.worst!.label} around ${at(sky.worst!)}`;
  const skyShort =
    weather.status !== "ok" || sky.level === "none"
      ? "Weather"
      : sky.level === "dry"
        ? "Dry"
        : sky.level === "thunder"
          ? "Thunder"
          : RAIN_WORDS[sky.level];

  // Open on wide screens; on phones a one-line summary keeps the place list in view.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(window.matchMedia("(min-width: 768px)").matches), []);

  return (
    <section
      aria-labelledby="ride-check-heading"
      className="rounded-lg border border-stone-200 text-sm dark:border-stone-700"
    >
      <h2 id="ride-check-heading" className="font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="ride-check-body"
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center gap-3 px-3 text-left md:min-h-10"
        >
          <span>Ride check</span>
          {!open && (
            <span className="flex min-w-0 flex-1 items-center gap-3 text-xs font-normal text-stone-600 dark:text-stone-400">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className={`h-2 w-2 rounded-full ${DOT[fuelTone]}`} />
                {gap ? `Fuel gap ${Math.round(gap.km)} km` : "Fuel"}
              </span>
              <span className="inline-flex items-center gap-1 truncate">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[dayTone]}`} />
                {daylight ? `Arrive ${fmtArrive(daylight.arriveAt)}` : "Daylight"}
              </span>
              <span className="inline-flex items-center gap-1 truncate">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[skyTone]}`} />
                {skyShort}
              </span>
            </span>
          )}
          <span aria-hidden className="ml-auto text-stone-500">
            {open ? "▴" : "▾"}
          </span>
        </button>
      </h2>
      <div id="ride-check-body" hidden={!open} className="space-y-3 px-3 pb-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="block text-xs text-stone-600 dark:text-stone-400">Start</span>
            <input
              type="datetime-local"
              value={departure}
              onChange={(e) => onDepartureChange(e.target.value || defaultDeparture())}
              className={inputClass}
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-stone-600 dark:text-stone-400">
              Range on a full tank (km)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={RANGE_LIMITS_KM.min}
              max={RANGE_LIMITS_KM.max}
              step={10}
              value={rangeText}
              onChange={(e) => changeRange(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <ul className="space-y-3" aria-live="polite">
          {fuel.status === "loading" && (
            <Check tone="muted" title="Fuel">
              <p className="text-stone-600 dark:text-stone-400">Checking fuel stations…</p>
            </Check>
          )}
          {fuel.status === "error" && (
            <Check tone="muted" title="Fuel">
              <p className="text-stone-600 dark:text-stone-400">Could not check fuel stations.</p>
            </Check>
          )}
          {gap && verdict && (
            <Check
              tone={fuelTone}
              title={
                verdict === "ok"
                  ? `Fuel: longest stretch without a pump is ${Math.round(gap.km)} km`
                  : verdict === "tight"
                    ? `Fuel: fill up before a ${Math.round(gap.km)} km stretch`
                    : `Fuel: ${Math.round(gap.km)} km without a pump, more than your range`
              }
            >
              <p>
                From {gap.from} (km {Math.round(gap.fromKm)}) to {gap.to} (km {Math.round(gap.toKm)}
                ).{" "}
                {verdict === "tight" &&
                  `That is close to your ${rangeKm} km range: fill the tank at ${gap.from}.`}
                {verdict === "short" &&
                  `Your tank lasts about ${rangeKm} km: carry fuel or plan a detour to a pump.`}
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                {stationCount} fuel station{stationCount === 1 ? "" : "s"} within {FUEL_CORRIDOR_KM}{" "}
                km of the route, from OpenStreetMap; some may be missing or closed.
              </p>
            </Check>
          )}

          {daylight && (
            <Check
              tone={dayTone}
              title={
                daylight.verdict === "day"
                  ? `Daylight: arrive about ${fmtArrive(daylight.arriveAt)}, before dark`
                  : daylight.verdict === "dusk"
                    ? `Daylight: you arrive around sunset`
                    : `Daylight: you would ride after dark`
              }
            >
              <p>
                {formatDuration(route.durationMin)} riding
                {daylight.breakMin > 0 && ` + ${daylight.breakMin} min of breaks`}, arriving about{" "}
                {fmtArrive(daylight.arriveAt)}. Sunset at {short(to.label)}:{" "}
                {time.format(daylight.sunsetAtEnd)}.
              </p>
              {daylight.verdict !== "day" && (
                <p>
                  Start by {time.format(daylight.latestStart)} to arrive an hour before sunset
                  {daylight.longDay ? ", or stop for the night on the way" : ""}.
                </p>
              )}
              {daylight.startsInDark && (
                <p>
                  It is dark at {short(from.label)} until about {time.format(daylight.dawnAtStart)}:
                  the first stretch is ridden before dawn.
                </p>
              )}
              {daylight.longDay && daylight.verdict === "day" && (
                <p>That is over 10 hours on the road: think about a night stop on the way.</p>
              )}
            </Check>
          )}

          {(weather.status === "loading" || weather.status === "idle") && (
            <Check tone="muted" title="Weather">
              <p className="text-stone-600 dark:text-stone-400">Checking the forecast…</p>
            </Check>
          )}
          {weather.status === "error" && (
            <Check tone="muted" title="Weather">
              <p className="text-stone-600 dark:text-stone-400">Could not load the forecast.</p>
            </Check>
          )}
          {weather.status === "ok" && (
            <Check tone={skyTone} title={skyTitle}>
              {sky.windy && (
                <p>
                  Strong wind near {sky.windy.label}: {kmh(sky.windy.forecast!.windMs!)} km/h.
                </p>
              )}
              {sky.level !== "none" && (
                <ol aria-label="Weather along the route" className="mt-1 space-y-0.5 text-xs">
                  {points.map((p) => (
                    <li key={p.km} className="flex gap-2">
                      <span className="w-14 shrink-0 text-stone-600 tabular-nums dark:text-stone-400">
                        {at(p)}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium">{p.label}</span> · {pointWeather(p)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Forecast by{" "}
                <a
                  href="https://www.met.no/en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  MET Norway
                </a>{" "}
                (CC BY 4.0), for the time you reach each point.
              </p>
            </Check>
          )}
        </ul>
      </div>
    </section>
  );
}
