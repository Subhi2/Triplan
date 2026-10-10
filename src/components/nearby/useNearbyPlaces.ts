"use client";

import { useEffect, useState } from "react";
import { round3, type LngLat } from "@/lib/geo";
import type { NearbyResponse, ReachMinutes } from "@/lib/nearby";
import type { Vehicle } from "@/lib/trip";

export type NearbyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: NearbyResponse }
  | { status: "error"; message: string; retry: () => void };

/**
 * Loads the places within `within` minutes of `at` (all place-list categories; filtering is
 * client-side). The position goes out rounded to 3 decimals, as everywhere.
 */
export function useNearbyPlaces(
  at: LngLat | null,
  within: ReachMinutes,
  vehicle: Vehicle,
): NearbyState {
  const [state, setState] = useState<NearbyState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const lng = at ? round3(at[0]) : null;
  const lat = at ? round3(at[1]) : null;

  useEffect(() => {
    if (lng === null || lat === null) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const params = new URLSearchParams({
      lng: String(lng),
      lat: String(lat),
      within: String(within),
      vehicle,
    });
    setState({ status: "loading" });
    fetch(`/api/places/near?${params}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = (await res.json()) as Partial<NearbyResponse> & { error?: string };
        if (!res.ok || !data.places) throw new Error(data.error ?? `HTTP ${res.status}`);
        setState({ status: "ok", data: data as NearbyResponse });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not load places",
          retry: () => setAttempt((n) => n + 1),
        });
      });
    return () => ctrl.abort();
  }, [lng, lat, within, vehicle, attempt]);

  return state;
}
