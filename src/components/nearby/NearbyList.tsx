"use client";

import { useEffect } from "react";
import { categoryStyle } from "@/lib/categories";
import type { PlaceNear } from "@/lib/nearby";
import type { Vehicle } from "@/lib/trip";
import { NearbyRow, nearbyRowId } from "./NearbyRow";

const chip =
  "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap md:min-h-8 md:text-[13px]";
const chipOn = "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900";
const chipOff = "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700";

interface FiltersProps {
  counts: [category: string, count: number][];
  topCount: number;
  selected: string[]; // empty = the top picks
  onSelectedChange: (categories: string[]) => void;
}

/** "Top picks" or categories, as the planner's filters (docs/08, "Chips"). */
export function NearbyFilters({ counts, topCount, selected, onSelectedChange }: FiltersProps) {
  const top = selected.length === 0;
  return (
    // Phones: one row that scrolls sideways, so the places stay in view. Wider: wrap.
    <div
      role="group"
      aria-label="Filter by category"
      className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        aria-pressed={top}
        onClick={() => onSelectedChange([])}
        className={`${chip} ${top ? chipOn : chipOff}`}
      >
        Top picks <span className="tabular font-mono text-xs opacity-70">{topCount}</span>
      </button>
      {counts.map(([category, count]) => {
        const on = selected.includes(category);
        const style = categoryStyle(category);
        return (
          <button
            key={category}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onSelectedChange(
                on ? selected.filter((c) => c !== category) : [...selected, category],
              )
            }
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
      })}
    </div>
  );
}

interface ListProps {
  places: PlaceNear[]; // already filtered, nearest first
  vehicle: Vehicle;
  month: number;
  activeId: string | null;
  hoverId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function NearbyList(props: ListProps) {
  const { places, vehicle, month, activeId, hoverId, onSelect, onHover } = props;
  // Bring the active place into view, e.g. after its marker was tapped on the map.
  useEffect(() => {
    if (activeId) {
      document
        .getElementById(nearbyRowId(activeId))
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeId]);

  return (
    <ol aria-label="Places near you" className="flex flex-col">
      {places.map((p, i) => (
        <NearbyRow
          key={p.id}
          place={p}
          vehicle={vehicle}
          month={month}
          index={i}
          active={p.id === activeId}
          highlighted={p.id === hoverId}
          onSelect={() => onSelect(p.id)}
          onHover={(h) => onHover(h ? p.id : null)}
        />
      ))}
    </ol>
  );
}
