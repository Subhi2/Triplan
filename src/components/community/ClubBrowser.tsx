"use client";

import Link from "next/link";
import { useState } from "react";
import type { ClubSummary } from "@/lib/community/views";
import { ClubCard } from "./Cards";
import { communityFetch } from "./riderSession";
import { chip, chipOff, chipOn, errorText, field, muted, primaryButton } from "./ui";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The club list with a search by name or town, and "near me" (position rounded, never kept). */
export function ClubBrowser({ initial }: { initial: ClubSummary[] }) {
  const [clubs, setClubs] = useState(initial);
  const [q, setQ] = useState("");
  const [near, setNear] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(params: URLSearchParams) {
    setError(null);
    try {
      setClubs((await communityFetch<{ clubs: ClubSummary[] }>(`/api/clubs?${params}`)).clubs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load clubs");
    }
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    setNear(false);
    void load(new URLSearchParams(q.trim() ? { q: q.trim() } : {}));
  }

  function nearMe() {
    if (near) {
      setNear(false);
      void load(new URLSearchParams());
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setNear(true);
        void load(
          new URLSearchParams({
            lng: String(round3(p.coords.longitude)),
            lat: String(round3(p.coords.latitude)),
          }),
        );
      },
      () => setError("Could not get your location."),
      { maximumAge: 600_000, timeout: 15_000 },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={search} role="search" className="flex min-w-60 flex-1 gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Club or town"
            aria-label="Search clubs"
            className={field}
          />
          <button type="submit" className={chip + " " + chipOff}>
            Search
          </button>
        </form>
        <button
          type="button"
          aria-pressed={near}
          onClick={nearMe}
          className={`${chip} ${near ? chipOn : chipOff}`}
        >
          Near me
        </button>
      </div>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      {clubs.length === 0 ? (
        <p className={muted}>
          No clubs here yet.{" "}
          <Link
            href="/clubs/new"
            className="text-brand-dark font-bold hover:underline dark:text-teal-300"
          >
            Start the first one
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Clubs">
          {clubs.map((c) => (
            <li key={c.slug}>
              <ClubCard club={c} />
            </li>
          ))}
        </ul>
      )}
      <Link href="/clubs/new" className={`${primaryButton} self-start`}>
        Start a club
      </Link>
    </div>
  );
}
