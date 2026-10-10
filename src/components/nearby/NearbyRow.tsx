"use client";

import { categoryStyle } from "@/lib/categories";
import { formatDuration, formatKm } from "@/lib/format";
import { googleEnabled } from "@/lib/google";
import { placeGoogleMapsHref } from "@/lib/googleMaps";
import { bestTimeSummary, isInSeason } from "@/lib/months";
import { formatRideShort, type PlaceNear } from "@/lib/nearby";
import type { Vehicle } from "@/lib/trip";

interface Props {
  place: PlaceNear;
  vehicle: Vehicle;
  /** This month (1–12), for the "In season" badge. */
  month: number;
  /** Position in the list, to stagger the rows as they appear. */
  index: number;
  active: boolean;
  highlighted: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}

export function nearbyRowId(placeId: string) {
  return `nearby-row-${placeId}`;
}

/** Rows after this many appear together: a long stagger would feel slow. */
const STAGGERED_ROWS = 10;

/**
 * A place near the rider, led by the ride time in mono (docs/08, "Near me"): the time is what
 * decides whether to go. Without road times it leads with the straight-line km instead.
 */
export function NearbyRow(props: Props) {
  const { place, vehicle, active, highlighted, onSelect, onHover } = props;
  const cat = categoryStyle(place.category);
  const time = place.rideMin !== null ? formatRideShort(place.rideMin) : null;
  const verb = vehicle === "bike" ? "ride" : "drive";
  const inSeason = isInSeason(place.bestMonths, props.month);
  const distance =
    place.roadKm !== null
      ? `${formatKm(place.roadKm * 1000)} by road`
      : `${formatKm(place.distanceKm * 1000)} away`;

  return (
    <li
      id={nearbyRowId(place.id)}
      // The facts the end-to-end tests read, independent of the layout.
      data-name={place.name}
      data-category={cat.name}
      data-ride-min={place.rideMin !== null ? Math.round(place.rideMin) : undefined}
      data-km={(place.roadKm ?? place.distanceKm).toFixed(1)}
      data-in-season={inSeason || undefined}
      data-nearby-row
      className={`animate-rise crown crown-rail flex items-stretch border-b border-stone-200/70 last:border-b-0 dark:border-stone-800 ${
        active
          ? "bg-brand-tint dark:bg-teal-950/60"
          : highlighted
            ? "bg-stone-100 dark:bg-stone-800/60"
            : ""
      }`}
      style={{ animationDelay: `${Math.min(props.index, STAGGERED_ROWS) * 40}ms` }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          aria-current={active || undefined}
          onClick={onSelect}
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
          onFocus={() => onHover(true)}
          onBlur={() => onHover(false)}
          className="flex w-full items-center gap-3 py-3 pr-1 pl-1 text-left active:scale-[0.99]"
        >
          <span aria-hidden className="flex w-14 shrink-0 flex-col">
            <span className="font-mono text-[10px] tracking-widest text-stone-600 dark:text-stone-400">
              {time ? time.unit : "KM"}
            </span>
            <span className="tabular font-mono text-xl leading-tight font-semibold">
              {time ? time.value : Math.round(place.distanceKm)}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="leading-snug font-bold">{place.name}</span>
            {place.rideMin !== null && (
              <span className="sr-only">
                {formatDuration(place.rideMin)} {verb},
              </span>
            )}
            <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-stone-600 dark:text-stone-400">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <span>{cat.name}</span>
              <span aria-hidden>·</span>
              <span className="tabular font-mono text-xs">{distance}</span>
              {inSeason && (
                <span className="bg-brand-tint text-brand-dark rounded-full px-2 text-xs font-bold dark:bg-teal-950 dark:text-teal-200">
                  In season
                </span>
              )}
              {place.trending && (
                <span className="text-ghat-dark rounded-full bg-orange-100 px-2 text-xs font-bold dark:bg-orange-950 dark:text-orange-300">
                  Trending
                </span>
              )}
            </span>
            <span className="text-[13px] text-stone-600 dark:text-stone-400">
              {place.rating !== null && (
                <>
                  <span aria-hidden className="text-marigold">
                    ★{" "}
                  </span>
                  <span className="sr-only">Rated </span>
                  {place.rating.toFixed(1)} ({place.ratingCount}) ·{" "}
                </>
              )}
              {bestTimeSummary(place.bestMonths)}
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
              className="h-14 w-14 shrink-0 self-center rounded-xl bg-stone-200 object-cover dark:bg-stone-800"
            />
          )}
        </button>
        {/* Outside the button (a link cannot sit inside one), lined up under the name. */}
        <a
          href={placeGoogleMapsHref(place, googleEnabled)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={`Open ${place.name} in Google Maps`}
          className="text-brand-dark -mt-2 mb-1 ml-18 inline-flex min-h-11 items-center self-start text-xs font-bold hover:underline md:min-h-8 dark:text-teal-300"
        >
          Open in Google Maps ↗
        </a>
      </div>
    </li>
  );
}
