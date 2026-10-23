"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePlacesAlong } from "@/components/place/usePlacesAlong";
import type { AlertsState } from "@/components/route/useRouteAlerts";
import type { RulesState } from "@/components/route/useRouteRules";
import { alertLine, alertsForRide, alertTone } from "@/lib/alerts";
import type { BreakPlan } from "@/lib/breaks";
import { formatDuration } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import { routeTimeline } from "@/lib/multiDay";
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
import type { PlaceAlong } from "@/lib/places";
import { checkRules, closedHours, SPARE_WARN_MIN, type RuleCheck } from "@/lib/roadRules";
import type { Gap, TollPlaza } from "@/lib/safety";
import type { RouteOption, Vehicle } from "@/lib/trip";
import {
  FASTAG_PASS,
  formatRupees,
  FUEL_PRICE_LIMITS,
  fuelCost,
  fuelPriceKey,
  MILEAGE_LIMITS,
  mileageKey,
  parseWithin,
} from "@/lib/tripCost";
import type { SunsetStop } from "@/lib/sunset";
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
  /** The longest stretch without a hospital near the road, once safety stops have loaded. */
  hospitalGap?: Gap | null;
  /** Official alerts on the route (all current ones; the ride check keeps those for the ride). */
  alerts?: AlertsState;
  /** Night bans, permits, e-passes and fees on the route, with the route's timeline. */
  rules?: RulesState;
  /** With a multi-day split, each day's km: a day starts at the same time of day as the first. */
  days?: { fromKm: number; toKm: number }[];
  /** Suggested breaks. Null while the food, coffee and fuel stops are still loading. */
  breaks?: BreakPlan<PlaceAlong> | null;
  /** The break stops could not be loaded. */
  breaksError?: boolean;
  /** A viewpoint, peak, beach or lake to end each day at; null while places load. */
  sunsets?: SunsetStop[] | null;
  pickedIds?: ReadonlySet<string>;
  /** Ticks or unticks a suggested break or sunset stop. */
  onBreakToggle?: (place: PlaceAlong) => void;
  /** Toll plazas on the route; null while they load. */
  tolls?: TollPlaza[] | null;
  tollsError?: boolean;
}

/** A stretch without a hospital longer than these is worth knowing about (km). */
const HOSPITAL_OK_KM = 60;
const HOSPITAL_WARN_KM = 120;

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

function readText(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayAndTime = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});
const short = (label: string) => label.split(",")[0]!.trim();
const checkedDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const NEEDS: Record<"permit" | "epass" | "fee", string> = {
  permit: "Permit needed",
  epass: "E-pass needed",
  fee: "Fee to pay",
};

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

/** One road rule the ride meets: a night ban against the time the rider gets there, or a permit. */
function RoadRuleLine({
  check: { rule, verdict },
  departAt,
}: {
  check: RuleCheck;
  departAt: Date;
}) {
  const when = (d: Date) =>
    d.toDateString() === departAt.toDateString() ? time.format(d) : dayAndTime.format(d);
  const hours =
    rule.closedFrom && rule.closedTo ? closedHours(rule.closedFrom, rule.closedTo) : null;
  const credit = (
    <p className="text-xs text-stone-600 dark:text-stone-400">
      {rule.note && <>{rule.note} </>}
      <a href={rule.link} target="_blank" rel="noopener noreferrer" className="underline">
        {rule.source ?? new URL(rule.link).hostname}
      </a>{" "}
      · checked {checkedDate.format(new Date(`${rule.checkedOn}T12:00:00Z`))}
    </p>
  );
  if (verdict.state === "closed") {
    return (
      <Check
        tone="bad"
        title={`${rule.title} is closed when you get there, about ${when(verdict.enterAt)}`}
      >
        <p>
          Closed {hours}. Start by {when(verdict.leaveBy)} to get through before it closes, or after{" "}
          {when(verdict.leaveFrom)} to reach it once it opens.
        </p>
        {credit}
      </Check>
    );
  }
  if (verdict.state === "open") {
    const tight = verdict.minutesSpare < SPARE_WARN_MIN;
    return (
      <Check
        tone={tight ? "warn" : "ok"}
        title={`${rule.title}: open when you pass, about ${when(verdict.enterAt)}`}
      >
        <p>
          Closed {hours}.
          {tight &&
            ` You are through only ${verdict.minutesSpare} min before it closes: leave a little earlier.`}
        </p>
        {credit}
      </Check>
    );
  }
  return (
    <Check tone="warn" title={rule.title}>
      <p>
        On your route from km {Math.round(rule.kmFrom)}, about {when(verdict.enterAt)}.{" "}
        {verdict.what === "fee" ? "Pay" : "Apply"} before you go.
      </p>
      {credit}
    </Check>
  );
}

