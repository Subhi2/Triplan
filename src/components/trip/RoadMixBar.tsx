import { formatKm } from "@/lib/format";
import type { RoadMix } from "@/lib/trip";

const PARTS = [
  {
    key: "nationalM",
    label: "NH",
    title: "National highways and expressways",
    color: "bg-brand",
  },
  { key: "stateM", label: "SH", title: "State highways", color: "bg-amber-500" },
  {
    key: "ghatM",
    label: "Ghat",
    title: "Ghat roads: winding hill sections, worked out from the road's shape (approximate)",
    color: "bg-rose-500",
  },
  {
    key: "otherM",
    label: "Other",
    title: "District and local roads",
    color: "bg-stone-400 dark:bg-stone-500",
  },
] as const;

/** A route's split by kind of road: a stacked bar and the share and distance of each kind. */
export function RoadMixBar({ mix }: { mix: RoadMix }) {
  const total = mix.nationalM + mix.stateM + mix.ghatM + mix.otherM;
  if (total <= 0) return null;
  // Parts under half a percent would show as 0%.
  const parts = PARTS.map((p) => ({ ...p, m: mix[p.key] })).filter((p) => p.m / total >= 0.005);

  // Spans, not divs: this sits inside the route card's button.
  return (
    <span className="mt-2 block">
      <span className="flex h-1.5 overflow-hidden rounded-full" aria-hidden>
        {parts.map((p) => (
          <span key={p.key} className={p.color} style={{ width: `${(100 * p.m) / total}%` }} />
        ))}
      </span>
      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-600 dark:text-stone-300">
        {parts.map((p) => (
          <span key={p.key} title={p.title} className="inline-flex items-center gap-1">
            <span aria-hidden className={`h-2 w-2 rounded-full ${p.color}`} />
            <span className="font-medium">{p.label}</span> {Math.round((100 * p.m) / total)}% ·{" "}
            {formatKm(p.m)}
          </span>
        ))}
      </span>
    </span>
  );
}
