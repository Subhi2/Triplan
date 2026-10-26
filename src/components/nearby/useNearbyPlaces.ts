"use client";

import { useEffect, useState } from "react";
import { getRecent, putRecent } from "@/components/offline/packStore";
import { round3, type LngLat } from "@/lib/geo";
import type { NearbyResponse, ReachMinutes } from "@/lib/nearby";
import type { Vehicle } from "@/lib/trip";

export type NearbyState =
  | { status: "idle" }
  | { status: "loading" }
  /** `savedAt`: the last list kept on this phone, shown because the network failed (G4 F2). */
  | { status: "ok"; data: NearbyResponse; savedAt?: string }
  | { status: "error"; message: string; retry: () => void };

interface SavedNearby {
  savedAt: string;
  vehicle: Vehicle;
  data: NearbyResponse;
}

const NEAR_ME_KEY = "near-me";

/**
 * Loads the places within `within` minutes of `at` (all place-list categories; filtering is
 * client-side). The position goes out rounded to 3 decimals, as everywhere. Each answer is kept on
 * this phone (the list, not the position), and shown instead when the network fails.
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
        const saved: SavedNearby = {
          savedAt: new Date().toISOString(),
          vehicle,
          data: data as NearbyResponse,
        };
        void putRecent(NEAR_ME_KEY, saved).catch(() => undefined);
      })
      .catch(async (err: unknown) => {
        if (ctrl.signal.aborted) return;
        // No connection at all (fetch itself failed): the last list stands in. A server's error does not.
        const offline = err instanceof TypeError;
        const saved = offline ? await getRecent<SavedNearby>(NEAR_ME_KEY).catch(() => null) : null;
        if (ctrl.signal.aborted) return;
        if (saved && saved.vehicle === vehicle) {
          setState({ status: "ok", data: saved.data, savedAt: saved.savedAt });
          return;
        }
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