/**
 * Before you ride: the longest stretch without a fuel station against the vehicle's range, the
 * arrival time against sunset (docs/07, G1.3), the weather on the way (G1.5) and official alerts
 * in force while you ride (G5).
 */
export function RideCheck({
  route,
  vehicle,
  from,
  to,
  departure,
  onDepartureChange,
  hospitalGap = null,
  alerts = { status: "idle" },
  rules = { status: "idle" },
  days,
  breaks = null,
  breaksError = false,
  sunsets = null,
  pickedIds,
  onBreakToggle,
  tolls = null,
  tollsError = false,
}: Props) {
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

  // Mileage and fuel price as the rider typed them, remembered per vehicle.
  const [mileageText, setMileageText] = useState("");
  const [priceText, setPriceText] = useState("");
  useEffect(() => {
    setMileageText(readText(mileageKey(vehicle)));
    setPriceText(readText(fuelPriceKey(vehicle)));
  }, [vehicle]);
  function changeCostInput(key: string, text: string, set: (t: string) => void) {
    set(text);
    try {
      localStorage.setItem(key, text);
    } catch {
      // Not remembered; still used for this trip.
    }
  }
  const mileage = parseWithin(mileageText, MILEAGE_LIMITS);
  const fuelPrice = parseWithin(priceText, FUEL_PRICE_LIMITS);
  const cost = mileage && fuelPrice ? fuelCost(route.distanceKm, mileage, fuelPrice) : null;

  const fuel = usePlacesAlong(route, FUEL_CORRIDOR_KM, FUEL_CATEGORIES, true);
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
  const someOpenFuel = fuel.status === "ok" && fuel.places.some((p) => p.open);
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

  const rideAlerts =
    alerts.status === "ok" ? alertsForRide(alerts.alerts, departAt, route.durationMin) : [];

  // Road rules against this start time: the server's timeline when it has the route, else time
  // in proportion to distance.
  const ruleTimeline = useMemo(
    () =>
      rules.status === "ok" && rules.timeline
        ? rules.timeline
        : routeTimeline(undefined, route.distanceKm, route.durationMin),
    [rules, route.distanceKm, route.durationMin],
  );
  const ruleChecks =
    rules.status === "ok" && departAt
      ? checkRules(rules.rules, vehicle, { departAt, timeline: ruleTimeline, days })
      : [];
  const closedRule = ruleChecks.find((c) => c.verdict.state === "closed");
  const neededRule = ruleChecks.find((c) => c.verdict.state === "needs");
  const alertsTone: Tone = rideAlerts[0] ? alertTone(rideAlerts[0].severity) : "ok";

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
            // Wraps instead of cutting words off: with an alert there are four items, too many
            // for one line at 375 px. The alert count leads.
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 py-1 text-xs font-normal whitespace-nowrap text-stone-600 dark:text-stone-400">
              {rideAlerts.length > 0 && (
                <span className="inline-flex items-center gap-1 font-bold text-stone-800 dark:text-stone-200">
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${DOT[alertsTone]}`}
                  />
                  {rideAlerts.length === 1 ? "1 alert" : `${rideAlerts.length} alerts`}
                </span>
              )}
              {(closedRule || neededRule) && (
                <span className="inline-flex items-center gap-1 font-bold text-stone-800 dark:text-stone-200">
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${DOT[closedRule ? "bad" : "warn"]}`}
                  />
                  {closedRule
                    ? "Closed at night"
                    : neededRule!.verdict.state === "needs"
                      ? NEEDS[neededRule!.verdict.what]
                      : null}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className={`h-2 w-2 rounded-full ${DOT[fuelTone]}`} />
                {gap ? `Fuel gap ${Math.round(gap.km)} km` : "Fuel"}
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[dayTone]}`} />
                {daylight ? `Arrive ${fmtArrive(daylight.arriveAt)}` : "Daylight"}
              </span>
              <span className="inline-flex items-center gap-1">
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
          {hospitalGap && (
            <Check
              tone={
                hospitalGap.km <= HOSPITAL_OK_KM
                  ? "ok"
                  : hospitalGap.km <= HOSPITAL_WARN_KM
                    ? "warn"
                    : "bad"
              }
              title={`Hospitals: longest stretch without one is ${Math.round(hospitalGap.km)} km`}
            >
              <p className="text-xs text-stone-600 dark:text-stone-400">
                From km {Math.round(hospitalGap.fromKm)} to km {Math.round(hospitalGap.toKm)},
                within 3 km of the road (OpenStreetMap). In an emergency call 112.
              </p>
            </Check>
          )}
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
                km of the route, from OpenStreetMap
                {someOpenFuel && (
                  <>
                    {" "}
                    and <OvertureLink />
                  </>
                )}
                ; some may be missing or closed.
              </p>
            </Check>
          )}

          <Check
            tone={cost ? "ok" : "muted"}
            title={
              cost
                ? `Fuel cost: about ${formatRupees(cost.rupees)} for ${Math.round(route.distanceKm)} km`
                : "Fuel cost"
            }
          >
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="space-y-1">
                <span className="block text-xs text-stone-600 dark:text-stone-400">
                  Mileage (km per litre)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={MILEAGE_LIMITS.min}
                  max={MILEAGE_LIMITS.max}
                  step="any"
                  value={mileageText}
                  onChange={(e) =>
                    changeCostInput(mileageKey(vehicle), e.target.value, setMileageText)
                  }
                  className={inputClass}
                />
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-stone-600 dark:text-stone-400">
                  Fuel price (₹ per litre)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={FUEL_PRICE_LIMITS.min}
                  max={FUEL_PRICE_LIMITS.max}
                  step="any"
                  value={priceText}
                  onChange={(e) =>
                    changeCostInput(fuelPriceKey(vehicle), e.target.value, setPriceText)
                  }
                  className={inputClass}
                />
              </label>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              {cost
                ? `${cost.litres} litres, one way. Remembered on this device for your ${vehicle}.`
                : "Type your mileage and today's fuel price to work out the cost, one way."}
            </p>
          </Check>

          {vehicle === "bike" ? (
            <Check tone="ok" title="No tolls: two-wheelers ride national highways free">
              <p className="text-xs text-stone-600 dark:text-stone-400">
                NHAI confirmed in June 2025 that two-wheelers stay exempt from highway tolls.
              </p>
            </Check>
          ) : tollsError ? (
            <Check tone="muted" title="Tolls">
              <p className="text-stone-600 dark:text-stone-400">Could not check toll plazas.</p>
            </Check>
          ) : tolls === null ? (
            <Check tone="muted" title="Tolls">
              <p className="text-stone-600 dark:text-stone-400">Checking toll plazas…</p>
            </Check>
          ) : (
            <Check
              tone={tolls.length > 0 ? "ok" : "muted"}
              title={
                tolls.length === 0
                  ? "Tolls: no toll plazas mapped on the route"
                  : `Tolls: ${tolls.length} toll plaza${tolls.length === 1 ? "" : "s"} on the route`
              }
            >
              {tolls.length > 0 && (
                <ol aria-label="Toll plazas on the route" className="space-y-0.5 text-xs">
                  {tolls.map((t) => (
                    <li key={t.id}>
                      <span className="tabular font-mono">km {Math.round(t.kmFromStart)}</span> ·{" "}
                      {t.name ?? "Toll plaza"}
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Driving often? The FASTag annual pass is {formatRupees(FASTAG_PASS.rupees)} for{" "}
                {FASTAG_PASS.crossings} national-highway crossings (private cars). Amounts differ by
                plaza and change every April, so we do not show them. Plazas from OpenStreetMap;
                some may be missing.
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

          {breaksError && (
            <Check tone="muted" title="Breaks">
              <p className="text-stone-600 dark:text-stone-400">Could not look for break stops.</p>
            </Check>
          )}
          {!breaksError && breaks === null && (
            <Check tone="muted" title="Breaks">
              <p className="text-stone-600 dark:text-stone-400">
                Looking for a stop every 2 hours…
              </p>
            </Check>
          )}
          {breaks && breaks.marks.length > 0 && (
            <Check
              tone={breaks.stops.length > 0 ? "ok" : "warn"}
              title={
                breaks.stops.length > 0
                  ? `Breaks: ${breaks.stops.length} stop${breaks.stops.length === 1 ? "" : "s"} along the way`
                  : "Breaks: no food, coffee or fuel near the 2-hour marks"
              }
            >
              {breaks.stops.length > 0 && (
                <ul aria-label="Suggested breaks" className="space-y-1">
                  {breaks.stops.map((b) => {
                    const on = pickedIds?.has(b.place.id) ?? false;
                    return (
                      <li key={b.place.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => onBreakToggle?.(b.place)}
                          className="min-h-11 w-full rounded-md px-1 text-left md:min-h-9"
                        >
                          <span className="font-medium">{b.place.name}</span>
                          <span className="text-stone-600 dark:text-stone-400">
                            {" "}
                            · km {Math.round(b.place.kmFromStart)} · about {time.format(b.arriveAt)}
                            {on ? " · ticked" : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-stone-600 dark:text-stone-400">
                A stop within 1 km of the road, near every 2 hours of riding, outside 2–4 pm where
                there is a choice. A tap ticks it for the trip.
                {breaks.stops.some((b) => b.place.open) && (
                  <>
                    {" "}
                    Some from <OvertureLink />.
                  </>
                )}
              </p>
            </Check>
          )}

          {sunsets && sunsets.length > 0 && (
            <Check
              tone="ok"
              title={
                sunsets.length === 1
                  ? `Sunset stop: ${sunsets[0]!.place.name}`
                  : `Sunset stops: one for each of ${sunsets.length} days`
              }
            >
              <ul aria-label="Sunset stops" className="space-y-1">
                {sunsets.map((s) => {
                  const on = pickedIds?.has(s.place.id) ?? false;
                  const early = s.sunset.getTime() - s.arriveAt.getTime() >= 30 * 60_000;
                  return (
                    <li key={s.place.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onBreakToggle?.(s.place)}
                        className="min-h-11 w-full rounded-md px-1 text-left md:min-h-9"
                      >
                        <span className="font-medium">
                          {sunsets.length > 1 && `Day ${s.day + 1}: `}
                          {s.place.name}
                        </span>
                        <span className="text-stone-600 dark:text-stone-400">
                          {" "}
                          · km {Math.round(s.place.kmFromStart)} · sunset {time.format(s.sunset)} ·
                          you get there about {time.format(s.arriveAt)}
                          {early ? "" : " (late)"}. Leave by {time.format(s.leaveBy)} to be there 30
                          min before sunset
                          {on ? " · ticked" : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                The best viewpoint, peak, beach or lake in the last quarter of the day, within 5 km
                of the road. A tap ticks it for the trip.
              </p>
            </Check>
          )}

          {departAt &&
            ruleChecks.map((c) => <RoadRuleLine key={c.rule.slug} check={c} departAt={departAt} />)}

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

          {(alerts.status === "loading" || alerts.status === "error") && (
            <Check tone="muted" title="Official alerts">
              <p className="text-stone-600 dark:text-stone-400">
                {alerts.status === "loading"
                  ? "Checking official alerts…"
                  : "Could not load official alerts."}
              </p>
            </Check>
          )}
          {alerts.status === "ok" && (
            <Check
              tone={alertsTone}
              title={
                rideAlerts.length === 0
                  ? "Official alerts: none on the way while you ride"
                  : rideAlerts.length === 1
                    ? `Official alert: ${rideAlerts[0]!.event.toLowerCase()} on the way`
                    : `Official alerts: ${rideAlerts.length} on the way`
              }
            >
              {rideAlerts.length > 0 && (
                <ol
                  aria-label="Official alerts while you ride"
                  className="mt-1 space-y-0.5 text-xs"
                >
                  {rideAlerts.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium">{a.severity}</span> · {alertLine(a)}
                    </li>
                  ))}
                </ol>
              )}
              {alerts.partial && (
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  Some alerts could not be checked yet: look again in a few minutes.
                </p>
              )}
              <p className="text-xs text-stone-600 dark:text-stone-400">
                From{" "}
                <a
                  href="https://sachet.ndma.gov.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  NDMA&apos;s SACHET
                </a>
                : IMD, state disaster authorities and CWC, for the hours you are on the road.
              </p>
            </Check>
          )}
        </ul>
      </div>
    </section>
  );
}

/** Credit for open places (docs/02, "Open places from Overture"). */
function OvertureLink() {
  return (
    <a
      href="https://overturemaps.org/"
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    >
      Overture Maps
    </a>
  );
}
