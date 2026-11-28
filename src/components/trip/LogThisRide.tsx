"use client";

import { useEffect, useState } from "react";
import { communityFetch, mayHaveRider } from "@/components/community/riderSession";

interface Props {
  tripId: string;
  title: string;
  distanceKm: number;
  hairpins: number;
}

/**
 * "I rode this" on a saved trip (G11, C7): logs its numbers (never its line) in the rider's own
 * "My rides" on Me. Shown only to a rider with a nickname.
 */
export function LogThisRide({ tripId, title, distanceKm, hairpins }: Props) {
  const [rider, setRider] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  useEffect(() => setRider(mayHaveRider()), []);
  if (!rider) return null;

  async function log() {
    setState("busy");
    try {
      await communityFetch("/api/me/log", {
        method: "POST",
        body: {
          riddenOn: new Date().toLocaleDateString("en-CA"),
          title,
          distanceKm: Math.round(distanceKm * 10) / 10,
          hairpins,
          tripId,
        },
      });
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <p className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
      {state === "done" ? (
        <>
          Logged in{" "}
          <a href="/me#my-rides" className="text-brand-dark font-bold underline dark:text-teal-300">
            My rides
          </a>
          .
        </>
      ) : (
        <button
          type="button"
          onClick={() => void log()}
          disabled={state === "busy"}
          className="inline-flex min-h-11 items-center rounded-full border border-stone-300 px-3 font-bold hover:border-stone-500 disabled:opacity-60 md:min-h-9 dark:border-stone-600"
        >
          I rode this today
        </button>
      )}
      {state === "error" && (
        <span className="text-red-700 dark:text-red-400">Could not log it.</span>
      )}
    </p>
  );
}
