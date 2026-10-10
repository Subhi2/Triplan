"use client";

import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { MAX_DAYS, RIDE_HOURS, type DayLeg, type RideHours } from "@/lib/multiDay";
import { telLink } from "@/lib/safety";
import { RetryAlert } from "@/components/ui/RetryAlert";
import type { DayPlanState } from "./useDayPlan";

interface Props {
  state: DayPlanState;
  /** Days shown: the rider's pick, or what the route needs. */
  days: number;
  suggestedDays: number;
  hoursPerDay: RideHours;
  destination: string;
  onHoursChange: (hours: RideHours) => void;
  /** Null goes back to the days the route needs. */
  onDaysChange: (days: number | null) => void;
}

function HoursSelect({ value, onChange }: { value: RideHours; onChange: (h: RideHours) => void }) {
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">Riding hours a day</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as RideHours)}
        className="min-h-11 rounded-lg bg-stone-100 px-2 text-base md:min-h-9 md:text-sm dark:bg-stone-800"
      >
        {RIDE_HOURS.map((h) => (
          <option key={h} value={h}>
            {h} h a day
          </option>
        ))}
      </select>
    </label>
  );
}

function endLabel(leg: DayLeg, destination: string): string {
  if (leg.end.kind === "destination") return `Arrive in ${destination}`;
  if (leg.end.name) return `Night in ${leg.end.name}`;
  return `Night near km ${Math.round(leg.end.kmFromStart)}, no town on the road here`;
}

const stepButton =
  "inline-flex h-11 w-11 items-center justify-center rounded-lg bg-stone-100 text-lg font-bold disabled:opacity-40 md:h-9 md:w-9 dark:bg-stone-800";

/**
 * "Over N days": the route cut into days of riding, each night in a town on the road with the
 * nearest stays (tap to call). A route that fits in a day shows one line with "Split over 2 days".
 */
export function DaySplit({
  state,
  days,
  suggestedDays,
  hoursPerDay,
  destination,
  onHoursChange,
  onDaysChange,
}: Props) {
  if (days === 1) {
    return (
      <section
        aria-label="Days"
        className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600 dark:text-stone-400"
      >
        <span className="inline-flex items-center gap-2">
          One day&apos;s ride at <HoursSelect value={hoursPerDay} onChange={onHoursChange} />
        </span>
        <button
          type="button"
          onClick={() => onDaysChange(2)}
          className="text-brand-dark min-h-11 font-bold hover:underline md:min-h-0 dark:text-teal-300"
        >
          Split over 2 days
        </button>
      </section>
    );
  }

  const legs = state.status === "ok" ? state.plan.legs : [];
  return (
    <section aria-labelledby="days-heading" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="days-heading" className="font-display text-[17px] font-bold tracking-tight">
          Over {days} days
        </h3>
        <div className="flex items-center gap-1.5">
          <div role="group" aria-label="Days" className="flex items-center gap-1">
            <button
              type="button"
              aria-label="One day fewer"
              disabled={days <= 1}
              onClick={() => onDaysChange(days - 1 === suggestedDays ? null : days - 1)}
              className={stepButton}
            >
              −
            </button>
            <span className="tabular w-6 text-center font-mono text-sm">{days}</span>
            <button
              type="button"
              aria-label="One day more"
              disabled={days >= MAX_DAYS}
              onClick={() => onDaysChange(days + 1 === suggestedDays ? null : days + 1)}
              className={stepButton}
            >
              +
            </button>
          </div>
          <HoursSelect value={hoursPerDay} onChange={onHoursChange} />
        </div>
      </div>
      {state.status === "loading" && <div aria-hidden className="shimmer h-24 rounded-xl" />}
      {state.status === "error" && (
        <RetryAlert quiet message="Could not split this route into days." onRetry={state.retry} />
      )}
      {legs.length > 0 && (
        <ol aria-label="Days of riding" className="flex flex-col">
          {legs.map((leg) => (
            <li
              key={leg.day}
              className="relative border-l-2 border-stone-300 pb-3 pl-4 last:pb-0 dark:border-stone-700"
            >
              <span
                aria-hidden
                className="bg-brand absolute top-1.5 -left-[7px] h-3 w-3 rounded-full border-2 border-(--background)"
              />
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold">Day {leg.day}</span>
                <span className="tabular font-mono text-xs text-stone-600 dark:text-stone-400">
                  km {Math.round(leg.fromKm)}–{Math.round(leg.toKm)} · {formatDuration(leg.rideMin)}{" "}
                  riding
                </span>
              </p>
              <p className="text-sm">
                {endLabel(leg, destination)}
                {leg.end.stayCount > 0 && (
                  <span className="text-stone-600 dark:text-stone-400">
                    {" "}
                    · <span className="tabular font-mono">{leg.end.stayCount}</span>{" "}
                    {leg.end.stayCount === 1 ? "stay" : "stays"} within 5 km
                  </span>
                )}
              </p>
              {leg.end.stays.length > 0 && (
                <ul
                  aria-label={`Stays near ${leg.end.name ?? `km ${Math.round(leg.end.kmFromStart)}`}`}
                  className="mt-1 flex flex-col"
                >
                  {leg.end.stays.map((s) => {
                    const tel = s.phone ? telLink(s.phone) : null;
                    return (
                      <li
                        key={s.id}
                        className="flex min-h-11 items-center gap-2 text-sm md:min-h-8"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {s.slug ? (
                            <Link href={`/place/${s.slug}`} className="font-bold hover:underline">
                              {s.name}
                            </Link>
                          ) : (
                            s.name
                          )}
                        </span>
                        <span className="tabular shrink-0 font-mono text-xs text-stone-600 dark:text-stone-400">
                          {s.distanceKm.toFixed(1)} km
                        </span>
                        {tel && (
                          <a
                            href={tel}
                            className="text-brand-dark inline-flex min-h-11 shrink-0 items-center px-1 font-bold hover:underline md:min-h-0 dark:text-teal-300"
                          >
                            Call
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-stone-600 dark:text-stone-400">
        Riding time only: add breaks, food and fuel stops.
        {days !== suggestedDays &&
          ` At ${hoursPerDay} h a day this route needs ${suggestedDays} day${suggestedDays > 1 ? "s" : ""}.`}{" "}
        Stays are from OpenStreetMap; call ahead.
      </p>
    </section>
  );
}
