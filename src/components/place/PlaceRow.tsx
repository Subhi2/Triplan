"use client";

import { categoryStyle } from "@/lib/categories";
import { googleEnabled } from "@/lib/google";
import { placeGoogleMapsHref } from "@/lib/googleMaps";
import { bestTimeSummary, isInSeason } from "@/lib/months";
import type { ListTurn } from "@/lib/listTurn";
import { detourLabel, ON_ROUTE_MAX_KM, type PlaceAlong } from "@/lib/places";

interface Props {
  place: PlaceAlong;
  /** Position in the list, to stagger the rows as they appear. */
  index: number;
  /** After a switch of route or filter, the rows come in from that side instead of rising. */
  turn?: ListTurn | null;
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

/** Rows after this many appear together: a long stagger would feel slow. */
const STAGGERED_ROWS = 10;

const ENTRANCE = {
  rise: "animate-rise",
  next: "animate-turn-next",
  prev: "animate-turn-prev",
} as const;

/** A place in the list, led by its km marker so the list reads like the road (docs/08-design.md). */
export function PlaceRow(props: Props) {
  const { place, active, highlighted, onSelect, onHover } = props;
  const cat = categoryStyle(place.category);
  const onRoute = place.detourKm <= ON_ROUTE_MAX_KM;
  const km = Math.round(place.kmFromStart);
  const detour = detourLabel(place.detourKm);

  return (
    <li
      id={placeRowId(place.id)}
      // The facts the end-to-end tests read, independent of the layout.
      data-km={km}
      data-name={place.name}
      data-detour={detour}
      data-category={cat.name}
      data-place-row
      className={`${ENTRANCE[props.turn ?? "rise"]} crown crown-rail flex items-stretch border-b border-stone-200/70 last:border-b-0 dark:border-stone-800 ${
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
          <span className="flex w-12 shrink-0 flex-col">
            <span className="font-mono text-[10px] tracking-widest text-stone-600 dark:text-stone-400">
              KM
            </span>
            <span className="tabular font-mono text-xl leading-tight font-semibold">{km}</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="leading-snug font-bold">{place.name}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-stone-600 dark:text-stone-400">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <span>{cat.name}</span>
              <span aria-hidden>·</span>
              <span
                className={
                  onRoute
                    ? "text-brand-dark font-bold dark:text-teal-300"
                    : "text-marigold dark:text-amber-400"
                }
                title={
                  onRoute
                    ? undefined
                    : "Straight-line distance from the route, one way. The road may be longer."
                }
              >
                {detour}
              </span>
              {isInSeason(place.bestMonths, new Date().getMonth() + 1) && (
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
              {bestTimeSummary(place.bestMonths, place.bestMonthsEstimated)}
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
          className="text-brand-dark -mt-2 mb-1 ml-16 inline-flex min-h-11 items-center self-start text-xs font-bold hover:underline md:min-h-8 dark:text-teal-300"
        >
          Open in Google Maps ↗
        </a>
      </div>
      {/* The label is the touch target: 44 × 44 px around a 20 px box. */}
      <label className="flex w-11 shrink-0 cursor-pointer items-center justify-center self-center">
        <input
          type="checkbox"
          aria-label={`Tick ${place.name} for Google Maps`}
          title="Tick to open in Google Maps with the trip"
          checked={props.picked}
          onChange={(e) => props.onPickedChange(e.target.checked)}
          className="accent-brand h-5 w-5 cursor-pointer"
        />
      </label>
    </li>
  );
}
