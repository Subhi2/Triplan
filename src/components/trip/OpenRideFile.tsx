"use client";

import { useRef, useState } from "react";
import { readRideFile } from "@/lib/rideFile";
import type { RouteOption } from "@/lib/trip";
import { SHELF_TILE } from "./shelfTile";

interface Props {
  /** The ride, stored and described by the server, with the track's name from the file. */
  onOpened: (route: RouteOption, name: string | null) => void;
  /** "tile": a door on the landing page's shelf; "link" (default): a line under the trip form. */
  variant?: "link" | "tile";
}

type State = { status: "idle" } | { status: "busy" } | { status: "error"; message: string };

/**
 * "Open a GPX": a ride from Strava, Garmin or the Royal Enfield app becomes a route with its
 * hairpins, profile, places passed, 3D replay and story poster. The file is read here; only the
 * line goes to the server, with 500 m cut from each end (src/lib/rideFile.ts).
 */
/**
 * Reads a GPX, KML or TCX file in the browser and sends only its trimmed line (src/lib/rideFile.ts)
 * to be routed; also used for a file shared from another app (G12, Share to Triplan).
 */
export async function uploadRideFile(
  file: File,
): Promise<{ route: RouteOption; name: string | null } | { error: string }> {
  try {
    const ride = await readRideFile(file);
    if (!ride.ok) return { error: ride.error };
    const res = await fetch("/api/route/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry: ride.geometry, durationS: ride.durationS }),
    });
    const data = (await res.json().catch(() => ({}))) as { route?: RouteOption; error?: string };
    if (!res.ok || !data.route) return { error: data.error ?? "Could not open the ride." };
    return { route: data.route, name: ride.name };
  } catch {
    return { error: "Could not open the ride." };
  }
}

export function OpenRideFile({ onOpened, variant = "link" }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ status: "idle" });

  async function open(file: File) {
    setState({ status: "busy" });
    const result = await uploadRideFile(file);
    if ("error" in result) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "idle" });
    onOpened(result.route, result.name);
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={input}
        type="file"
        accept=".gpx,.kml,.tcx,application/gpx+xml,application/vnd.google-earth.kml+xml"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void open(file);
        }}
        data-testid="ride-file"
      />
      {variant === "tile" ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={state.status === "busy"}
          className={SHELF_TILE}
        >
          <span className="font-bold">
            {state.status === "busy" ? "Opening the ride…" : "Open a ride you did"}
          </span>
          <span className="text-xs text-stone-600 dark:text-stone-400">
            A GPX, KML or TCX file: see its hairpins, climbs and places
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={state.status === "busy"}
          className="text-brand-dark inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold hover:underline disabled:opacity-60 md:min-h-0 dark:text-teal-300"
        >
          {state.status === "busy" ? "Opening the ride…" : "Open a GPX, KML or TCX ride"}
        </button>
      )}
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      ) : variant === "tile" ? null : (
        <p className="text-xs text-stone-600 dark:text-stone-400">
          From Strava, Garmin or the Royal Enfield app. Read on your phone; only the line is sent,
          without the first and last 500 m.
        </p>
      )}
    </div>
  );
}
