"use client";

import { useEffect, useState } from "react";
import type { MeUpdates } from "@/lib/community/views";
import { lastSeenUpdates, mayHaveRider } from "./riderSession";

// One request per page: the bar's "Me" link and the Menu (its button and its "Me" entry) both
// show the count, and both are mounted on content pages.
let pending: Promise<number> | null = null;

function fetchUpdatesCount(): Promise<number> {
  // Most visitors never make an account: no request for them on every page.
  if (!mayHaveRider()) return Promise.resolve(0);
  pending ??= fetch(`/api/me/updates?since=${encodeURIComponent(lastSeenUpdates())}`, {
    cache: "no-store",
  })
    .then((r) => (r.ok ? (r.json() as Promise<MeUpdates>) : null))
    .then((u) => (u ? u.waiting + u.decided : 0))
    .catch(() => 0)
    .finally(() => {
      // The next page (or a return to this one) asks again: the count changes as hosts decide.
      setTimeout(() => (pending = null), 2_000);
    });
  return pending;
}

/**
 * Requests waiting on the rider's clubs and rides, and decisions on their own requests since
 * they last opened /me. 0 for a visitor without an account, and when `enabled` is false.
 */
export function useUpdatesCount(enabled = true): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void fetchUpdatesCount().then((n) => live && setCount(n));
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled ? count : 0;
}

/** The count as a small badge (nothing at 0); its text reads ", 2 new" to screen readers. */
export function UpdatesCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      data-updates={count}
      className="bg-ghat tabular ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-xs leading-5 font-semibold text-white"
    >
      <span className="sr-only">, </span>
      {count > 9 ? "9+" : count}
      <span className="sr-only"> new</span>
    </span>
  );
}

/** The count on "Me" in the bar. Nothing shows for a visitor without an account. */
export function UpdatesBadge() {
  return <UpdatesCount count={useUpdatesCount()} />;
}
