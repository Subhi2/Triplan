"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { climbAt, elevationAt, type ElevationProfile } from "@/lib/elevation";
import { formatMetres } from "@/lib/format";

interface Props {
  profile: ElevationProfile;
  /** Ghat stretches as [from, to] fractions of the route (RoadMix.ghats). */
  ghats: [number, number][];
  /** Where the scrubber is, in km, or null. */
  cursorKm: number | null;
  onCursorChange: (km: number | null) => void;
  /** A place picked in the list or on the map, shown as a dot at its km. */
  markKm?: number | null;
}

const HEIGHT = 150;
const M = { top: 32, right: 10, bottom: 20, left: 40 };
/** Width of the readout above the crosshair. */
const TIP_W = 188;
const NICE = [1, 2, 2.5, 5, 10];

/** A round step giving about `count` intervals across `range`. */
export function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  return (NICE.find((n) => n * mag >= raw) ?? 10) * mag;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * The route's height along its length: one teal line over a light wash, ghat stretches in the
 * ghat colour, gridlines at round heights, the highest point labelled. A vertical crosshair
 * follows the pointer (or the arrow keys) and reports its km to move a marker on the map.
 */
export function ElevationChart({ profile, ghats, cursorKm, onCursorChange, markKm }: Props) {
  const [box, width] = useWidth<HTMLDivElement>();
  const clipId = useId().replace(/:/g, "");
  const pts = profile.points;
  const totalKm = pts.at(-1)![0];

  // Scales: a little air above and below, at least 300 m tall so a flat road looks flat.
  const span = Math.max(300, profile.highest.m - profile.lowest.m);
  const yStep = niceStep(span, 3);
  const yMin = Math.floor((profile.lowest.m - span * 0.08) / yStep) * yStep;
  const yMax = Math.ceil((profile.highest.m + span * 0.08) / yStep) * yStep;
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (km: number) => M.left + (km / totalKm) * plotW;
  const y = (m: number) => M.top + (1 - (m - yMin) / (yMax - yMin)) * plotH;
  const kmAtX = (px: number) => Math.max(0, Math.min(totalKm, ((px - M.left) / plotW) * totalKm));

  const line = pts
    .map(([k, m], i) => `${i ? "L" : "M"}${x(k).toFixed(1)},${y(m).toFixed(1)}`)
    .join("");
  const area = `${line}L${x(totalKm).toFixed(1)},${y(yMin)}L${x(0).toFixed(1)},${y(yMin)}Z`;
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += yStep) yTicks.push(v);
  const xStep = niceStep(totalKm, Math.max(2, Math.floor(plotW / 70)));
  const xTicks: number[] = [];
  for (let v = 0; v <= totalKm; v += xStep) xTicks.push(v);

  const hi = profile.highest;
  const hiLabelX = Math.max(M.left + 24, Math.min(width - M.right - 24, x(hi.km)));

  function pointerKm(e: PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    onCursorChange(Math.round(kmAtX(e.clientX - rect.left) * 10) / 10);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = Math.max(0.1, totalKm / (e.shiftKey ? 10 : 100));
    const at = cursorKm ?? 0;
    const next: Record<string, number> = {
      ArrowRight: at + step,
      ArrowUp: at + step,
      ArrowLeft: at - step,
      ArrowDown: at - step,
      Home: 0,
      End: totalKm,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    onCursorChange(Math.round(Math.max(0, Math.min(totalKm, next[e.key]!)) * 10) / 10);
  }

  const cursorM = cursorKm === null ? null : elevationAt(profile, cursorKm);
  const cursorClimb = cursorKm === null ? null : climbAt(profile, cursorKm);
  const valueText =
    cursorKm === null || cursorM === null
      ? `Highest ${formatMetres(hi.m)} at km ${hi.km}`
      : `km ${cursorKm.toFixed(1)}, ${formatMetres(cursorM)}`;

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Height along the route"
      aria-valuemin={0}
      aria-valuemax={Math.round(totalKm)}
      aria-valuenow={Math.round(cursorKm ?? 0)}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        // Keyboard focus starts the scrubber; a click has already placed it.
        if (cursorKm === null && e.currentTarget.matches(":focus-visible")) onCursorChange(0);
      }}
      onBlur={() => onCursorChange(null)}
      className="focus-visible:ring-brand relative rounded-xl outline-none focus-visible:ring-3"
    >
      <svg width={width} height={HEIGHT} className="block" aria-hidden>
        <defs>
          <clipPath id={clipId}>
            {ghats.map(([a, b], i) => (
              <rect
                key={i}
                x={x(a * totalKm)}
                y={0}
                width={Math.max(1, x(b * totalKm) - x(a * totalKm))}
                height={HEIGHT}
              />
            ))}
          </clipPath>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={M.left}
              x2={width - M.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
            <text
              x={M.left - 6}
              y={y(v) + 4}
              textAnchor="end"
              className="tabular fill-stone-600 font-mono text-[11px] dark:fill-stone-400"
            >
              {v.toLocaleString("en-IN")}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text
            key={v}
            x={x(v)}
            y={HEIGHT - 5}
            textAnchor={v === 0 ? "start" : "middle"}
            className="tabular fill-stone-600 font-mono text-[11px] dark:fill-stone-400"
          >
            {v}
          </text>
        ))}
        <path d={area} fill="var(--chart-road)" fillOpacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke="var(--chart-road)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {ghats.length > 0 && (
          <g clipPath={`url(#${clipId})`}>
            <path d={area} fill="var(--chart-ghat)" fillOpacity={0.12} />
            <path
              d={line}
              fill="none"
              stroke="var(--chart-ghat)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        )}
        {/* The highest point: the one value labelled on the chart. */}
        <circle
          cx={x(hi.km)}
          cy={y(hi.m)}
          r={4}
          fill="var(--chart-road)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
        <text
          x={hiLabelX}
          y={y(hi.m) - 8}
          textAnchor="middle"
          className="tabular fill-stone-700 font-mono text-[11px] font-semibold dark:fill-stone-300"
        >
          {formatMetres(hi.m)}
        </text>
        {markKm != null && markKm >= 0 && markKm <= totalKm && (
          <circle
            cx={x(markKm)}
            cy={y(elevationAt(profile, markKm))}
            r={5}
            className="fill-stone-900 dark:fill-stone-100"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}
        {cursorKm !== null && cursorM !== null && (
          <g>
            <line
              x1={x(cursorKm)}
              x2={x(cursorKm)}
              y1={M.top - 6}
              y2={y(yMin)}
              className="stroke-stone-500"
              strokeWidth={1}
            />
            <circle
              cx={x(cursorKm)}
              cy={y(cursorM)}
              r={4}
              className="fill-stone-900 dark:fill-stone-100"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
        )}
        <rect
          x={M.left}
          y={0}
          width={plotW}
          height={HEIGHT}
          fill="transparent"
          style={{ touchAction: "pan-y", cursor: "crosshair" }}
          onPointerDown={pointerKm}
          onPointerMove={pointerKm}
          onPointerLeave={(e) => e.pointerType === "mouse" && onCursorChange(null)}
        />
      </svg>
      {cursorKm !== null && cursorM !== null && (
        // One line in the chart's top margin, centred on the crosshair and kept inside the chart.
        <div
          className="pointer-events-none absolute top-0 flex h-6 items-center gap-1.5 rounded-full border border-stone-200 bg-(--surface) px-2.5 text-xs whitespace-nowrap shadow-sm dark:border-stone-700"
          style={{
            left: Math.max(0, Math.min(width - TIP_W, x(cursorKm) - TIP_W / 2)),
            width: TIP_W,
          }}
        >
          <span className="tabular font-mono font-semibold">{formatMetres(cursorM)}</span>
          <span className="text-stone-600 dark:text-stone-400">
            km <span className="tabular font-mono">{cursorKm.toFixed(1)}</span>
            {cursorClimb && ` · ${cursorClimb.gradePct}% ${cursorClimb.dir}`}
          </span>
        </div>
      )}
    </div>
  );
}
