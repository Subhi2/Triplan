"use client";

import { RIDE_LISTS, rideInList, type ListRide, type RideListKey } from "@/lib/rideLists";

const chip =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm whitespace-nowrap md:min-h-9";
const chipOn = "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900";
const chipOff = "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700";

/**
 * The curated lists (Himalaya, High passes...) as chips, each with how many of `rides` it holds.
 * Tapping the chosen one again clears it. A list with no rides is not shown.
 */
export function RideListChips({
  rides,
  value,
  onChange,
}: {
  rides: ListRide[];
  value: RideListKey | null;
  onChange: (key: RideListKey | null) => void;
}) {
  const lists = RIDE_LISTS.map((l) => ({
    ...l,
    count: rides.filter((r) => rideInList(r, l.key)).length,
  })).filter((l) => l.count > 0);
  if (lists.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Curated lists">
      {lists.map((l) => (
        <button
          key={l.key}
          type="button"
          aria-pressed={value === l.key}
          title={l.about}
          onClick={() => onChange(value === l.key ? null : l.key)}
          className={`${chip} ${value === l.key ? chipOn : chipOff}`}
        >
          {l.label} <span className="tabular ml-1 font-mono text-xs opacity-70">{l.count}</span>
        </button>
      ))}
    </div>
  );
}
