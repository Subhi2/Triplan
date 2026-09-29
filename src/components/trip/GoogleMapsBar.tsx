"use client";

import { MAX_GOOGLE_WAYPOINTS, type GoogleMapsTrip } from "@/lib/googleMaps";

interface Props {
  trip: GoogleMapsTrip;
  pickedCount: number;
  onClear: () => void;
  /** Downloads the trip as a GPX file, for OsmAnd, Organic Maps and GPS units. */
  onDownloadGpx: () => void;
}

/**
 * Stays at the bottom of the panel: opens the trip in Google Maps, ready to navigate, with its
 * via stops and the ticked places as stops in route order, or downloads it as GPX. The negative
 * bottom undoes the panel padding (and the safe area below it on phones).
 */
export function GoogleMapsBar({ trip, pickedCount, onClear, onDownloadGpx }: Props) {
  const tooMany = trip.url === null && trip.waypointCount > MAX_GOOGLE_WAYPOINTS;
  return (
    <div
      role="region"
      aria-label="Google Maps"
      className="sticky bottom-[calc(-1rem-env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-200 bg-(--background) px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-sm dark:border-stone-800"
    >
      <span className="min-w-0 flex-1 text-stone-600 dark:text-stone-400">
        {pickedCount === 0 ? (
          "Tick places as stops"
        ) : (
          <>
            {pickedCount} ticked ·{" "}
            <button
              type="button"
              onClick={onClear}
              className="text-brand -my-3 inline-flex min-h-11 items-center hover:underline md:my-0 md:min-h-0"
            >
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
      <button
        type="button"
        onClick={onDownloadGpx}
        aria-label="Download GPX file"
        title="Download the route, stops and places as a GPX file, for OsmAnd, Organic Maps and GPS units"
        className="inline-flex min-h-11 items-center rounded-md border border-stone-300 px-3 font-medium whitespace-nowrap hover:border-stone-500 md:min-h-0 md:py-1.5 dark:border-stone-700"
      >
        GPX
      </button>
      {trip.url ? (
        <a
          href={trip.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-brand hover:bg-brand-dark inline-flex min-h-11 items-center rounded-md px-3 font-medium whitespace-nowrap text-white md:min-h-0 md:py-1.5"
        >
          Open in Google Maps
        </a>
      ) : (
        <span
          aria-disabled
          className="bg-brand inline-flex min-h-11 cursor-not-allowed items-center rounded-md px-3 font-medium whitespace-nowrap text-white opacity-50 md:min-h-0 md:py-1.5"
        >
          Open in Google Maps
        </span>
      )}
    </div>
  );
}
