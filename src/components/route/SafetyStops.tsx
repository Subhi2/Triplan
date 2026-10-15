"use client";

import { useState } from "react";
import { helplines, SAFETY_KINDS, SAFETY_STYLE, telLink, type SafetyKind } from "@/lib/safety";
import { RetryAlert } from "@/components/ui/RetryAlert";
import type { SafetyState } from "./useSafetyAlong";

interface Props {
  state: SafetyState;
  /** The kind whose stops are listed and pinned on the map, or null. */
  selected: SafetyKind | null;
  onSelect: (kind: SafetyKind | null) => void;
  /** National-highway km on the route (its road mix), or null when unknown: 1033 shows with any. */
  nationalKm: number | null;
}

/** Stops listed before "Show all". */
const LISTED = 8;

/** 112, and 1033 on national highways: always there, whatever the stops do. */
function Helplines({ nationalKm }: { nationalKm: number | null }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Helplines">
      {helplines(nationalKm).map((h) => (
        <li key={h.number}>
          <a
            href={`tel:${h.number}`}
            title={h.what}
            className="text-brand-dark inline-flex min-h-11 items-center gap-1.5 rounded-full border border-stone-300 px-3 text-sm hover:bg-stone-100 md:min-h-9 dark:border-stone-600 dark:text-teal-300 dark:hover:bg-stone-800"
          >
            <span className="tabular font-mono font-bold">{h.number}</span>
            <span>{h.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Safety on the way": the helplines, then how many hospitals, police stations, ATMs, puncture
 * and repair shops are near the road, per 50 km. A tap on a kind lists them (with tap to call)
 * and pins them on the map.
 */
export function SafetyStops({ state, selected, onSelect, nationalKm }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (state.status === "idle") return null;
  const heading = (
    <h3 id="safety-heading" className="font-display text-[17px] font-bold tracking-tight">
      Safety on the way
    </h3>
  );
  if (state.status !== "ok") {
    return (
      <section aria-labelledby="safety-heading" className="flex flex-col gap-2">
        {heading}
        <Helplines nationalKm={nationalKm} />
        {state.status === "error" ? (
          <RetryAlert quiet message="Could not load safety stops." onRetry={state.retry} />
        ) : (
          <div aria-hidden className="shimmer h-10 rounded-xl" />
        )}
      </section>
    );
  }
  const { summary } = state;
  const total = SAFETY_KINDS.reduce((n, k) => n + summary.counts[k], 0);
  if (total === 0) {
    return (
      <section aria-labelledby="safety-heading" className="flex flex-col gap-2">
        {heading}
        <Helplines nationalKm={nationalKm} />
        <p className="text-xs text-stone-600 dark:text-stone-400">
          No hospitals, police, ATMs or repair shops are mapped within 3 km of this road.
        </p>
      </section>
    );
  }
  const points = selected ? summary.points.filter((p) => p.kind === selected) : [];
  const shown = showAll ? points : points.slice(0, LISTED);

  return (
    <section aria-labelledby="safety-heading" className="flex flex-col gap-2">
      {heading}
      <Helplines nationalKm={nationalKm} />
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
