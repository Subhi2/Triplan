"use client";

import { useRef } from "react";
import { CountUp } from "@/components/motion/CountUp";
import { useCrown } from "@/components/motion/useCrown";
import type { RouteCurvature } from "@/lib/curvature";
import type { LngLat } from "@/lib/geo";
import type { RouteOption } from "@/lib/trip";
import { RoadMixBar } from "./RoadMixBar";

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Total climb of each route (from its elevation profile), once loaded. */
  climbM?: Record<string, number>;
  /**
   * Makes a town on the selected route a via stop, so the trip keeps to that road. Left out (or
   * null) when the trip has no room for another stop.
   */
  onRideThrough?: ((town: { name: string; location: LngLat }) => void) | null;
  /** Whether a town is already one of the trip's stops. */
  isStop?: (location: LngLat) => boolean;
}

/**
 * The route options: the picked one raised on a white card, the others quieter. The numbers
 * count up as the cards rise, and the cards lean towards the mouse (docs/08 "Motion").
 */
export function RouteCards({
  routes,
  selectedId,
  onSelect,
  climbM = {},
  onRideThrough = null,
  isStop = () => false,
}: Props) {
  const list = useRef<HTMLUListElement>(null);
  useCrown(list, "[data-route-card]", { axis: "y", radius: 130, lift: 5, shift: 4, grow: 0.012 });
  const picked = routes.find((r) => r.id === selectedId);
  return (
    <>
      <ul ref={list} className="flex flex-col gap-2" aria-label="Route options">
        {routes.map((r, i) => {
          const selected = r.id === selectedId;
          return (
            <li key={r.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <button
                type="button"
                data-route-card
                aria-pressed={selected}
                onClick={() => onSelect(r.id)}
                className={`crown w-full rounded-2xl text-left ${
                  selected
                    ? "border-brand border-2 bg-(--surface) p-3.5 shadow-sm"
                    : "border border-stone-200 px-3.5 py-3 hover:border-stone-400 hover:bg-(--surface) dark:border-stone-700"
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`font-bold ${selected ? "text-base" : "text-[15px]"}`}>
                    {r.viaLabel}
                  </span>
                  <span
                    className={`tabular font-mono text-sm font-semibold whitespace-nowrap ${
                      selected ? "" : "text-stone-600 dark:text-stone-300"
                    }`}
                  >
                    <CountUp value={r.durationMin} unit="duration" delayMs={i * 60} />
                  </span>
                </span>
                <span className="mt-1 block text-sm text-stone-600 dark:text-stone-300">
                  <CountUp
                    value={r.distanceKm}
                    unit="km"
                    delayMs={i * 60}
                    className="tabular font-mono"
                  />
                  {r.towns.length > 0 && <> · {r.towns.join(" · ")}</>}
                </span>
                <RouteFacts curvature={r.curvature} climbM={climbM[r.id]} delayMs={i * 60} />
                {r.roadMix && <RoadMixBar mix={r.roadMix} compact={!selected} />}
              </button>
            </li>
          );
        })}
      </ul>
      {picked && onRideThrough && (
        <RideThrough
          towns={(picked.townStops ?? []).filter((t) => !isStop(t.location))}
          onPick={onRideThrough}
        />
      )}
    </>
  );
}

/**
 * "20 hairpins · 54.6 km twisty · ↑ 1,662 m" under the towns. Hairpins and twisty km only on
 * roads with real bends; the climb once the route's profile has loaded.
 */
function RouteFacts({
  curvature,
  climbM,
  delayMs,
}: {
  curvature: RouteCurvature | null;
  climbM: number | undefined;
  delayMs: number;
}) {
  const hairpins = curvature?.hairpins ?? 0;
  const twistyKm = curvature?.twistyKm ?? 0;
  const showClimb = climbM !== undefined && climbM >= 100;
  if (hairpins === 0 && twistyKm < 5 && !showClimb) return null;
  return (
    <span
      className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm"
      data-hairpins={hairpins}
      title={
        curvature
          ? `${curvature.label}: bends worked out from the road's shape (approximate)`
          : undefined
      }
    >
      {hairpins > 0 && (
        <span className="text-ghat-dark inline-flex items-center gap-1 font-bold dark:text-orange-300">
          <HairpinIcon />
          <CountUp value={hairpins} delayMs={delayMs} className="tabular font-mono" />{" "}
          {hairpins === 1 ? "hairpin" : "hairpins"}
        </span>
      )}
      {twistyKm >= 5 && (
        <span className="text-stone-600 dark:text-stone-300">
          {hairpins > 0 && <span aria-hidden>· </span>}
          <CountUp
            value={twistyKm}
            unit="km"
            delayMs={delayMs}
            className="tabular font-mono"
          />{" "}
          twisty
        </span>
      )}
      {showClimb && (
        <span
          className="text-stone-600 dark:text-stone-300"
          title="Total climb"
          data-climb={climbM}
        >
          {(hairpins > 0 || twistyKm >= 5) && <span aria-hidden>· </span>}
          <span className="tabular font-mono">
            ↑ <CountUp value={climbM} unit="metres" />
          </span>
          <span className="sr-only"> of climbing</span>
        </span>
      )}
    </span>
  );
}

function HairpinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor">
      <path d="M4 15V6a4 4 0 0 1 8 0v9" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** "Ride through: Hassan · Sakleshpur": a tap makes the town a stop and keeps the trip on this road. */
function RideThrough({
  towns,
  onPick,
}: {
  towns: { name: string; location: LngLat }[];
  onPick: (town: { name: string; location: LngLat }) => void;
}) {
  if (towns.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-sm">
      <span className="text-stone-600 dark:text-stone-400">Ride through:</span>
      {towns.map((t) => (
        <button
          key={t.name}
          type="button"
          onClick={() => onPick(t)}
          title={`Add ${t.name} as a stop, so the trip keeps to this road`}
          className="inline-flex min-h-11 items-center rounded-full border border-stone-300 px-3 font-bold hover:border-stone-500 md:min-h-8 dark:border-stone-600"
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}
