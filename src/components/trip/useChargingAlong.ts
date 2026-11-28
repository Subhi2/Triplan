"use client";

import { useEffect, useState } from "react";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { FuelStation } from "@/lib/rideCheck";
import type { RouteOption } from "@/lib/trip";

export type ChargingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; points: FuelStation[] };

/**
 * EV charging points along the selected route (G10), asked for only when My bike is electric:
 * the small route id first, the geometry if the server no longer has the route.
 */
export function useChargingAlong(route: RouteOption | null, enabled: boolean): ChargingState {
  const [state, setState] = useState<ChargingState>({ status: "idle" });
  useEffect(() => {
    if (!route || !enabled) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const post = (body: object) =>
      fetch("/api/services/charging", {
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
      const body = (await res.json()) as { points: FuelStation[] };
      setState({ status: "ok", points: body.points });
    })().catch(() => {
      if (!ctrl.signal.aborted) setState({ status: "error" });
    });
    return () => ctrl.abort();
  }, [route, enabled]);
  return state;
}
