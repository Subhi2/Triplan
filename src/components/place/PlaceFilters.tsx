"use client";

import { useState } from "react";
import { categoryStyle, CATEGORIES, isCategorySlug } from "@/lib/categories";
import { DETOUR_LIMITS_KM, LIST_MIXES, type ListMix } from "@/lib/places";
import type { DetourLimitKm } from "@/lib/tripUrl";
import { chipOff, chipOn } from "@/components/ui/chips";

interface Props {
  counts: [category: string, count: number][]; // categories present on this route
  bestCount: number; // places in the default "best stops" list
  selected: string[]; // empty = all
  maxDetourKm: DetourLimitKm | null;
  /** Popular ↔ Offbeat, for the best-stops list. */
  mix: ListMix;
  onMixChange: (mix: ListMix) => void;
  onSelectedChange: (categories: string[]) => void;
  onMaxDetourChange: (km: DetourLimitKm | null) => void;
}

/** Category chips shown before "More": the most worthwhile on this route. */
export const LEADING_CATEGORIES = 4;

const chip =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap md:min-h-8 md:text-[13px]";

const MIX_LABELS: Record<ListMix, string> = {
  popular: "Popular",
  mixed: "Mixed",
  offbeat: "Offbeat",
};

const weight = (category: string) => (isCategorySlug(category) ? CATEGORIES[category].weight : 0);

/**
 * Splits a route's categories into the chips shown first (the most worthwhile: category weight,
 * then how many there are, plus any picked) and the rest behind "More" (alphabetical).
 */
export function splitCategories(
  counts: [string, number][],
  selected: string[],
): { leading: [string, number][]; rest: [string, number][] } {
  const ranked = [...counts].sort(([a, na], [b, nb]) => weight(b) - weight(a) || nb - na);
  const lead = new Set(ranked.slice(0, LEADING_CATEGORIES).map(([c]) => c));
  for (const c of selected) lead.add(c);
  return {
    leading: ranked.filter(([c]) => lead.has(c)),
    rest: counts.filter(([c]) => !lead.has(c)),
  };
}

export function PlaceFilters(props: Props) {
  const { counts, selected } = props;
  const all = selected.length === 0;
  const { leading, rest } = splitCategories(counts, selected);
  // Filters behind "More" that are on, so the chip can say so and start open.
  const hiddenOn = (props.mix !== "mixed" ? 1 : 0) + (props.maxDetourKm !== null ? 1 : 0);
  const [open, setOpen] = useState(hiddenOn > 0);

  function toggle(category: string) {
    const next = selected.includes(category)
      ? selected.filter((c) => c !== category)
      : [...selected, category];
    props.onSelectedChange(next);
  }

  const categoryChip = ([category, count]: [string, number]) => {
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
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: style.color }}
        />
        {style.name} <span className="tabular font-mono text-xs opacity-70">{count}</span>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      {/* Phones: one row that scrolls sideways, so the places stay in view. Wider: wrap. */}
      <div
        role="group"
        aria-label="Filter by category"
        className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          aria-pressed={all}
          onClick={() => props.onSelectedChange([])}
          className={`${chip} ${all ? chipOn : chipOff}`}
        >
          Best stops <span className="tabular font-mono text-xs opacity-70">{props.bestCount}</span>
        </button>
        {leading.map(categoryChip)}
        {open && rest.map(categoryChip)}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="more-filters"
          onClick={() => setOpen(!open)}
          className={`${chip} border border-dashed border-stone-300 dark:border-stone-600`}
        >
          {open ? "Fewer" : "More"}
          {!open && rest.length > 0 && (
            <span className="tabular font-mono text-xs opacity-70">+{rest.length}</span>
          )}
          {!open && hiddenOn > 0 && <span className="text-xs">· {hiddenOn} on</span>}
        </button>
      </div>

      {open && (
        <div id="more-filters" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {all && (
            <div
              role="group"
              aria-label="Popular or offbeat"
              className="inline-flex rounded-full bg-stone-100 p-0.5 dark:bg-stone-800"
            >
              {LIST_MIXES.map((m) => {
                const on = props.mix === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => props.onMixChange(m)}
                    className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm md:min-h-8 md:text-[13px] ${
                      on
                        ? "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900"
                        : "hover:bg-stone-200 dark:hover:bg-stone-700"
                    }`}
                  >
                    {MIX_LABELS[m]}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <label className="flex min-h-11 items-center gap-2 md:min-h-0">
              <input
                type="checkbox"
                checked={props.maxDetourKm !== null}
                onChange={(e) => props.onMaxDetourChange(e.target.checked ? 2 : null)}
                className="accent-brand h-5 w-5 md:h-4 md:w-4"
              />
              Hide detours over
            </label>
            <select
              aria-label="Maximum detour"
              value={props.maxDetourKm ?? 2}
              disabled={props.maxDetourKm === null}
              onChange={(e) => props.onMaxDetourChange(Number(e.target.value) as DetourLimitKm)}
              className="min-h-11 rounded-lg border border-stone-300 bg-(--surface) px-2 text-base disabled:opacity-50 md:min-h-0 md:py-0.5 md:text-sm dark:border-stone-700"
            >
              {DETOUR_LIMITS_KM.map((km) => (
                <option key={km} value={km}>
                  {km} km
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
