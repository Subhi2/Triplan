"use client";

import { useCallback, useState } from "react";
import { roundLngLat3, type LngLat } from "@/lib/geo";

export type LocateState =
  { status: "idle" } | { status: "locating" } | { status: "error"; message: string };

const FALLBACK = "Type a place or pick a spot on the map instead.";

/** What to tell the rider when the browser gives no position (GeolocationPositionError codes). */
export function locateErrorMessage(code: number): string {
  if (code === 1) return `Location is off for this site. ${FALLBACK}`;
  if (code === 3) return `Finding you took too long. Try again, or ${FALLBACK.toLowerCase()}`;
  return `Couldn't find your position. ${FALLBACK}`;
}

/**
 * The rider's position, once, when they ask for it: call `locate` only from a tap, never on page
 * load (people distrust sites that ask straight away). Coarse accuracy is enough to find places
 * around them and saves battery. The result is rounded to ~100 m before anything uses it.
 */
export function useLocate() {
  const [state, setState] = useState<LocateState>({ status: "idle" });

  const locate = useCallback(
    () =>
      new Promise<LngLat | null>((resolve) => {
        if (!window.isSecureContext || !("geolocation" in navigator)) {
          setState({
            status: "error",
            message: `This browser can't share your location here. ${FALLBACK}`,
          });
          resolve(null);
          return;
        }
        setState({ status: "locating" });
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setState({ status: "idle" });
            resolve(roundLngLat3([pos.coords.longitude, pos.coords.latitude]));
          },
          (err) => {
            setState({ status: "error", message: locateErrorMessage(err.code) });
            resolve(null);
          },
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
        );
      }),
    [],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, locate, reset };
}
