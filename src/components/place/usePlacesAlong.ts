"use client";

import { useEffect, useRef, useState } from "react";
import { ROUTE_ID_PATTERN, type PlaceAlong } from "@/lib/places";
import type { CorridorKm, RouteOption } from "@/lib/trip";

export type PlacesState =
  | { status: "idle" }
  /** `previous`: the places of the same route, still shown (dimmed) while the new ones load. */
  | { status: "loading"; previous?: PlaceAlong[] }
  | { status: "ok"; places: PlaceAlong[] }
  | { status: "error"; message: string; retry: () => void };

/**
 * Loads every place within the corridor of the route: the place-list categories (filtering is
 * client-side), or only `categories` when given (e.g. fuel stations for the ride check).
 * Sends the small route id first and falls back to the full geometry if the server no longer
 * has that route cached.
 */
export function usePlacesAlong(
  route: RouteOption | null,
  corridorKm: CorridorKm,
  categories?: string[],
): PlacesState {
  const [state, setState] = useState<PlacesState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const last = useRef<{ routeId: string; places: PlaceAlong[] } | null>(null);
  // A string, so a new array with the same categories does not reload.
  const categoryKey = categories?.join(",") ?? "";

  useEffect(() => {
    if (!route) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const post = (body: object) =>
      fetch("/api/places/along", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          corridorKm,
          ...(categoryKey && { categories: categoryKey.split(",") }),
        }),
        signal: ctrl.signal,
      });

    // A wider corridor on the same route: keep its places on screen until the new ones arrive.
    const previous = last.current?.routeId === route.id ? last.current.places : undefined;
    setState(previous ? { status: "loading", previous } : { status: "loading" });
    (async () => {
      let res = ROUTE_ID_PATTERN.test(route.id) ? await post({ routeId: route.id }) : null;
      if (!res || res.status === 404) res = await post({ geometry: route.geometry });
      const data = (await res.json()) as { places?: PlaceAlong[]; error?: string };
      if (!res.ok || !data.places) throw new Error(data.error ?? `HTTP ${res.status}`);
      last.current = { routeId: route.id, places: data.places };
      setState({ status: "ok", places: data.places });
    })().catch((err: unknown) => {
      if (ctrl.signal.aborted) return;
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Could not load places",
        retry: () => setAttempt((n) => n + 1),
      });
    });
    return () => ctrl.abort();
  }, [route, corridorKm, categoryKey, attempt]);

  return state;
}
