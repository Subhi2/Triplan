"use client";

import { useEffect, useRef } from "react";
import { useWakeLock } from "@/components/geo/useWakeLock";
import { categoryStyle } from "@/lib/categories";
import { isInSeason } from "@/lib/months";
import { AHEAD_MAX_KM, compassPoint } from "@/lib/rideAhead";
import { useRideAhead } from "./useRideAhead";

interface Props {
  month: number;
  onStop: () => void;
}

/** An arrow turned towards the place, relative to the way the rider is going (up = ahead). */
function TurnArrow({ turnDeg }: { turnDeg: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 40 40"
      className="text-brand h-10 w-10 shrink-0 motion-safe:transition-transform motion-safe:duration-300"
      style={{ transform: `rotate(${Math.round(turnDeg)}deg)` }}
    >
      <circle cx="20" cy="20" r="19" className="fill-brand-tint dark:fill-teal-950" />
      <path d="M20 8 L28 24 L20 20 L12 24 Z" fill="currentColor" />
    </svg>
  );
}

function side(turnDeg: number): string {
  if (Math.abs(turnDeg) < 10) return "straight ahead";
  return turnDeg > 0 ? "ahead on the right" : "ahead on the left";
}

/**
 * "Ahead of you": a full-screen, glanceable list of the well-known places coming up in the
 * direction of travel, with the screen kept on. Large type, no small targets but Stop.
 */
export function RideMode({ month, onStop }: Props) {
  const ride = useRideAhead(true, month);
  const wakeLock = useWakeLock(true);
  const stopButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stopButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onStop();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStop]);

  const on = ride.status === "on" ? ride : null;
  const summary =
    ride.status === "starting"
      ? "Getting your position…"
      : on && on.headingDeg === null
        ? "Start moving to find your direction."
        : on
          ? `Heading ${compassPoint(on.headingDeg!)} · ${on.ahead.length} ${
              on.ahead.length === 1 ? "place" : "places"
            } in the next ${AHEAD_MAX_KM} km`
          : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ride-heading"
      className="animate-rise fixed inset-0 z-40 flex flex-col bg-(--background) px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] md:px-8"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ride-heading" className="font-display text-3xl font-extrabold tracking-tight">
            Ahead of you
          </h2>
          <p aria-live="polite" className="mt-1 text-base text-stone-600 dark:text-stone-400">
            {summary}
          </p>
        </div>
        <button
          ref={stopButton}
          type="button"
          onClick={onStop}
          className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-stone-900 px-6 text-lg font-bold text-white active:scale-[0.97] dark:bg-stone-100 dark:text-stone-900"
        >
          Stop
        </button>
      </header>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        {ride.status === "error" && (
          <p role="alert" className="text-ghat-dark text-lg dark:text-orange-300">
            {ride.message}
          </p>
        )}
        {on?.weakSignal && (
          <p className="bg-marigold-tint mb-3 rounded-xl px-3 py-2 text-sm text-stone-800 dark:bg-amber-950 dark:text-amber-100">
            Weak GPS signal: the list may be behind.
          </p>
        )}
        {on && on.headingDeg !== null && on.loaded && on.ahead.length === 0 && (
          <p className="text-lg text-stone-600 dark:text-stone-400">
            Nothing well-known in the next {AHEAD_MAX_KM} km this way.
          </p>
        )}
        {on && on.ahead.length > 0 && (
          <ol aria-label="Places ahead" className="flex flex-col">
            {on.ahead.map(({ place, distanceKm, turnDeg }) => {
              const cat = categoryStyle(place.category);
              return (
                <li
                  key={place.id}
                  data-name={place.name}
                  className="flex min-h-20 items-center gap-4 border-b border-stone-200 py-3 last:border-b-0 dark:border-stone-800"
                >
                  <TurnArrow turnDeg={turnDeg} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[22px] leading-tight font-bold">{place.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-stone-600 dark:text-stone-400">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name} · {side(turnDeg)}
                      {isInSeason(place.bestMonths, month) && (
                        <span className="bg-brand-tint text-brand-dark rounded-full px-2 text-xs font-bold dark:bg-teal-950 dark:text-teal-200">
                          In season
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="tabular block font-mono text-[28px] leading-none font-semibold">
                      {distanceKm.toFixed(1)}
                    </span>
                    <span className="font-mono text-[10px] tracking-widest text-stone-600 dark:text-stone-400">
                      KM
                    </span>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <footer className="mt-3 space-y-1 text-sm text-stone-600 dark:text-stone-400">
        <p className="font-bold">Glance only; pull over before tapping.</p>
        <p>
          Distances are in a straight line.
          {wakeLock === "unavailable" && " Keep your screen on to follow along."}
        </p>
      </footer>
    </div>
  );
}
