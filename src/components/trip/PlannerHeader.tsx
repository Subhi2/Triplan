"use client";

import Link from "next/link";
import { CrosshairIcon } from "@/components/geo/CrosshairIcon";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import type { CorridorKm, Vehicle } from "@/lib/trip";

interface Props {
  /** Phones with a trip: one row, the trip itself in place of the app's name. */
  compact: boolean;
  fromLabel: string;
  toLabel: string;
  vehicle: Vehicle;
  corridorKm: CorridorKm;
  viaCount: number;
  /** The "Edit trip" / "Done" toggle, on phones with a trip. */
  formToggle: { open: boolean; onToggle: () => void } | null;
}

/** The planner's header: the app's name (or the trip on phones) and links to the other screens. */
export function PlannerHeader({
  compact,
  fromLabel,
  toLabel,
  vehicle,
  corridorKm,
  viaCount,
  formToggle,
}: Props) {
  return (
    <header className="flex items-center justify-between gap-2">
      {compact ? (
        <div className="min-w-0">
          <h1 className="sr-only">{SITE_NAME}</h1>
          <p className="font-display truncate text-[17px] font-bold">
            {fromLabel} → {toLabel}
          </p>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            {vehicle === "bike" ? "Bike" : "Car"} · within {corridorKm} km
            {viaCount > 0 && ` · ${viaCount} stop${viaCount > 1 ? "s" : ""} on the way`}
          </p>
        </div>
      ) : (
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-none font-extrabold tracking-tight md:text-3xl">
            {SITE_NAME}
          </h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{SITE_TAGLINE}</p>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={`/nearby?v=${vehicle}`}
          aria-label={compact ? "Near me" : undefined}
          title="Well-known places near you"
          className="text-brand-dark inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2 text-sm font-bold hover:underline dark:text-teal-300"
        >
          <CrosshairIcon size={18} />
          {!compact && "Near me"}
        </Link>
        {!compact && (
          <Link
            href="/rides"
            className="text-brand-dark hidden min-h-11 items-center px-2 text-sm font-bold hover:underline sm:inline-flex dark:text-teal-300"
          >
            Rides
          </Link>
        )}
        <Link
          href="/trips"
          className="text-brand-dark inline-flex min-h-11 items-center px-2 text-sm font-bold hover:underline dark:text-teal-300"
        >
          {compact ? "Trips" : "Saved trips"}
        </Link>
        {formToggle && (
          <button
            type="button"
            aria-expanded={formToggle.open}
            onClick={formToggle.onToggle}
            className="min-h-11 rounded-xl bg-stone-100 px-4 text-sm font-bold dark:bg-stone-800"
          >
            {formToggle.open ? "Done" : "Edit trip"}
          </button>
        )}
      </div>
    </header>
  );
}
