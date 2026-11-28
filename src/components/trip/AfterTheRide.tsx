"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasReviewed } from "@/components/posts/postClient";

/**
 * "How was it?" (G11, C6): on a saved trip some time after it was planned, the places it stopped
 * at, each a tap from its review form. Places this device reviewed already are left out; nothing
 * is sent until the rider writes a review on the place's page.
 */
export function AfterTheRide({ places }: { places: { slug: string; name: string }[] }) {
  // Read after the first paint: which places this device reviewed lives in its storage.
  const [open, setOpen] = useState<{ slug: string; name: string }[] | null>(null);
  useEffect(() => {
    setOpen(places.filter((p) => !hasReviewed(p.slug)));
  }, [places]);
  if (!open || open.length === 0) return null;
  return (
    <section
      aria-labelledby="after-ride"
      className="flex flex-col gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
    >
      <h3 id="after-ride" className="font-display text-[17px] font-bold tracking-tight">
        Rode it? How was it?
      </h3>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        A line on each stop helps the next rider. No sign-in needed.
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {open.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/place/${p.slug}#reviews`}
              className="text-brand-dark inline-flex min-h-11 items-center rounded-full border border-stone-300 px-3 text-sm font-bold hover:bg-stone-100 md:min-h-9 dark:border-stone-600 dark:text-teal-300 dark:hover:bg-stone-800"
            >
              Review {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
