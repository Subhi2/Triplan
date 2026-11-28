import type { LngLat } from "@/lib/geo";
import { RouteSketch } from "@/components/ride/RouteSketch";
import { SITE_NAME } from "@/lib/site";

export interface EmbedStop {
  name: string;
  kmFromStart: number;
}

/**
 * A ride or trip as a card another site can frame (G12, C8): a sketch of the road (our own SVG,
 * no map tiles, nothing from Google), its numbers, a few stops and a link back to the planner.
 * Opens in a new tab: the embedding site keeps its reader.
 */
export function EmbedCard({
  title,
  facts,
  line,
  stops,
  href,
}: {
  title: string;
  facts: string[];
  line: LngLat[];
  stops: EmbedStop[];
  href: string;
}) {
  return (
    <main className="flex min-h-screen flex-col gap-3 bg-(--background) p-4 text-stone-900 dark:text-stone-100">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-xl leading-tight font-extrabold">{title}</h1>
        <span className="shrink-0 text-xs text-stone-600 dark:text-stone-400">{SITE_NAME}</span>
      </header>
      <p className="tabular font-mono text-sm">{facts.join(" · ")}</p>
      <RouteSketch line={line} className="bg-brand-tint h-36 w-full rounded-xl dark:bg-teal-950" />
      {stops.length > 0 && (
        <ol className="flex flex-col gap-0.5 text-sm" aria-label="Worth stopping for">
          {stops.map((s) => (
            <li key={`${s.name}-${s.kmFromStart}`} className="flex gap-2">
              <span className="tabular w-14 shrink-0 font-mono text-xs leading-5">
                km {Math.round(s.kmFromStart)}
              </span>
              {s.name}
            </li>
          ))}
        </ol>
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="bg-brand hover:bg-brand-dark mt-auto inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-bold text-white"
      >
        Plan it in {SITE_NAME}
      </a>
      <p className="text-[10px] text-stone-600 dark:text-stone-400">
        Map data © OpenStreetMap contributors (ODbL)
      </p>
    </main>
  );
}
