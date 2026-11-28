"use client";

import { useEffect, useRef, useState } from "react";
import { getRecent, putRecent } from "@/components/offline/packStore";
import type { LngLat } from "@/lib/geo";
import { stopsFromShare, type SharedStop } from "@/lib/mapsLink";
import type { GeocodeResult, RouteOption } from "@/lib/trip";
import { uploadRideFile } from "./OpenRideFile";

const SHARED_FILE_KEY = "shared-file";

export type SharedState =
  { status: "idle" } | { status: "busy" } | { status: "error"; message: string };

/** The first match for a name: our own places, then the geocoder (one search, as on Enter). */
async function findPlace(name: string): Promise<LngLat | null> {
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(name)}&source=osm`);
    if (!res.ok) return null;
    const { results } = (await res.json()) as { results?: GeocodeResult[] };
    return results?.[0]?.location ?? null;
  } catch {
    return null;
  }
}

/**
 * What "Share to Triplan" brought (G12, A2), read once when the planner opens with ?shared=:
 * a ride file kept on this phone by the service worker (opened as an opened GPX is), or a link
 * or text turned into stops. The planner then writes its own address, without ?shared=.
 */
export function useSharedIntake(handlers: {
  onRide: (route: RouteOption, name: string | null) => void;
  onStops: (stops: { label: string; location: LngLat }[]) => void;
}): SharedState {
  const [state, setState] = useState<SharedState>({ status: "idle" });
  // The address as the page opened: the planner rewrites it in an effect that runs before ours.
  const [opened] = useState(() => (typeof window === "undefined" ? "" : window.location.search));
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const params = new URLSearchParams(opened);
    const kind = params.get("shared");
    if (!kind) return;
    if (kind === "failed") {
      setState({
        status: "error",
        message: 'Open the shared file with "Open a GPX, KML or TCX ride" below.',
      });
      return;
    }
    setState({ status: "busy" });
    (async () => {
      if (kind === "file") {
        const kept = await getRecent<{ name: string; type: string; blob: Blob }>(SHARED_FILE_KEY);
        await putRecent(SHARED_FILE_KEY, null);
        if (!kept) throw new Error("The shared file was not found.");
        const result = await uploadRideFile(new File([kept.blob], kept.name, { type: kept.type }));
        if ("error" in result) throw new Error(result.error);
        latest.current.onRide(result.route, result.name);
        return;
      }
      const shared: SharedStop[] = stopsFromShare({
        title: params.get("st"),
        text: params.get("sx"),
        url: params.get("su"),
      }).slice(0, 7);
      const found = await Promise.all(
        shared.map(async (s) => ({
          label: s.label,
          location: s.location ?? (await findPlace(s.label)),
        })),
      );
      const stops = found.filter(
        (s): s is { label: string; location: LngLat } => s.location !== null,
      );
      if (stops.length === 0)
        throw new Error("Could not find the shared place. Type it in instead.");
      latest.current.onStops(stops);
    })()
      .then(() => setState({ status: "idle" }))
      .catch((err: unknown) =>
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not open what was shared.",
        }),
      );
  }, [opened]);
  return state;
}
