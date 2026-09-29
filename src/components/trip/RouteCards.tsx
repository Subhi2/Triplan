"use client";

import { formatDuration, formatKm } from "@/lib/format";
import type { RouteOption } from "@/lib/trip";
import { RoadMixBar } from "./RoadMixBar";

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The route options: the picked one raised on a white card, the others quieter. */
export function RouteCards({ routes, selectedId, onSelect }: Props) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Route options">
      {routes.map((r, i) => {
        const selected = r.id === selectedId;
        return (
          <li key={r.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(r.id)}
              className={`w-full rounded-2xl text-left ${
                selected
                  ? "border-brand border-2 bg-(--surface) p-3.5 shadow-sm"
                  : "border border-stone-200 px-3.5 py-3 hover:border-stone-400 hover:bg-(--surface) dark:border-stone-700"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={`font-bold ${selected ? "text-base" : "text-[15px]"}`}>
                  {r.viaLabel}
                </span>
                <span
                  className={`tabular font-mono text-sm font-semibold whitespace-nowrap ${
                    selected ? "" : "text-stone-600 dark:text-stone-300"
                  }`}
                >
                  {formatDuration(r.durationMin)}
                </span>
              </span>
              <span className="mt-1 block text-sm text-stone-600 dark:text-stone-300">
                <span className="tabular font-mono">{formatKm(r.distanceKm * 1000)}</span>
                {r.towns.length > 0 && <> · {r.towns.join(" · ")}</>}
              </span>
              {r.roadMix && <RoadMixBar mix={r.roadMix} compact={!selected} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
