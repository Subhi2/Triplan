"use client";

import { VehicleToggle } from "@/components/ui/VehicleToggle";
import { REACH_LABELS, REACH_MINUTES, type ReachMinutes } from "@/lib/nearby";
import type { Vehicle } from "@/lib/trip";

interface Props {
  within: ReachMinutes;
  vehicle: Vehicle;
  onWithinChange: (m: ReachMinutes) => void;
  onVehicleChange: (v: Vehicle) => void;
}

const chip =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm whitespace-nowrap md:min-h-9";
const chipOn = "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900";
const chipOff = "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700";

/** How far: 30 min / 1 h / 2 h / Half day on the road, by bike or car. */
export function ReachChips(props: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        role="group"
        aria-label="Within"
        className="-mx-4 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <span className="mr-0.5 text-sm text-stone-600 dark:text-stone-400">Within</span>
        {REACH_MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={props.within === m}
            onClick={() => props.onWithinChange(m)}
            className={`${chip} ${props.within === m ? chipOn : chipOff}`}
          >
            {REACH_LABELS[m]}
          </button>
        ))}
      </div>
      <div className="text-sm">
        <VehicleToggle
          name="nearby-vehicle"
          value={props.vehicle}
          onChange={props.onVehicleChange}
        />
      </div>
    </div>
  );
}
