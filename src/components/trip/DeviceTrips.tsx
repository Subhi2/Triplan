"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDuration, formatKm } from "@/lib/format";
import type { TripSummary } from "@/lib/savedTrip";
import { deviceTripIds, forgetTrip, ownTripIds } from "@/lib/tripTokens";

const updated = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; trips: TripSummary[]; own: Set<string> };

/** The trips saved or opened on this device (ids in localStorage), loaded from our API. */
export function DeviceTrips() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ids = deviceTripIds();
    if (ids.length === 0) {
      setState({ kind: "ready", trips: [], own: new Set() });
      return;
    }
    let live = true;
    setState({ kind: "loading" });
    fetch(`/api/trips?ids=${ids.join(",")}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ trips: TripSummary[] }>) : null))
      .then((data) => {
        if (!live) return;
        if (!data) return setState({ kind: "error" });
        // Trips deleted from the database since: drop them from this device's list.
        const found = new Set(data.trips.map((t) => t.id));
        for (const id of ids) if (!found.has(id)) forgetTrip(id);
        setState({ kind: "ready", trips: data.trips, own: ownTripIds() });
      })
      .catch(() => live && setState({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [attempt]);

  if (state.kind === "loading") {
    return <p className="text-sm text-stone-600 dark:text-stone-400">Loading your trips…</p>;
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="text-sm">
        Could not load your trips.{" "}
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="text-brand inline-flex min-h-11 items-center font-medium hover:underline md:min-h-0"
        >
          Try again
        </button>
      </p>
    );
  }
  if (state.trips.length === 0) {
    return (
      <p className="text-sm text-stone-600 dark:text-stone-400">
        No trips on this device yet. Plan a ride and press Save trip. Trips you open from a shared
        link show up here too.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-stone-200 dark:divide-stone-800" aria-label="Your trips">
      {state.trips.map((t) => (
        <li key={t.id}>
          <Link
            href={`/trips/${t.id}`}
            className="block rounded-md px-2 py-3 hover:bg-stone-100 dark:hover:bg-stone-900"
          >
            <span className="block font-semibold">{t.title}</span>
            <span className="block text-sm">
              {t.from} → {t.to}
              {t.viaCount > 0 && ` · ${t.viaCount} stop${t.viaCount > 1 ? "s" : ""}`}
            </span>
            <span className="block text-xs text-stone-600 dark:text-stone-400">
              {[
                t.viaLabel,
                t.distanceKm !== null && formatKm(t.distanceKm * 1000),
                t.durationMin !== null && formatDuration(t.durationMin),
                t.vehicle === "bike" ? "Bike" : "Car",
                `${state.own.has(t.id) ? "saved here" : "opened"} · ${updated.format(new Date(t.updatedAt))}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
