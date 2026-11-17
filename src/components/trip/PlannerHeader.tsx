"use client";

import Link from "next/link";
import { CrosshairIcon } from "@/components/geo/CrosshairIcon";
import { SiteMenu } from "@/components/site/SiteMenu";
import { SITE_LINKS } from "@/components/site/siteLinks";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import type { CorridorKm, Vehicle } from "@/lib/trip";

interface Props {
  /** Phones with a trip: one row, the trip itself in place of the app's name. */
  compact: boolean;
  fromLabel: string;
  toLabel: string;
  vehicle: Vehicle;
  corridorKm: CorridorKm;
  /** The via stops' names, in order ("stop" is kept for the places a rider ticks). */
  viaLabels: string[];
  /** A trip is loaded: the menu offers "New trip". */
  hasTrip: boolean;
  /** The "Edit trip" / "Done" toggle, on phones with a trip. */
  formToggle: { open: boolean; onToggle: () => void } | null;
}

/**
 * The planner's header: the app's name and tagline (or the trip on phones), Near me, and the
 * site's other screens behind "Menu" at every width, so the tagline keeps its room and the
 * screens stay reachable once a trip is loaded.
 */
export function PlannerHeader({
  compact,
  fromLabel,
  toLabel,
  vehicle,
  corridorKm,
  viaLabels,
  hasTrip,
  formToggle,
}: Props) {
  return (
    <header className="flex items-center justify-between gap-2">
      {compact ? (
        <div className="min-w-0">
          <h1 className="sr-only">{SITE_NAME}</h1>
          {/* Short names, and the start gives way first: the destination is the word that
              matters ("Bengaluru → K…" hid it). */}
          <p className="font-display flex min-w-0 text-[17px] font-bold whitespace-nowrap">
            <span className="min-w-0 truncate">{shortPlace(fromLabel)}</span>
            <span aria-hidden className="shrink-0 px-1">
              →
            </span>
            <span className="sr-only"> to </span>
            <span className="max-w-[65%] shrink-0 truncate">{shortPlace(toLabel)}</span>
          </p>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            {vehicle === "bike" ? "Bike" : "Car"} · within {corridorKm} km
            {viaLabels.length > 0 && ` · ${viaLine(viaLabels)}`}
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
        <SiteMenu
          links={SITE_LINKS.filter((l) => l.href !== "/" && l.href !== "/nearby")}
          lead={hasTrip ? { href: `/?v=${vehicle}`, label: "New trip" } : undefined}
        />
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

/** A place's name without its district and state: "Kalasa, Chikkamagaluru" → "Kalasa". */
export function shortPlace(label: string): string {
  return label.split(",")[0]!.trim();
}

/** "via Sakleshpur", "via Hassan, Sakleshpur", or "via 3 towns" when there are more. */
export function viaLine(labels: string[]): string {
  const names = labels.map(shortPlace).filter(Boolean);
  if (names.length === 0) return "";
  return names.length <= 2 ? `via ${names.join(", ")}` : `via ${names.length} towns`;
}
