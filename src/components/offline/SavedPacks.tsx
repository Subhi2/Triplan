"use client";

import { useEffect, useState } from "react";
import { deletePack, listPacks, type SavedPack } from "./packStore";

const savedOn = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** "Saved for offline" on /trips: the packs on this phone, to open with no signal or delete. */
export function SavedPacks() {
  const [packs, setPacks] = useState<SavedPack[] | null>(null);
  useEffect(() => {
    listPacks()
      .then(setPacks)
      .catch(() => setPacks([]));
  }, []);
  if (!packs || packs.length === 0) return null;

  return (
    <section aria-labelledby="packs-heading" className="flex flex-col gap-2">
      <h2 id="packs-heading" className="font-display text-xl font-bold tracking-tight">
        Saved for offline
      </h2>
      <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
        {packs.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
            {/* A full page load: the planner reads the pack from the address once. */}
            <a
              href={`/?${p.query}&pack=${p.id}`}
              className="text-brand-dark min-h-11 min-w-0 flex-1 font-bold hover:underline md:min-h-0 dark:text-teal-300"
            >
              {p.title}
            </a>
            <span className="tabular font-mono text-xs text-stone-600 dark:text-stone-400">
              {Math.round(p.route.distanceKm)} km · {mb(p.bytes)} ·{" "}
              {savedOn.format(new Date(p.savedAt))}
            </span>
            <button
              type="button"
              onClick={async () => {
                await deletePack(p.id).catch(() => undefined);
                setPacks((all) => all?.filter((x) => x.id !== p.id) ?? null);
              }}
              className="inline-flex min-h-11 items-center rounded-full border border-stone-300 px-3 text-sm hover:border-stone-500 md:min-h-8 dark:border-stone-600"
              aria-label={`Delete ${p.title}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
