"use client";

import { useEffect, useState } from "react";
import type { MeUpdates } from "@/lib/community/views";
import { lastSeenUpdates } from "./riderSession";

/**
 * The count on "Me": requests waiting on the rider's clubs and rides, and decisions on their own
 * requests since they last opened /me. Nothing shows for a visitor without an account.
 */
export function UpdatesBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(`/api/me/updates?since=${encodeURIComponent(lastSeenUpdates())}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<MeUpdates>) : null))
      .then((u) => live && u && setCount(u.waiting + u.decided))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
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
