"use client";

import { useEffect, useState } from "react";
import type { LngLat } from "@/lib/geo";
import type { PackingItem } from "@/lib/packing";
import { tripToken } from "@/lib/tripTokens";

interface Props {
  /** The places picked for the trip. */
  placeIds: string[];
  /** The month of the ride (1–12). */
  month: number;
  destination: LngLat;
  /** A saved trip keeps its ticks, written with the device's edit token. */
  saved: { id: string; packing: string[] } | null;
}

/**
 * "What to pack" (G10, C3): what the trip's places say to carry in the month of the ride, and
 * what every ride needs, to tick off. A saved trip keeps the ticks; otherwise they last the visit.
 */
export function PackingList({ placeIds, month, destination, saved }: Props) {
  const [items, setItems] = useState<PackingItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(saved?.packing ?? []));
  const savedId = saved?.id ?? null;
  const [lng, lat] = destination;
  const idsKey = [...placeIds].sort().join(",");

  useEffect(() => {
    const ctrl = new AbortController();
    setFailed(false);
    fetch("/api/packing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placeIds: idsKey ? idsKey.split(",") : [],
        month,
        destination: [lng, lat],
      }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setItems(((await res.json()) as { items: PackingItem[] }).items);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, [idsKey, month, lng, lat]);

  const token = savedId ? tripToken(savedId) : null;
  function toggle(slug: string) {
    const next = new Set(ticked);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setTicked(next);
    if (savedId && token) {
      void fetch(`/api/trips/${savedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packing: [...next] }),
      }).catch(() => undefined);
    }
  }

  if (failed) return null;
  const done = items ? items.filter((i) => ticked.has(i.slug)).length : 0;
  return (
    <details className="group rounded-xl border border-stone-200 px-3 py-2 dark:border-stone-700">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-bold md:min-h-9">
        <span
          aria-hidden
          className="inline-block text-sm transition-transform group-open:rotate-90 motion-reduce:transition-none"
        >
          ›
        </span>
        What to pack
        {items && (
          <span className="tabular font-mono text-xs font-normal text-stone-600 dark:text-stone-400">
            {done}/{items.length}
          </span>
        )}
      </summary>
      {!items ? (
        <div aria-hidden className="shimmer my-2 h-10 rounded-xl" />
      ) : (
        <>
          <ul className="flex flex-col py-1" aria-label="Packing list">
            {items.map((item) => (
              <li key={item.slug}>
                <label className="flex min-h-11 items-start gap-2 py-1 text-sm md:min-h-8">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={ticked.has(item.slug)}
                    onChange={() => toggle(item.slug)}
                  />
                  <span>
                    <span className={ticked.has(item.slug) ? "line-through opacity-70" : ""}>
                      {item.name}
                    </span>
                    {item.for.length > 0 && (
                      <span className="block text-xs text-stone-600 dark:text-stone-400">
                        For {item.for.slice(0, 3).join(", ")}
                        {item.for.length > 3 ? ` and ${item.for.length - 3} more` : ""}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="pb-1 text-xs text-stone-600 dark:text-stone-400">
            For a ride in {new Date(2000, month - 1, 1).toLocaleString("en-IN", { month: "long" })},
            from the places you picked.{" "}
            {savedId && token
              ? "Your ticks are kept with this trip."
              : "Save the trip to keep your ticks."}
          </p>
        </>
      )}
    </details>
  );
}
