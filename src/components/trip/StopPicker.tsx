"use client";

import { formatDuration } from "@/lib/format";
import { STOP_BUDGETS_MIN, type StopBudgetMin } from "@/lib/pickStops";

interface Props {
  /** The time chosen, or null. */
  budget: StopBudgetMin | null;
  /** What the last pick ticked, for the line under the choices. */
  result: { count: number; minutes: number } | null;
  onPick: (budget: StopBudgetMin | null) => void;
}

const LABELS: Record<StopBudgetMin, string> = {
  30: "30 min",
  60: "1 h",
  120: "2 h",
  240: "Half day",
};

const chip =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm whitespace-nowrap md:min-h-8 md:text-[13px]";
const chipOn = "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900";
const chipOff = "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700";

/**
 * "Time for stops": the rider picks how long they have, and the most worthwhile sights that fit
 * are ticked (src/lib/pickStops.ts), so the GPX and Google Maps take them. A second tap clears it.
 */
export function StopPicker({ budget, result, onPick }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span id="stop-time-label" className="mr-1 text-sm font-bold">
          Time for stops
        </span>
        <div role="group" aria-labelledby="stop-time-label" className="flex flex-wrap gap-1.5">
          {STOP_BUDGETS_MIN.map((b) => {
            const on = budget === b;
            return (
              <button
                key={b}
                type="button"
                aria-pressed={on}
                onClick={() => onPick(on ? null : b)}
                className={`${chip} ${on ? chipOn : chipOff}`}
              >
                {LABELS[b]}
              </button>
            );
          })}
        </div>
      </div>
      {budget !== null && result && (
        <p role="status" className="text-xs text-stone-600 dark:text-stone-400">
          {result.count === 0
            ? `No sight near the road fits in ${LABELS[budget]}.`
            : `Ticked the ${result.count === 1 ? "best stop" : `${result.count} best stops`} for ${LABELS[budget]}: about ${formatDuration(result.minutes)} with detours and visits.`}
        </p>
      )}
    </div>
  );
}
