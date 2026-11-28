"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { totalsByYear, yearCardPath, type RideLogEntry } from "@/lib/rideLog";
import { communityFetch } from "./riderSession";
import { card, errorText, field, label, muted, primaryButton, secondaryButton } from "./ui";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the rider's zone

/**
 * "My rides" (G11, C7): the rides the rider logged and the famous rides they marked done, with
 * totals by year and a year card to share (numbers only, no nickname). No leaderboard.
 */
export function MyRides() {
  const [entries, setEntries] = useState<RideLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ riddenOn: today(), title: "", km: "", hairpins: "" });

  const load = useCallback(() => {
    communityFetch<{ entries: RideLogEntry[] }>("/api/me/log")
      .then((r) => setEntries(r.entries))
      .catch(() => setError("Could not load your rides."));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const km = Number(form.km);
    if (!form.title.trim() || !(km > 0)) return setError("Give the ride a name and its km.");
    try {
      await communityFetch("/api/me/log", {
        method: "POST",
        body: {
          riddenOn: form.riddenOn,
          title: form.title.trim(),
          distanceKm: km,
          hairpins: form.hairpins ? Math.max(0, Math.round(Number(form.hairpins))) : 0,
        },
      });
      setForm({ riddenOn: today(), title: "", km: "", hairpins: "" });
      setAdding(false);
      setError(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log the ride.");
    }
  }

  async function remove(id: string) {
    try {
      await communityFetch("/api/me/log", { method: "DELETE", body: { id } });
      load();
    } catch {
      setError("Could not remove it.");
    }
  }

  const years = entries ? totalsByYear(entries) : [];
  return (
    <section aria-labelledby="my-rides" className={`${card} flex flex-col gap-3`}>
      <h2 id="my-rides" className="font-display text-xl font-bold">
        My rides
      </h2>
      {years.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Totals by year">
          {years.map((y) => (
            <li key={y.year} className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-bold">{y.year}</span>
              <span className="tabular font-mono text-sm">
                {y.rides} {y.rides === 1 ? "ride" : "rides"} · {y.km.toLocaleString("en-IN")} km
                {y.hairpins > 0 ? ` · ${y.hairpins} hairpins` : ""}
              </span>
              <a
                href={yearCardPath(y)}
                target="_blank"
                rel="noopener"
                className="text-brand-dark inline-flex min-h-11 items-center text-sm font-bold underline md:min-h-0 dark:text-teal-300"
              >
                Year card
              </a>
            </li>
          ))}
        </ul>
      )}
      {entries && entries.length === 0 && (
        <p className={muted}>
          Rides you log, and famous rides you mark ridden, show here with your totals for the year.
        </p>
      )}
      {entries && entries.length > 0 && (
        <ol className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
          {entries.slice(0, 50).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 py-1.5 text-sm">
              <span className="tabular font-mono text-xs">{e.riddenOn}</span>
              {e.rideSlug ? (
                <Link href={`/rides/${e.rideSlug}`} className="font-bold underline">
                  {e.title}
                </Link>
              ) : (
                <span className="font-bold">{e.title}</span>
              )}
              <span className="tabular font-mono text-xs">{Math.round(e.distanceKm)} km</span>
              {!e.rideSlug && (
                <button
                  type="button"
                  onClick={() => void remove(e.id)}
                  className="text-brand-dark ml-auto inline-flex min-h-11 items-center text-xs font-bold hover:underline md:min-h-0 dark:text-teal-300"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {adding ? (
        <form onSubmit={add} className="grid grid-cols-2 gap-2" aria-label="Log a ride">
          <label className={`${label} col-span-2`}>
            Ride
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={120}
              placeholder="Where you rode, start to end"
              className={field}
            />
          </label>
          <label className={label}>
            Day
            <input
              type="date"
              value={form.riddenOn}
              max={today()}
              onChange={(e) => setForm({ ...form, riddenOn: e.target.value })}
              className={field}
            />
          </label>
          <label className={label}>
            Km
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={form.km}
              onChange={(e) => setForm({ ...form, km: e.target.value })}
              className={field}
            />
          </label>
          <label className={label}>
            Hairpins (optional)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={form.hairpins}
              onChange={(e) => setForm({ ...form, hairpins: e.target.value })}
              className={field}
            />
          </label>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className={primaryButton}>
              Log it
            </button>
            <button type="button" onClick={() => setAdding(false)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`${secondaryButton} self-start`}
        >
          Log a ride
        </button>
      )}
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
    </section>
  );
}
