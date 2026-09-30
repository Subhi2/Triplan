"use client";

import { useEffect, useRef, useState } from "react";
import { locateErrorMessage } from "@/components/geo/useLocate";
import { round3, type LngLat } from "@/lib/geo";
import type { NearbyResponse, PlaceNear } from "@/lib/nearby";
import {
  nextHeading,
  NO_HEADING,
  placesAhead,
  shouldRequery,
  type AheadPlace,
  type Fix,
} from "@/lib/rideAhead";

export type RideState =
  | { status: "off" }
  | { status: "starting" }
  | { status: "error"; message: string }
  | {
      status: "on";
      headingDeg: number | null;
      ahead: AheadPlace[];
      /** Places loaded around the rider at least once. */
      loaded: boolean;
      /** The last fix was poor or missing; the list may be behind. */
      weakSignal: boolean;
    };

/**
 * Ride mode: watches the position while `active` (only after the rider turned it on), works out
 * the heading, and lists the best places in a cone ahead. Places come from
 * /api/places/near?mode=ride (35 km around, no road times), asked for again only after 2 km and a
 * minute; the cone is filtered on the phone at every fix. The position sent is rounded to ~100 m
 * and is never written to the URL.
 */
export function useRideAhead(active: boolean, month: number): RideState {
  const [state, setState] = useState<RideState>({ status: "off" });

  const heading = useRef(NO_HEADING);
  const places = useRef<PlaceNear[]>([]);
  const loaded = useRef(false);
  const shown = useRef<ReadonlySet<string>>(new Set());
  const lastFix = useRef<LngLat | null>(null);
  const lastQuery = useRef<{ at: LngLat; t: number } | null>(null);

  useEffect(() => {
    if (!active) {
      setState({ status: "off" });
      return;
    }
    if (!("geolocation" in navigator)) {
      setState({ status: "error", message: "This browser can't share your position." });
      return;
    }
    heading.current = NO_HEADING;
    places.current = [];
    loaded.current = false;
    shown.current = new Set();
    lastFix.current = null;
    lastQuery.current = null;
    setState({ status: "starting" });

    const ctrl = new AbortController();

    function show(weakSignal = false) {
      const me = lastFix.current;
      const h = heading.current.headingDeg;
      const ahead =
        me && h !== null ? placesAhead(places.current, me, h, shown.current, month) : [];
      shown.current = new Set(ahead.map((a) => a.place.id));
      setState({ status: "on", headingDeg: h, ahead, loaded: loaded.current, weakSignal });
    }

    function load(at: LngLat) {
      lastQuery.current = { at, t: Date.now() };
      const params = new URLSearchParams({
        lng: String(round3(at[0])),
        lat: String(round3(at[1])),
        mode: "ride",
      });
      fetch(`/api/places/near?${params}`, { signal: ctrl.signal })
        .then(async (res) => {
          const data = (await res.json()) as Partial<NearbyResponse>;
          if (!res.ok || !data.places) throw new Error(`HTTP ${res.status}`);
          places.current = data.places;
          loaded.current = true;
          show();
        })
        .catch(() => {
          // Try again at the next fix that allows it; the old places stay meanwhile.
          if (!ctrl.signal.aborted) lastQuery.current = null;
        });
    }

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const f: Fix = {
          location: [pos.coords.longitude, pos.coords.latitude],
          accuracyM: pos.coords.accuracy,
          headingDeg: pos.coords.heading,
          speedMps: pos.coords.speed,
        };
        heading.current = nextHeading(heading.current, f);
        lastFix.current = f.location;
        if (shouldRequery(lastQuery.current, f.location, Date.now())) load(f.location);
        show();
      },
      (err) => {
        if (err.code === 1) setState({ status: "error", message: locateErrorMessage(1) });
        else show(true);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watch);
      ctrl.abort();
    };
  }, [active, month]);

  return state;
}
