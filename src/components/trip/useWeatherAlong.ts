"use client";

import { useEffect, useState } from "react";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { RouteOption } from "@/lib/trip";
import type { WeatherPoint } from "@/lib/weather";

export type WeatherState =
  | { status: "idle" | "loading" }
  | { status: "ok"; points: WeatherPoint[] }
  | { status: "error"; message: string };

/**
 * The forecast along the route for a departure time. Waits a moment after the time changes, so
 * typing a time does not send a request per keystroke. Sends the route id first and the full
 * geometry if the server no longer has the route cached.
 */
export function useWeatherAlong(route: RouteOption, departAt: Date | null): WeatherState {
  const [state, setState] = useState<WeatherState>({ status: "idle" });
  const at = departAt?.toISOString() ?? null;

  useEffect(() => {
    if (!at) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const post = (body: object) =>
      fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, departAt: at, rideMin: route.durationMin }),
        signal: ctrl.signal,
      });
    setState({ status: "loading" });
    const timer = setTimeout(() => {
      (async () => {
        let res = ROUTE_ID_PATTERN.test(route.id) ? await post({ routeId: route.id }) : null;
        if (!res || res.status === 404) res = await post({ geometry: route.geometry });
        const data = (await res.json()) as { points?: WeatherPoint[]; error?: string };
        if (!res.ok || !data.points) throw new Error(data.error ?? `HTTP ${res.status}`);
        setState({ status: "ok", points: data.points });
      })().catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not load the weather",
        });
      });
    }, 500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [route, at]);

  return state;
}
