"use client";

import { categoryStyle } from "@/lib/categories";
import { DETOUR_LIMITS_KM } from "@/lib/places";
import type { DetourLimitKm } from "@/lib/tripUrl";

interface Props {
  counts: [category: string, count: number][]; // categories present on this route
  bestCount: number; // places in the default "best stops" list
  selected: string[]; // empty = all
  maxDetourKm: DetourLimitKm | null;
  onSelectedChange: (categories: string[]) => void;
  onMaxDetourChange: (km: DetourLimitKm | null) => void;
}

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";
const chipOn = "border-brand bg-brand text-white";
const chipOff = "border-stone-300 hover:border-stone-500 dark:border-stone-700";

export function PlaceFilters(props: Props) {
  const { counts, selected } = props;
  const all = selected.length === 0;

  function toggle(category: string) {
    const next = selected.includes(category)
      ? selected.filter((c) => c !== category)
      : [...selected, category];
    props.onSelectedChange(next);
  }

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={all}
          onClick={() => props.onSelectedChange([])}
          className={`${chip} ${all ? chipOn : chipOff}`}
        >
          Best stops <span className="opacity-75">{props.bestCount}</span>
        </button>
        {counts.map(([category, count]) => {
          const on = selected.includes(category);
          const style = categoryStyle(category);
          return (
            <button
              key={category}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(category)}
              className={`${chip} ${on ? chipOn : chipOff}`}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full ring-1 ring-white/60"
                style={{ backgroundColor: style.color }}
              />
              {style.name} <span className="opacity-75">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={props.maxDetourKm !== null}
            onChange={(e) => props.onMaxDetourChange(e.target.checked ? 2 : null)}
            className="accent-brand h-4 w-4"
          />
          Hide detours over
        </label>
        <select
          aria-label="Maximum detour"
          value={props.maxDetourKm ?? 2}
          disabled={props.maxDetourKm === null}
          onChange={(e) => props.onMaxDetourChange(Number(e.target.value) as DetourLimitKm)}
          className="rounded-md border border-stone-300 bg-white px-2 py-0.5 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900"
        >
          {DETOUR_LIMITS_KM.map((km) => (
            <option key={km} value={km}>
              {km} km
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
