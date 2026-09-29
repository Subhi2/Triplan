"use client";

import { categoryStyle } from "@/lib/categories";
import { googleEnabled } from "@/lib/google";
import { placeGoogleMapsHref } from "@/lib/googleMaps";
import { bestTimeSummary } from "@/lib/months";
import { detourLabel, ON_ROUTE_MAX_KM, type PlaceAlong } from "@/lib/places";

interface Props {
  place: PlaceAlong;
  active: boolean;
  highlighted: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
  /** Ticked to open in Google Maps with the trip. */
  picked: boolean;
  onPickedChange: (picked: boolean) => void;
}

export function placeRowId(placeId: string) {
  return `place-row-${placeId}`;
}

export function PlaceRow(props: Props) {
  const { place, active, highlighted, onSelect, onHover } = props;
  const cat = categoryStyle(place.category);
  const onRoute = place.detourKm <= ON_ROUTE_MAX_KM;

  return (
    <li id={placeRowId(place.id)} className="flex items-start">
      {/* The label is the touch target: 40 × 44 px around a 20 px box. */}
      <label className="-ml-2 flex h-11 w-10 shrink-0 cursor-pointer items-center justify-center md:ml-0 md:w-7">
        <input
          type="checkbox"
          aria-label={`Tick ${place.name} for Google Maps`}
          title="Tick to open in Google Maps with the trip"
          checked={props.picked}
          onChange={(e) => props.onPickedChange(e.target.checked)}
          className="accent-brand h-5 w-5 cursor-pointer md:h-4 md:w-4"
        />
      </label>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          aria-current={active || undefined}
          onClick={onSelect}
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
          onFocus={() => onHover(true)}
          onBlur={() => onHover(false)}
          className={`flex w-full gap-3 rounded-lg px-2 py-2.5 text-left transition ${
            active
              ? "bg-brand/10 ring-brand ring-1"
              : highlighted
                ? "bg-stone-100 dark:bg-stone-800"
                : "hover:bg-stone-100 dark:hover:bg-stone-800"
          }`}
        >
          <span className="w-12 shrink-0 pt-0.5 text-right text-sm font-semibold text-stone-600 tabular-nums md:w-14 dark:text-stone-300">
            {Math.round(place.kmFromStart)} km
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{place.name}</span>
              <span
                className={`shrink-0 text-xs whitespace-nowrap ${
                  onRoute ? "text-brand" : "text-amber-800 dark:text-amber-400"
                }`}
                title={
                  onRoute
                    ? undefined
                    : "Straight-line distance from the route, one way. The road may be longer."
                }
              >
                {detourLabel(place.detourKm)}
              </span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-600 dark:text-stone-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 px-2 py-0.5 dark:border-stone-700">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                {cat.name}
              </span>
              <span>
                {place.rating !== null ? (
                  <>
                    <span aria-hidden>★ </span>
                    <span className="sr-only">Rated </span>
                    {place.rating.toFixed(1)} ({place.ratingCount})
                  </>
                ) : (
                  "No reviews yet"
                )}
              </span>
              <span>{bestTimeSummary(place.bestMonths)}</span>
              {place.trending && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  Trending
                </span>
              )}
            </span>
          </span>
          {place.thumbUrl && (
            // Credit and licence are on the place's details, one tap away (docs/02).
            // eslint-disable-next-line @next/next/no-img-element -- photos come from many hosts
            <img
              src={place.thumbUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-12 w-12 shrink-0 self-center rounded-md bg-stone-200 object-cover md:h-14 md:w-14 dark:bg-stone-800"
            />
          )}
        </button>
        {/* Outside the button (a link cannot sit inside one), lined up under the name. */}
        <a
          href={placeGoogleMapsHref(place, googleEnabled)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={`Open ${place.name} in Google Maps`}
          className="text-brand -mt-2.5 ml-[4.25rem] inline-flex min-h-11 items-center text-xs font-medium hover:underline md:-mt-1 md:mb-1 md:ml-[4.75rem] md:min-h-0"
        >
          Open in Google Maps ↗
        </a>
      </div>
    </li>
  );
}
