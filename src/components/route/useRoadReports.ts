"use client";

import { useCallback, useEffect, useState } from "react";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { RoadReportAlong } from "@/lib/riderPosts";
import type { RouteOption } from "@/lib/trip";

export type RoadReportsState =
  { status: "idle" | "loading" | "error" } | { status: "ok"; reports: RoadReportAlong[] };

/**
 * Riders' road reports on the selected route, approved and still in force (docs/02, "Reviews,
 * photos and road reports"). Like the alerts, it never blocks the planner.
 */
export function useRoadReports(route: RouteOption | null): RoadReportsState {
  const [state, setState] = useState<RoadReportsState>({ status: "idle" });
  const load = useCallback((r: RouteOption, signal: AbortSignal) => {
    const post = (body: object) =>
      fetch("/api/route/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    setState({ status: "loading" });
    (async () => {
      let res = ROUTE_ID_PATTERN.test(r.id) ? await post({ routeId: r.id }) : null;
      if (!res || res.status === 404) res = await post({ geometry: r.geometry });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { reports: RoadReportAlong[] };
      setState({ status: "ok", reports: data.reports });
    })().catch(() => {
      if (!signal.aborted) setState({ status: "error" });
    });
  }, []);
  useEffect(() => {
    if (!route) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    load(route, ctrl.signal);
    return () => ctrl.abort();
  }, [route, load]);
  return state;
}
