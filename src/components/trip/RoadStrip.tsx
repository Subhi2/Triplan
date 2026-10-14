"use client";

import type { PlannedBreak } from "@/lib/breaks";
import { categoryStyle } from "@/lib/categories";
import type { PlaceAlong } from "@/lib/places";
import type { RouteOption } from "@/lib/trip";

interface Props {
  route: RouteOption;
  places: PlaceAlong[];
  activePlaceId: string | null;
  hoverPlaceId: string | null;
  /** Where each night of a multi-day split falls, with the town's name if there is one. */
  nights?: { km: number; name: string | null }[];
  /** Suggested breaks, drawn as cups. A tap ticks the stop. */
  breaks?: PlannedBreak<PlaceAlong>[];
  pickedIds?: ReadonlySet<string>;
  onBreakToggle?: (place: PlaceAlong) => void;
}

/** Round km marks for the strip's scale: start, one or two in between, end. */
export function stripMarks(totalKm: number): number[] {
  const end = Math.round(totalKm);
  if (end <= 0) return [0];
  const step = [10, 20, 25, 50, 100, 200, 250, 500].find((s) => end / s <= 3.5) ?? 1000;
  const marks = [0];
  for (let km = step; km < end - step * 0.4; km += step) marks.push(km);
  marks.push(end);
  return marks;
}

const pct = (x: number) => `${Math.min(100, Math.max(0, x * 100))}%`;

/**
 * The road as one ribbon from start to destination: ghat stretches in their colour and each place
 * as a dot at its km, so the list below reads like the road itself (docs/08-design.md).
 */
export function RoadStrip({
  route,
  places,
  activePlaceId,
  hoverPlaceId,
  nights = [],
  breaks = [],
  pickedIds,
  onBreakToggle,
}: Props) {
  const totalKm = route.distanceKm;
  if (totalKm <= 0) return null;
  const ghats = route.roadMix?.ghats ?? [];
  const ghatKm = ghats.map(
    ([a, b]) => `km ${Math.round(a * totalKm)} to ${Math.round(b * totalKm)}`,
  );
  const label =
    `${Math.round(totalKm)} km` +
    (ghatKm.length > 0 ? `; ghat roads ${ghatKm.join(", ")}` : "") +
    (nights.length > 0
      ? `; nights at ${nights.map((n) => `km ${Math.round(n.km)}${n.name ? ` (${n.name})` : ""}`).join(", ")}`
      : "") +
    (breaks.length > 0
      ? `; breaks at ${breaks.map((b) => `${b.place.name} (km ${Math.round(b.place.kmFromStart)})`).join(", ")}`
      : "") +
    `; ${places.length} places shown`;

  return (
    <figure className="m-0 flex flex-col gap-1.5" aria-label={label}>
      <div className={`relative ${breaks.length > 0 ? "h-11" : "h-7"}`}>
        <div className="bg-brand absolute inset-x-0 top-5 h-1.5 rounded-full" aria-hidden />
        {ghats.map(([a, b]) => (
          <div
            key={a}
            className="bg-ghat absolute top-[1.125rem] h-2.5 rounded-full"
            aria-hidden
            style={{ left: pct(a), width: pct(b - a) }}
          />
        ))}
        {ghats.length > 0 && (
          <span
            className="text-ghat-dark absolute top-0 text-[10px] font-bold tracking-wider dark:text-orange-300"
            aria-hidden
            style={{ left: pct(ghats[0]![0]) }}
          >
            GHAT
          </span>
        )}
        {nights.map((n, i) => (
          <span
            key={i}
            data-night={i + 1}
            className="absolute top-1 h-9 w-0.5 -translate-x-px rounded-full bg-stone-900 dark:bg-stone-100"
            aria-hidden
            style={{ left: pct(n.km / totalKm) }}
          />
        ))}
        {places.map((p) => {
          const on = p.id === activePlaceId || p.id === hoverPlaceId;
          return (
            <span
              key={p.id}
              aria-hidden
              className={`absolute rounded-full transition-transform ${
                on
                  ? "top-3 z-10 h-4 w-4 -translate-x-2 border-[3px] border-stone-900 dark:border-white"
                  : "top-4 h-2.5 w-2.5 -translate-x-[5px] border-2 border-white dark:border-stone-900"
              }`}
              style={{
                left: pct(p.kmFromStart / totalKm),
                backgroundColor: categoryStyle(p.category).color,
              }}
            />
          );
        })}
        {breaks.map((b) => {
          const on = pickedIds?.has(b.place.id) ?? false;
          return (
            <button
              key={b.place.id}
              type="button"
              data-break={b.place.id}
              aria-pressed={on}
              aria-label={`Break at ${b.place.name}, km ${Math.round(b.place.kmFromStart)}`}
              title={`${b.place.name} · a break near ${Math.round(b.markMin / 60)} h`}
              onClick={() => onBreakToggle?.(b.place)}
              className="absolute top-0 z-20 flex h-11 w-11 -translate-x-1/2 items-center justify-center"
              style={{ left: pct(b.place.kmFromStart / totalKm) }}
            >
              <span
                aria-hidden
                className={`h-3.5 w-3.5 rounded-b-full border-2 border-t-0 ${
                  on
                    ? "border-stone-900 bg-stone-900 dark:border-white dark:bg-white"
                    : "border-[#78350f] bg-[#78350f]"
                }`}
              />
            </button>
          );
        })}
      </div>
      <div className="tabular flex justify-between font-mono text-[11px] text-stone-600 dark:text-stone-400">
        {stripMarks(totalKm).map((km) => (
          <span key={km}>{km}</span>
        ))}
      </div>
    </figure>
  );
}
