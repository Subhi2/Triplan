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

/**
 * Before you ride: the longest stretch without a fuel station against the vehicle's range, and
 * the arrival time against sunset (docs/07, G1.3).
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
        </ul>
      </div>
    </section>
  );
}
