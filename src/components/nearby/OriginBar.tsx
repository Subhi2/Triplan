"use client";

import { useState } from "react";
import { CrosshairIcon } from "@/components/geo/CrosshairIcon";
import type { LocateState } from "@/components/geo/useLocate";
import { StopInput, type MapBias } from "@/components/trip/StopInput";
import type { GeocodeResult } from "@/lib/trip";

interface Props {
  /** The name of the point searched around, or null before one is chosen. */
  originName: string | null;
  locate: LocateState;
  /** Choosing a new point (the chooser is open while there is no point, or after "Change"). */
  choosing: boolean;
  picking: boolean;
  near: MapBias;
  onLocate: () => void;
  onPickPlace: (r: GeocodeResult) => void;
  onStartPicking: () => void;
  onCancelPicking: () => void;
  onChange: () => void;
  onCancelChange: () => void;
}

/**
 * Where to search around: the rider's position (asked for only on this tap), a typed place, or a
 * spot tapped on the map. Once chosen it folds to one line with "Change".
 */
export function OriginBar(props: Props) {
  const [text, setText] = useState("");
  const locating = props.locate.status === "locating";

  if (!props.choosing && props.originName) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-stone-600 dark:text-stone-400">Places around</p>
          <p className="font-display truncate text-lg leading-tight font-bold">
            {props.originName}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onChange}
          className="text-brand-dark inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 text-sm font-bold hover:underline dark:text-teal-300"
        >
          Change
        </button>
      </div>
    );
  }

  if (props.picking) {
    return (
      <div className="bg-brand-tint flex items-center justify-between gap-3 rounded-xl px-3 py-2 dark:bg-teal-950/60">
        <p className="text-brand-dark text-sm font-bold dark:text-teal-200">
          Tap the map to search around that spot.
        </p>
        <button
          type="button"
          onClick={props.onCancelPicking}
          className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 text-sm font-bold text-stone-700 hover:underline dark:text-stone-300"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={props.onLocate}
        disabled={locating}
        className="bg-brand hover:bg-brand-dark inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-bold text-white shadow-sm active:scale-[0.97] disabled:opacity-80 md:min-h-11"
      >
        {locating ? (
          <span
            aria-hidden
            className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
          />
        ) : (
          <CrosshairIcon />
        )}
        {locating ? "Finding you…" : "Use my location"}
      </button>
      {props.locate.status === "error" && (
        <p role="status" className="text-ghat-dark text-sm dark:text-orange-300">
          {props.locate.message}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-stone-500">
        <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
        or
        <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
      </div>
      <StopInput
        label="Search around a place"
        placeholder="Type a place, e.g. Sakleshpur"
        value={text}
        resolved={false}
        near={props.near}
        onText={setText}
        onPick={(r) => {
          setText("");
          props.onPickPlace(r);
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={props.onStartPicking}
          className="text-brand-dark inline-flex min-h-11 items-center gap-1.5 text-sm font-bold hover:underline dark:text-teal-300"
        >
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          Pick a spot on the map
        </button>
        {props.originName && (
          <button
            type="button"
            onClick={props.onCancelChange}
            className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-stone-600 hover:underline dark:text-stone-400"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
