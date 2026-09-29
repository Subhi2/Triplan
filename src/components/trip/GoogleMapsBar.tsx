"use client";

import { MAX_GOOGLE_WAYPOINTS, type GoogleMapsTrip } from "@/lib/googleMaps";

interface Props {
  trip: GoogleMapsTrip;
  pickedCount: number;
  onClear: () => void;
}

/**
 * Stays at the bottom of the panel: opens the trip in Google Maps, ready to navigate, with its
 * via stops and the ticked places as stops in route order. -bottom-4 undoes the panel padding.
 */
export function GoogleMapsBar({ trip, pickedCount, onClear }: Props) {
  const tooMany = trip.url === null && trip.waypointCount > MAX_GOOGLE_WAYPOINTS;
  return (
    <div
      role="region"
      aria-label="Google Maps"
      className="sticky -bottom-4 z-10 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-200 bg-(--background) px-4 py-2 text-sm dark:border-stone-800"
    >
      <span className="min-w-0 flex-1 text-stone-600 dark:text-stone-400">
        {pickedCount === 0 ? (
          "Tick places to add them as stops"
        ) : (
          <>
            {pickedCount} place{pickedCount > 1 ? "s" : ""} ticked ·{" "}
            <button type="button" onClick={onClear} className="text-brand hover:underline">
              Clear
            </button>
          </>
        )}
        {tooMany && (
          <span className="block text-amber-800 dark:text-amber-400">
            Google Maps takes up to {MAX_GOOGLE_WAYPOINTS} stops; this has {trip.waypointCount}.
          </span>
        )}
      </span>
      {trip.url ? (
        <a
          href={trip.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-brand hover:bg-brand-dark rounded-md px-3 py-1.5 font-medium whitespace-nowrap text-white"
        >
          Open in Google Maps
        </a>
      ) : (
        <span
          aria-disabled
          className="bg-brand cursor-not-allowed rounded-md px-3 py-1.5 font-medium whitespace-nowrap text-white opacity-50"
        >
          Open in Google Maps
        </span>
      )}
    </div>
  );
}
