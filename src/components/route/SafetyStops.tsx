"use client";

import { useState } from "react";
import { SAFETY_KINDS, SAFETY_STYLE, telLink, type SafetyKind } from "@/lib/safety";
import type { SafetyState } from "./useSafetyAlong";

interface Props {
  state: SafetyState;
  /** The kind whose stops are listed and pinned on the map, or null. */
  selected: SafetyKind | null;
  onSelect: (kind: SafetyKind | null) => void;
}

/** Stops listed before "Show all". */
const LISTED = 8;

/**
 * "Safety on the way": how many hospitals, police stations, ATMs, puncture and repair shops are
 * near the road, per 50 km. A tap on a kind lists them (with tap to call) and pins them on the map.
 */
export function SafetyStops({ state, selected, onSelect }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (state.status === "idle" || state.status === "error") return null;
  if (state.status === "loading") {
    return <div aria-hidden className="shimmer h-10 rounded-xl" />;
  }
  const { summary } = state;
  const total = SAFETY_KINDS.reduce((n, k) => n + summary.counts[k], 0);
  if (total === 0) return null;
  const points = selected ? summary.points.filter((p) => p.kind === selected) : [];
  const shown = showAll ? points : points.slice(0, LISTED);

  return (
    <section aria-labelledby="safety-heading" className="flex flex-col gap-2">
      <h3 id="safety-heading" className="font-display text-[17px] font-bold tracking-tight">
        Safety on the way
      </h3>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kinds of safety stop">
        {SAFETY_KINDS.filter((k) => summary.counts[k] > 0).map((k) => {
          const on = selected === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              data-kind={k}
              title={`${summary.perFiftyKm[k]} per 50 km; longest stretch without one ${Math.round(summary.longestGap[k].km)} km`}
              onClick={() => {
                setShowAll(false);
                onSelect(on ? null : k);
              }}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm md:min-h-9 ${
                on
                  ? "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900"
                  : "bg-stone-100 dark:bg-stone-800"
              }`}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: SAFETY_STYLE[k].color }}
              />
              <span className="tabular font-mono">{summary.counts[k]}</span>{" "}
              {summary.counts[k] === 1 ? SAFETY_STYLE[k].one : SAFETY_STYLE[k].many}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-stone-600 dark:text-stone-400">
            {summary.perFiftyKm[selected]} per 50 km · longest stretch without one{" "}
            {Math.round(summary.longestGap[selected].km)} km (km{" "}
            {Math.round(summary.longestGap[selected].fromKm)}–
            {Math.round(summary.longestGap[selected].toKm)})
          </p>
          <ul
            className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800"
            aria-label={SAFETY_STYLE[selected].many}
          >
            {shown.map((p) => {
              const tel = p.phone ? telLink(p.phone) : null;
              return (
                <li key={p.id} className="flex min-h-11 items-center gap-3 py-1.5 text-sm">
                  <span className="tabular w-14 shrink-0 font-mono text-stone-600 dark:text-stone-400">
                    km {Math.round(p.kmFromStart)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {p.name ?? SAFETY_STYLE[p.kind].one}
                    </span>
                    <span className="text-xs text-stone-600 dark:text-stone-400">
                      {p.detourKm <= 0.5
                        ? "On the road"
                        : `${p.detourKm.toFixed(1)} km off the road`}
                    </span>
                  </span>
                  {tel && (
                    <a
                      href={tel}
                      className="text-brand-dark inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-bold hover:underline md:min-h-0 dark:text-teal-300"
                    >
                      Call
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {points.length > LISTED && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-brand-dark min-h-11 self-start text-sm font-bold hover:underline md:min-h-0 dark:text-teal-300"
            >
              Show {points.length - LISTED} more
            </button>
          )}
          <p className="text-xs text-stone-600 dark:text-stone-400">
            The nearest three every 10 km, from OpenStreetMap, within 3 km of the road; some may be
            missing or closed. In an emergency call 112.
          </p>
        </div>
      )}
    </section>
  );
}
