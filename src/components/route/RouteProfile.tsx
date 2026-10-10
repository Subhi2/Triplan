"use client";

import { useState } from "react";
import { elevationAt, type Climb, type ElevationProfile } from "@/lib/elevation";
import { formatKm, formatMetres } from "@/lib/format";
import { TERRAIN_CREDIT_SHORT } from "@/lib/terrain";
import { RetryAlert } from "@/components/ui/RetryAlert";
import { ElevationChart, niceStep } from "./ElevationChart";
import type { ProfileState } from "./useRouteProfiles";

interface Props {
  state: ProfileState | undefined;
  ghats: [number, number][];
  cursorKm: number | null;
  onCursorChange: (km: number | null) => void;
  markKm?: number | null;
}

/** "853 m up in 16.0 km · 5.3% · to Valparai". */
export function climbSummary(c: Climb): string {
  const town = c.near ? ` · ${c.dir === "up" ? "to" : "into"} ${c.near}` : "";
  return `${formatMetres(c.gainM)} ${c.dir} in ${formatKm((c.toKm - c.fromKm) * 1000)} · ${c.gradePct}%${town}`;
}

/** The selected route's ups and downs: totals, the chart, the big climbs, a table of heights. */
export function RouteProfile({ state, ghats, cursorKm, onCursorChange, markKm }: Props) {
  if (!state || state.status === "none") return null;
  if (state.status === "error") {
    return state.retry ? (
      <RetryAlert quiet message="Could not load the ups and downs." onRetry={state.retry} />
    ) : null;
  }
  return (
    <section aria-labelledby="profile-heading" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="profile-heading" className="font-display text-[17px] font-bold tracking-tight">
          Ups and downs
        </h3>
        {state.status === "ok" && <Totals profile={state.profile} />}
      </div>
      {state.status === "loading" ? (
        <div aria-hidden className="shimmer h-[150px] rounded-xl" />
      ) : (
        <>
          <ElevationChart
            profile={state.profile}
            ghats={ghats}
            cursorKm={cursorKm}
            onCursorChange={onCursorChange}
            markKm={markKm}
          />
          {ghats.length > 0 && (
            <p className="flex items-center gap-3 text-xs text-stone-600 dark:text-stone-400">
              <Key color="var(--chart-road)" label="Road" />
              <Key color="var(--chart-ghat)" label="Ghat" />
              <span>km along the route · height in m</span>
            </p>
          )}
          <Climbs profile={state.profile} onShow={onCursorChange} />
          <HeightTable profile={state.profile} />
        </>
      )}
    </section>
  );
}

function Totals({ profile }: { profile: ElevationProfile }) {
  return (
    <p className="tabular font-mono text-xs whitespace-nowrap text-stone-600 dark:text-stone-400">
      <span title="Total climb">↑ {formatMetres(profile.ascentM)}</span>
      {"  "}
      <span title="Total descent">↓ {formatMetres(profile.descentM)}</span>
    </p>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className="inline-block h-0.5 w-3.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function Climbs({ profile, onShow }: { profile: ElevationProfile; onShow: (km: number) => void }) {
  if (profile.climbs.length === 0) {
    return (
      <p className="text-sm text-stone-600 dark:text-stone-400">
        No long climbs: highest point {formatMetres(profile.highest.m)} at km {profile.highest.km}.
      </p>
    );
  }
  return (
    <ul className="flex flex-col" aria-label="Big climbs and descents">
      {profile.climbs.map((c) => (
        <li key={`${c.dir}${c.fromKm}`}>
          <button
            type="button"
            onClick={() => onShow(c.dir === "up" ? c.toKm : c.fromKm)}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-sm hover:bg-stone-100 md:min-h-9 dark:hover:bg-stone-800"
          >
            <span
              aria-hidden
              className={`font-bold ${c.dir === "up" ? "text-ghat-dark dark:text-orange-300" : "text-brand-dark dark:text-teal-300"}`}
            >
              {c.dir === "up" ? "↑" : "↓"}
            </span>
            <span className="min-w-0 flex-1">{climbSummary(c)}</span>
            <span className="tabular shrink-0 font-mono text-xs text-stone-600 dark:text-stone-400">
              km {Math.round(c.fromKm)}–{Math.round(c.toKm)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The chart as text: heights at round km, for screen readers and anyone who wants numbers. */
function HeightTable({ profile }: { profile: ElevationProfile }) {
  const [open, setOpen] = useState(false);
  const totalKm = profile.points.at(-1)![0];
  const step = niceStep(totalKm, 12);
  const rows: [number, number][] = [];
  for (let km = 0; km <= totalKm; km += step) rows.push([km, elevationAt(profile, km)]);
  if (rows.at(-1)![0] < totalKm)
    rows.push([Math.round(totalKm * 10) / 10, profile.points.at(-1)![1]]);
  return (
    <details
      className="text-sm"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs text-stone-600 hover:underline md:min-h-0 dark:text-stone-400">
        Heights every {step} km · {TERRAIN_CREDIT_SHORT}
      </summary>
      {open && (
        <table className="mt-1 w-full max-w-xs text-left">
          <thead>
            <tr className="text-xs text-stone-600 dark:text-stone-400">
              <th className="py-1 font-normal">km</th>
              <th className="py-1 text-right font-normal">Height</th>
            </tr>
          </thead>
          <tbody className="tabular font-mono">
            {rows.map(([km, m]) => (
              <tr key={km} className="border-t border-stone-200 dark:border-stone-800">
                <td className="py-0.5">{km}</td>
                <td className="py-0.5 text-right">{formatMetres(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}
