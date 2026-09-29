"use client";

import { MAX_VIA_STOPS } from "@/lib/trip";

/** Where a place stands in the trip: not in it, a via stop, the start or destination. */
export type PlaceInTrip =
  | { kind: "add" }
  | { kind: "full" }
  | { kind: "via"; stopNumber: number }
  | { kind: "start" }
  | { kind: "end" };

interface Props {
  status: PlaceInTrip;
  onAdd: () => void;
  onRemove: () => void;
}

const button =
  "rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

/** "Add to trip" on a place: adds it as a via stop in route order, or removes it again. */
export function AddToTrip({ status, onAdd, onRemove }: Props) {
  switch (status.kind) {
    case "add":
    case "full":
      return (
        <>
          <button
            type="button"
            onClick={onAdd}
            disabled={status.kind === "full"}
            className={`${button} bg-brand hover:bg-brand-dark text-white`}
          >
            Add to trip
          </button>
          {status.kind === "full" && (
            <span className="text-xs text-stone-600 dark:text-stone-400">
              A trip can have up to {MAX_VIA_STOPS} stops.
            </span>
          )}
        </>
      );
    case "via":
      return (
        <>
          <span role="status" className="text-brand text-sm font-medium">
            ✓ In your trip (stop {status.stopNumber})
          </span>
          <button
            type="button"
            onClick={onRemove}
            className={`${button} border border-stone-300 hover:border-stone-500 dark:border-stone-700`}
          >
            Remove from trip
          </button>
        </>
      );
    case "start":
    case "end":
      return (
        <span className="text-brand text-sm font-medium">
          ✓ Your trip&apos;s {status.kind === "start" ? "start" : "destination"}
        </span>
      );
  }
}
