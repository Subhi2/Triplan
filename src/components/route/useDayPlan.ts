"use client";

import { useEffect, useState } from "react";
import type { DayPlan } from "@/lib/multiDay";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { RouteOption } from "@/lib/trip";

export type DayPlanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ok"; routeId: string; plan: DayPlan };

/**
 * The selected route split into days (POST /api/route/days), when it takes more than one day or
 * the rider asked for more. The small route id first, the geometry and totals if it expired.
 */
export function useDayPlan(
  route: RouteOption | null,
  hoursPerDay: number,
  days: number | null,
  needed: boolean,
): DayPlanState {
  const [state, setState] = useState<DayPlanState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!route || !needed) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const post = (body: object) =>
      fetch("/api/route/days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, hoursPerDay, ...(days ? { days } : {}) }),
        signal: ctrl.signal,
      });
    setState({ status: "loading" });
    (async () => {
      let res = ROUTE_ID_PATTERN.test(route.id) ? await post({ routeId: route.id }) : null;
      if (!res || res.status === 404) {
        res = await post({
          geometry: route.geometry,
          distanceKm: route.distanceKm,
          durationMin: Math.max(1, route.durationMin),
        });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState({ status: "ok", routeId: route.id, plan: (await res.json()) as DayPlan });
    })().catch(() => {
      if (!ctrl.signal.aborted) {
        setState({ status: "error", retry: () => setAttempt((n) => n + 1) });
      }
    });
    return () => ctrl.abort();
  }, [route, hoursPerDay, days, needed, attempt]);
  return state;
}
