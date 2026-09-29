"use client";

import { categoryStyle } from "@/lib/categories";
import type { PlaceAlong } from "@/lib/places";
import type { RouteOption } from "@/lib/trip";

interface Props {
  route: RouteOption;
  places: PlaceAlong[];
  activePlaceId: string | null;
  hoverPlaceId: string | null;
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
export function RoadStrip({ route, places, activePlaceId, hoverPlaceId }: Props) {
  const totalKm = route.distanceKm;
  if (totalKm <= 0) return null;
  const ghats = route.roadMix?.ghats ?? [];
  const ghatKm = ghats.map(
    ([a, b]) => `km ${Math.round(a * totalKm)} to ${Math.round(b * totalKm)}`,
  );
  const label =
    `${Math.round(totalKm)} km` +
    (ghatKm.length > 0 ? `; ghat roads ${ghatKm.join(", ")}` : "") +
    `; ${places.length} places shown`;

  return (
    <figure className="m-0 flex flex-col gap-1.5" aria-label={label}>
      <div className="relative h-7" aria-hidden>
        <div className="bg-brand absolute inset-x-0 top-3 h-1.5 rounded-full" />
        {ghats.map(([a, b]) => (
          <div
            key={a}
            className="bg-ghat absolute top-2.5 h-2.5 rounded-full"
            style={{ left: pct(a), width: pct(b - a) }}
          />
        ))}
        {ghats.length > 0 && (
          <span
            className="text-ghat-dark absolute -top-1 text-[10px] font-bold tracking-wider dark:text-orange-300"
            style={{ left: pct(ghats[0]![0]) }}
          >
            GHAT
          </span>
        )}
        {places.map((p) => {
          const on = p.id === activePlaceId || p.id === hoverPlaceId;
          return (
            <span
              key={p.id}
              className={`absolute rounded-full transition-transform ${
                on
                  ? "top-1 z-10 h-4 w-4 -translate-x-2 border-[3px] border-stone-900 dark:border-white"
                  : "top-2 h-2.5 w-2.5 -translate-x-[5px] border-2 border-white dark:border-stone-900"
              }`}
              style={{
                left: pct(p.kmFromStart / totalKm),
                backgroundColor: categoryStyle(p.category).color,
              }}
            />
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
