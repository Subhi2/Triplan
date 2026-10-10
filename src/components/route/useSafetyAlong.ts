"use client";

import { useEffect, useState } from "react";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { SafetySummary } from "@/lib/safety";
import type { RouteOption } from "@/lib/trip";

export type SafetyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ok"; summary: SafetySummary };

/** Safety stops along the selected route: the small route id first, the geometry if it expired. */
export function useSafetyAlong(route: RouteOption | null): SafetyState {
  const [state, setState] = useState<SafetyState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!route) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const post = (body: object) =>
      fetch("/api/services/along", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    setState({ status: "loading" });
    (async () => {
      let res = ROUTE_ID_PATTERN.test(route.id) ? await post({ routeId: route.id }) : null;
      if (!res || res.status === 404) res = await post({ geometry: route.geometry });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState({ status: "ok", summary: (await res.json()) as SafetySummary });
    })().catch(() => {
      if (!ctrl.signal.aborted) {
        setState({ status: "error", retry: () => setAttempt((n) => n + 1) });
      }
    });
    return () => ctrl.abort();
  }, [route, attempt]);
  return state;
}
