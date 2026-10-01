"use client";

import type { RouteCurvature } from "@/lib/curvature";
import { formatDuration, formatKm } from "@/lib/format";
import type { RouteOption } from "@/lib/trip";
import { RoadMixBar } from "./RoadMixBar";

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The route options: the picked one raised on a white card, the others quieter. */
export function RouteCards({ routes, selectedId, onSelect }: Props) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Route options">
      {routes.map((r, i) => {
        const selected = r.id === selectedId;
        return (
          <li key={r.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(r.id)}
              className={`w-full rounded-2xl text-left ${
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
                  {formatDuration(r.durationMin)}
                </span>
              </span>
              <span className="mt-1 block text-sm text-stone-600 dark:text-stone-300">
                <span className="tabular font-mono">{formatKm(r.distanceKm * 1000)}</span>
                {r.towns.length > 0 && <> · {r.towns.join(" · ")}</>}
              </span>
              {r.curvature && <TwistLine curvature={r.curvature} />}
              {r.roadMix && <RoadMixBar mix={r.roadMix} compact={!selected} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** "24 hairpins · 55 km twisty" under the towns; nothing on a road without real bends. */
function TwistLine({ curvature }: { curvature: RouteCurvature }) {
  const { hairpins, twistyKm, label } = curvature;
  if (hairpins === 0 && twistyKm < 5) return null;
  return (
    <span
      className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm"
      data-hairpins={hairpins}
      title={`${label}: bends worked out from the road's shape (approximate)`}
    >
      {hairpins > 0 && (
        <span className="text-ghat-dark inline-flex items-center gap-1 font-bold dark:text-orange-300">
          <HairpinIcon />
          <span className="tabular font-mono">{hairpins}</span>{" "}
          {hairpins === 1 ? "hairpin" : "hairpins"}
        </span>
      )}
      {twistyKm >= 5 && (
        <span className="text-stone-600 dark:text-stone-300">
          {hairpins > 0 && <span aria-hidden>· </span>}
          <span className="tabular font-mono">{formatKm(twistyKm * 1000)}</span> twisty
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
