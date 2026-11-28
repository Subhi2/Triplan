"use client";

import { formatDuration } from "@/lib/format";
import { MAX_GOOGLE_WAYPOINTS, type GoogleMapsTrip } from "@/lib/googleMaps";
import { trackEvent } from "@/lib/track";

interface Props {
  trip: GoogleMapsTrip;
  pickedCount: number;
  /** Riding plus the ticked stops' detours and visits, in minutes; null without a route. */
  totalMin: number | null;
  onClear: () => void;
  /** Downloads the trip as a GPX file, for OsmAnd, Organic Maps and GPS units. */
  onDownloadGpx: () => void;
  /** The printable road book for the picked route (G10), or null without one. */
  bookHref?: string | null;
}

/**
 * Stays at the bottom of the panel: opens the trip in Google Maps, ready to navigate, with its
 * via stops and the ticked places as stops in route order, or downloads it as GPX. It sits flush
 * with the bottom of whichever panel holds it (`panel-foot`, from the panel's --panel-pb).
 */
export function GoogleMapsBar({
  trip,
  pickedCount,
  totalMin,
  onClear,
  onDownloadGpx,
  bookHref = null,
}: Props) {
  const tooMany = trip.url === null && trip.waypointCount > MAX_GOOGLE_WAYPOINTS;
  return (
    <div
      role="region"
      aria-label="Google Maps"
      className="panel-foot panel-bleed z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-200 bg-(--surface) pt-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-sm dark:border-stone-800"
    >
      {/* Its own row above the buttons: the panel is narrow even on desktop (about 24rem). */}
      <span className="min-w-0 basis-full text-stone-600 dark:text-stone-400">
        {pickedCount === 0 ? (
          "Tick places as stops"
        ) : (
          <>
            {/* "places ticked", not "stops": the Google Maps button also counts the via towns. */}
            <span className="font-bold text-stone-900 dark:text-stone-100">
              {pickedCount} {pickedCount === 1 ? "place" : "places"} ticked
            </span>
            {totalMin !== null && (
              <>
                {" "}
                · about <span className="tabular font-mono">{formatDuration(totalMin)}</span> with
                visits
              </>
            )}{" "}
            ·{" "}
            <button
              type="button"
              onClick={onClear}
              className="text-brand-dark -my-3 inline-flex min-h-11 items-center font-bold hover:underline md:my-0 md:min-h-0 dark:text-teal-300"
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
        onClick={() => {
          trackEvent("gpx");
          onDownloadGpx();
        }}
        aria-label="Download GPX file"
        title="Download the route, stops and places as a GPX file, for OsmAnd, Organic Maps and GPS units"
        className="inline-flex min-h-12 items-center rounded-xl border border-stone-300 bg-(--surface) px-4 font-bold whitespace-nowrap hover:border-stone-500 md:min-h-10 dark:border-stone-700"
      >
        GPX
      </button>
      {bookHref && (
        <a
          href={bookHref}
          target="_blank"
          rel="noopener"
          title="A printable road book: stops, fuel, road rules, helplines and what to pack"
          className="inline-flex min-h-12 items-center rounded-xl border border-stone-300 bg-(--surface) px-4 font-bold whitespace-nowrap hover:border-stone-500 md:min-h-10 dark:border-stone-700"
        >
          Print
        </a>
      )}
      {trip.url ? (
        <a
          href={trip.url}
          onClick={() => trackEvent("google_maps")}
          target="_blank"
          rel="noopener noreferrer"
          className="lift bg-brand hover:bg-brand-dark inline-flex min-h-12 items-center rounded-xl px-4 font-bold whitespace-nowrap text-white shadow-sm md:min-h-10"
        >
          Open in Google Maps
          {trip.waypointCount > 0 && (
            <span className="tabular ml-1 font-mono text-xs font-semibold opacity-90">
              · {trip.waypointCount} stop{trip.waypointCount === 1 ? "" : "s"}
            </span>
          )}
        </a>
      ) : (
        <span
          aria-disabled
          className="bg-brand inline-flex min-h-12 cursor-not-allowed items-center rounded-xl px-4 font-bold whitespace-nowrap text-white opacity-50 md:min-h-10"
        >
          Open in Google Maps
        </span>
      )}
    </div>
  );
}
