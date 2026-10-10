"use client";

import { VEHICLES, type Vehicle } from "@/lib/trip";

interface Props {
  value: Vehicle;
  onChange: (v: Vehicle) => void;
  /** The radio group's name; unique per page. */
  name?: string;
}

/** Bike / Car: a stone pill holding the options, the chosen one teal (docs/08, "Segmented control"). */
export function VehicleToggle({ value, onChange, name = "vehicle" }: Props) {
  return (
    <fieldset className="flex items-center rounded-full bg-stone-100 p-1 dark:bg-stone-800">
      <legend className="sr-only">Vehicle</legend>
      {VEHICLES.map((v) => (
        <label
          key={v}
          className={`has-[:focus-visible]:ring-brand inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 font-bold capitalize transition-colors has-[:focus-visible]:ring-2 md:min-h-9 ${
            value === v
              ? "bg-brand text-white shadow-sm"
              : "text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
            className="sr-only"
          />
          {v}
        </label>
      ))}
    </fieldset>
  );
}
