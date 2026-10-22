"use client";

import { useEffect, useRef, useState } from "react";
import type { LngLat } from "@/lib/geo";
import type { PlaceAlong } from "@/lib/places";
import type { SafetySummary } from "@/lib/safety";
import { trackEvent } from "@/lib/track";
import type { RouteOption, Vehicle } from "@/lib/trip";
import { downloadPack, OFFLINE_TILES_URL, PackError } from "./downloadPack";
import { deletePack, getPack, putPack } from "./packStore";

interface Props {
  route: RouteOption;
  title: string;
  vehicle: Vehicle;
  query: string;
  stops: { label: string; location: LngLat }[];
  places: PlaceAlong[] | null;
  breakPlaces: PlaceAlong[] | null;
  safety: SafetySummary | null;
}

type State =
  | { status: "checking" }
  | { status: "none" }
  | { status: "saving"; done: number; total: number }
  | { status: "saved"; bytes: number; tiles: number }
  | { status: "error"; message: string };

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * "Save for offline": the route's map from our own file, and the trip's places and safety
 * stops, kept on the phone for roads with no signal. Hidden when no map file is set up.
 */
export function SavePack(props: Props) {
  const { route } = props;
  const [state, setState] = useState<State>({ status: "checking" });
  const stop = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    getPack(route.id)
      .then((p) => {
        if (live)
          setState(p ? { status: "saved", bytes: p.bytes, tiles: p.tiles } : { status: "none" });
      })
      .catch(() => live && setState({ status: "none" }));
    return () => {
      live = false;
      stop.current?.abort();
    };
  }, [route.id]);

  if (!OFFLINE_TILES_URL || state.status === "checking") return null;

  async function save() {
    if (!props.places) return;
    const ctrl = new AbortController();
    stop.current = ctrl;
    setState({ status: "saving", done: 0, total: 0 });
    try {
      const got = await downloadPack({
        routeId: route.id,
        line: route.geometry.coordinates as LngLat[],
        onProgress: (done, total) => setState({ status: "saving", done, total }),
        signal: ctrl.signal,
      });
      await putPack({
        id: route.id,
        title: props.title,
        savedAt: new Date().toISOString(),
        bytes: got.bytes,
        tiles: got.tiles,
        maxZoom: got.maxZoom,
        vehicle: props.vehicle,
        query: props.query,
        stops: props.stops,
        route,
        places: props.places,
        breakPlaces: props.breakPlaces,
        safety: props.safety,
      });
      setState({ status: "saved", bytes: got.bytes, tiles: got.tiles });
      trackEvent("pack_saved");
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof PackError ? err.message : "Could not save the trip for offline.",
      });
    }
  }

  async function remove() {
    await deletePack(route.id).catch(() => undefined);
    setState({ status: "none" });
  }

  const button =
    "inline-flex min-h-11 items-center rounded-full border border-stone-300 px-3 text-sm font-bold hover:border-stone-500 disabled:opacity-60 md:min-h-9 dark:border-stone-600";
  return (
    <section aria-label="Offline" className="flex flex-col gap-1.5">
      {state.status === "saved" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="text-sm font-bold">
            Saved for offline · <span className="tabular font-mono">{mb(state.bytes)}</span>
          </p>
          <button type="button" onClick={remove} className={button}>
            Delete
          </button>
        </div>
      ) : state.status === "saving" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="text-sm">
            Saving the map…{" "}
            {state.total > 0 && (
              <span className="tabular font-mono">
                {state.done} / {state.total}
              </span>
            )}
          </p>
          <button type="button" onClick={() => stop.current?.abort()} className={button}>
            Stop
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={save}
          disabled={!props.places}
          className={`${button} self-start`}
        >
          Save for offline
        </button>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      )}
      <p className="text-xs text-stone-600 dark:text-stone-400">
        The map 5 km either side of the road, the places and the safety stops, for ghats with no
        signal. Find it later under Trips.
      </p>
    </section>
  );
}
