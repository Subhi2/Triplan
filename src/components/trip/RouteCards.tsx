"use client";

import { formatDuration, formatKm } from "@/lib/format";
import type { RouteOption } from "@/lib/trip";

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RouteCards({ routes, selectedId, onSelect }: Props) {
  return (
    <ul className="space-y-2" aria-label="Route options">
      {routes.map((r) => {
        const selected = r.id === selectedId;
        return (
          <li key={r.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(r.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                selected
                  ? "border-brand bg-brand/5 ring-brand ring-1"
                  : "border-stone-200 hover:border-stone-400 dark:border-stone-700"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{r.viaLabel}</span>
                <span className="text-sm whitespace-nowrap text-stone-600 dark:text-stone-300">
                  {formatDuration(r.durationMin)}
                </span>
              </div>
              <div className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                {formatKm(r.distanceKm * 1000)}
                {r.towns.length > 0 && <> · {r.towns.join(" · ")}</>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
