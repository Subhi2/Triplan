import type { LngLat } from "@/lib/geo";
import { sketchRoute } from "@/lib/routeSketch";

const W = 320;
const H = 160;

/** A route's shape as a small drawing (north up), with the start and end marked. */
export function RouteSketch({ line, className }: { line: LngLat[]; className?: string }) {
  const ends = line.length > 1 ? [line[0]!, line.at(-1)!] : [];
  const sketch = sketchRoute(line, ends, W, H, 18);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d={sketch.path}
        fill="none"
        stroke="var(--surface)"
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={sketch.path}
        fill="none"
        className="stroke-brand dark:stroke-teal-300"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {sketch.stops.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 ? 5 : 6}
          className={i === 0 ? "stroke-brand fill-white" : "fill-brand stroke-white"}
          strokeWidth={2.5}
        />
      ))}
    </svg>
  );
}
