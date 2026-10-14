"use client";

import { useEffect, useState } from "react";
import type { RouteAlert, RouteAlertsResponse } from "@/lib/alerts";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { RouteOption } from "@/lib/trip";

export type AlertsState =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "ok"; alerts: RouteAlert[]; partial: boolean };

/**
 * Official alerts on the selected route (docs/02, "Alerts on the route"): the small route id
 * first, the geometry if the server no longer has the route. Never blocks the planner: on any
 * failure the state is "error" and nothing is shown but a muted line in the ride check.
 */
export function useRouteAlerts(route: RouteOption | null): AlertsState {
  const [state, setState] = useState<AlertsState>({ status: "idle" });
  useEffect(() => {
    if (!route) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const post = (body: object) =>
      fetch("/api/route/alerts", {
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
      const data = (await res.json()) as RouteAlertsResponse;
      setState({ status: "ok", alerts: data.alerts, partial: data.partial });
    })().catch(() => {
      if (!ctrl.signal.aborted) setState({ status: "error" });
    });
    return () => ctrl.abort();
  }, [route]);
  return state;
}
