"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { MapStop } from "@/components/map/MapView";
import type { CorridorKm, RouteOption, Vehicle } from "@/lib/trip";
import { parseTripUrl, serializeTripUrl, type UrlStop } from "@/lib/tripUrl";
import { RouteCards } from "./RouteCards";
import { TripForm, type StopDraft } from "./TripForm";

// MapLibre needs the browser.
const MapView = dynamic(() => import("@/components/map/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-stone-200 dark:bg-stone-800" />,
});

let nextId = 0;
const newId = () => `stop-${++nextId}`;

function draft(s: UrlStop | null): StopDraft {
  return { id: newId(), label: s?.label ?? "", location: s?.location ?? null };
}

type RouteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; routes: RouteOption[] }
  | { status: "error"; message: string };

export function Planner() {
  const searchParams = useSearchParams();
  const [initial] = useState(() => parseTripUrl(new URLSearchParams(searchParams.toString())));
  const [stops, setStops] = useState<StopDraft[]>(() => [
    draft(initial.from),
    ...initial.via.map(draft),
    draft(initial.to),
  ]);
  const [vehicle, setVehicle] = useState<Vehicle>(initial.vehicle);
  const [corridorKm, setCorridorKm] = useState<CorridorKm>(initial.corridorKm);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<RouteState>({ status: "idle" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep the trip in the URL so it can be shared. replaceState avoids a server round trip.
  const resolved = stops.filter(
    (s): s is StopDraft & { location: NonNullable<StopDraft["location"]> } => Boolean(s.location),
  );
  const first = stops[0];
  const last = stops[stops.length - 1];
  const query = serializeTripUrl({
    from: first?.location ? { label: first.label, location: first.location } : null,
    via: stops
      .slice(1, -1)
      .filter((s) => s.location)
      .map((s) => ({ label: s.label, location: s.location! })),
    to: last?.location ? { label: last.label, location: last.location } : null,
    vehicle,
    corridorKm,
  });
  useEffect(() => {
    if (window.location.search !== `?${query}`) {
      window.history.replaceState(null, "", `?${query}`);
    }
  }, [query]);

  // Route whenever start and destination are set. Unresolved via stops are skipped.
  const routeBody = useMemo(
    () =>
      first?.location && last?.location
        ? JSON.stringify({
            stops: resolved.map((s) => ({ label: s.label, location: s.location })),
            vehicle,
          })
        : null,
    // resolved is derived from stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops, vehicle],
  );

  useEffect(() => {
    if (!routeBody) {
      setRouteState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setRouteState({ status: "loading" });
    fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: routeBody,
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as { routes?: RouteOption[]; error?: string };
        if (!res.ok || !data.routes) throw new Error(data.error ?? `HTTP ${res.status}`);
        setRouteState({ status: "ok", routes: data.routes });
        setSelectedId(data.routes[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setRouteState({
          status: "error",
          message: err instanceof Error ? err.message : "Routing failed",
        });
      });
    return () => ctrl.abort();
  }, [routeBody]);

  function addStop() {
    const s = draft(null);
    setStops((prev) => [...prev.slice(0, -1), s, ...prev.slice(-1)]);
    setFocusId(s.id);
  }

  const routes = routeState.status === "ok" ? routeState.routes : [];
  const mapStops: MapStop[] = stops.flatMap((s, i) =>
    s.location
      ? [
          {
            id: s.id,
            label: s.label,
            location: s.location,
            role: i === 0 ? "start" : i === stops.length - 1 ? "end" : "via",
          },
        ]
      : [],
  );

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      <aside className="flex flex-col gap-4 border-stone-200 p-4 md:w-[26rem] md:overflow-y-auto md:border-r dark:border-stone-800">
        <header>
          <h1 className="text-brand text-xl font-bold">Bike Travelling Guide</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Every worthwhile stop along your exact route.
          </p>
        </header>

        <TripForm
          stops={stops}
          vehicle={vehicle}
          corridorKm={corridorKm}
          focusId={focusId}
          onStopsChange={setStops}
          onAddStop={addStop}
          onVehicleChange={setVehicle}
          onCorridorChange={setCorridorKm}
        />

        <section aria-live="polite" aria-busy={routeState.status === "loading"}>
          {routeState.status === "idle" && (
            <p className="text-sm text-stone-500">Choose a start and destination to see routes.</p>
          )}
          {routeState.status === "loading" && (
            <p className="text-sm text-stone-500">Finding routes…</p>
          )}
          {routeState.status === "error" && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {routeState.message}
            </p>
          )}
          {routeState.status === "ok" && (
            <RouteCards routes={routes} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </section>
      </aside>

      <div className="relative h-[60dvh] md:h-auto md:flex-1">
        <MapView
          routes={routes}
          selectedId={selectedId}
          onSelectRoute={setSelectedId}
          stops={mapStops}
        />
      </div>
    </div>
  );
}
