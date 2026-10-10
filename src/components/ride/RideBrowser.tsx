"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CountUp } from "@/components/motion/CountUp";
import { CrownList } from "@/components/motion/CrownList";
import { MONTH_SHORT } from "@/lib/months";
import { RIDE_AREAS, rideArea, type RideArea, type RideSummary } from "@/lib/rides";
import { RouteSketch } from "./RouteSketch";

// The same chips as the place filters.
const chip =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm whitespace-nowrap md:min-h-9";
const chipOn = "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900";
const chipOff = "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700";

/** The famous rides with filters: where in India, and good in which month. */
export function RideBrowser({ rides }: { rides: RideSummary[] }) {
  const [area, setArea] = useState<RideArea | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  // Only the areas that have rides.
  const areas = useMemo(
    () => RIDE_AREAS.filter((a) => rides.some((r) => rideArea(r.region) === a)),
    [rides],
  );
  const shown = rides.filter(
    (r) =>
      (area === null || rideArea(r.region) === area) &&
      (month === null || r.bestMonths.includes(month)),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter rides">
        {[null, ...areas].map((a) => (
          <button
            key={a ?? "all"}
            type="button"
            aria-pressed={area === a}
            onClick={() => setArea(a)}
            className={`${chip} ${area === a ? chipOn : chipOff}`}
          >
            {a ?? "All of India"}
          </button>
        ))}
        <label className="inline-flex items-center gap-2 text-sm">
          <span className="text-stone-600 dark:text-stone-400">Good in</span>
          <select
            value={month ?? ""}
            onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
            className="min-h-11 rounded-lg border border-stone-300 bg-(--surface) px-2 text-base md:min-h-9 md:text-sm dark:border-stone-700"
          >
            <option value="">any month</option>
            {MONTH_SHORT.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="text-stone-600 dark:text-stone-400">
          No famous ride fits that yet.{" "}
          <button
            type="button"
            onClick={() => {
              setArea(null);
              setMonth(null);
            }}
            className="text-brand-dark inline-flex min-h-11 items-center font-bold hover:underline md:min-h-0 dark:text-teal-300"
          >
            Show all rides
          </button>
        </p>
      ) : (
        <CrownList
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Famous rides"
          selector="[data-ride-card]"
          config={{
            axis: "xy",
            radius: 300,
            lift: 10,
            shift: 10,
            grow: 0.03,
            glow: 0.6,
            toward: true,
          }}
        >
          {shown.map((r, i) => (
            <li
              key={r.slug}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}
            >
              <Link
                href={`/rides/${r.slug}`}
                data-ride-card
                className="crown crown-glow group flex h-full flex-col gap-3 rounded-2xl border border-stone-200 bg-(--surface) p-4 hover:border-stone-400 dark:border-stone-700"
              >
                <RouteSketch
                  line={r.line}
                  className="bg-brand-tint h-36 w-full rounded-xl dark:bg-teal-950"
                />
                <span className="flex flex-col gap-1">
                  <span className="font-display text-lg leading-tight font-bold group-hover:underline">
                    {r.title}
                  </span>
                  <span className="text-sm text-stone-600 dark:text-stone-400">{r.region}</span>
                </span>
                <span className="tabular mt-auto flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm">
                  <CountUp value={r.distanceKm} unit="km" fromServer />
                  <CountUp value={r.durationMin} unit="duration" fromServer />
                  {r.hairpins > 0 && (
                    <span className="text-ghat-dark font-semibold dark:text-orange-300">
                      <CountUp value={r.hairpins} fromServer /> hairpins
                    </span>
                  )}
                  {r.ascentM !== null && (
                    <span>
                      ↑ <CountUp value={r.ascentM} unit="metres" fromServer />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </CrownList>
      )}
    </div>
  );
}
