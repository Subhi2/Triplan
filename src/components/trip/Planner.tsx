"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { MapStop } from "@/components/map/MapView";
import { PlaceFilters } from "@/components/place/PlaceFilters";
import { PlaceList } from "@/components/place/PlaceList";
import { PlacePanel } from "@/components/place/PlacePanel";
import { placeRowId } from "@/components/place/PlaceRow";
import { usePlacesAlong } from "@/components/place/usePlacesAlong";
import { BottomSheet, SHEET_SNAPS, type SheetSnap } from "@/components/ui/BottomSheet";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { BEST_PER_STRETCH, bestAlongRoute, STRETCH_KM, type PlaceAlong } from "@/lib/places";
import type { CorridorKm, RouteOption, Vehicle } from "@/lib/trip";
import { parseTripUrl, serializeTripUrl, type DetourLimitKm, type UrlStop } from "@/lib/tripUrl";
import { RouteCards } from "./RouteCards";
import type { MapBias } from "./StopInput";
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
  const [openPlace, setOpenPlace] = useState<PlaceAlong | null>(null);
  const [stops, setStops] = useState<StopDraft[]>(() => [
    draft(initial.from),
    ...initial.via.map(draft),
    draft(initial.to),
  ]);
  const [vehicle, setVehicle] = useState<Vehicle>(initial.vehicle);
  const [corridorKm, setCorridorKm] = useState<CorridorKm>(initial.corridorKm);
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [maxDetourKm, setMaxDetourKm] = useState<DetourLimitKm | null>(initial.maxDetourKm);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<RouteState>({ status: "idle" });
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [hoverPlaceId, setHoverPlaceId] = useState<string | null>(null);
  // Where the map is looking, to bias place suggestions. Starts at the initial map view's centre.
  const [mapBias, setMapBias] = useState<MapBias>({ center: [76.75, 15.05], zoom: 5 });

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(1);
  // On mobile the form folds away once a full trip is loaded, leaving room for the map.
  const [formOpen, setFormOpen] = useState(() => !(initial.from && initial.to));

  // Keep the trip in the URL so it can be shared. replaceState avoids a server round trip.
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
    categories,
    maxDetourKm,
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
            stops: stops.flatMap((s) =>
              s.location ? [{ label: s.label, location: s.location }] : [],
            ),
            vehicle,
          })
        : null,
    // first and last are derived from stops.
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
        setSelectedRouteId(data.routes[0]?.id ?? null);
        setActivePlaceId(null);
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

  const routes = routeState.status === "ok" ? routeState.routes : [];
  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null;
  const placesState = usePlacesAlong(selectedRoute, corridorKm);

  // Category and detour filters apply in the browser; the list is already ordered by km.
  const allPlaces = useMemo(
    () => (placesState.status === "ok" ? placesState.places : []),
    [placesState],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>(categories.map((c) => [c, 0]));
    for (const p of allPlaces) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [allPlaces, categories]);
  const places = useMemo(() => {
    const matching = allPlaces.filter(
      (p) =>
        (categories.length === 0 || categories.includes(p.category)) &&
        (maxDetourKm === null || p.detourKm <= maxDetourKm),
    );
    // No category picked: the best stops only. A picked category shows every place in it.
    return categories.length === 0 ? bestAlongRoute(matching) : matching;
  }, [allPlaces, categories, maxDetourKm]);
  const hiddenCount =
    categories.length === 0
      ? allPlaces.filter((p) => maxDetourKm === null || p.detourKm <= maxDetourKm).length -
        places.length
      : 0;

  function addStop() {
    const s = draft(null);
    setStops((prev) => [...prev.slice(0, -1), s, ...prev.slice(-1)]);
    setFocusId(s.id);
  }

  function openPlaceDetail(p: PlaceAlong) {
    setActivePlaceId(p.id);
    setOpenPlace(p);
    if (!isDesktop && sheetSnap === 0) setSheetSnap(1);
  }

  function closePlaceDetail() {
    const id = openPlace?.id;
    setOpenPlace(null);
    // Back on the list, keyboard focus returns to the place's row.
    if (id) {
      requestAnimationFrame(() =>
        document.getElementById(placeRowId(id))?.querySelector("button")?.focus(),
      );
    }
  }

  function selectPlaceFromMap(id: string) {
    // With a place open, a marker opens that place; otherwise it picks its row in the list.
    const p = places.find((x) => x.id === id);
    if (openPlace && p) return openPlaceDetail(p);
    setActivePlaceId(id);
    if (!isDesktop && sheetSnap === 0) setSheetSnap(1);
  }

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

  const hasTrip = Boolean(first?.location && last?.location);
  const showForm = isDesktop || formOpen || !hasTrip;
  const sheetInset =
    !isDesktop && typeof window !== "undefined" ? SHEET_SNAPS[sheetSnap] * window.innerHeight : 0;

  const openAlong = openPlace ? (allPlaces.find((p) => p.id === openPlace.id) ?? null) : null;

  const panel = openPlace ? (
    <PlacePanel
      key={openPlace.slug}
      slug={openPlace.slug}
      name={openPlace.name}
      along={openAlong}
      vehicle={vehicle}
      onBack={closePlaceDetail}
    />
  ) : (
    <div className="flex flex-col gap-5">
      <section aria-label="Routes" aria-live="polite" aria-busy={routeState.status === "loading"}>
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
          <RouteCards routes={routes} selectedId={selectedRouteId} onSelect={setSelectedRouteId} />
        )}
      </section>

      {selectedRoute && (
        <section aria-labelledby="places-heading" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="places-heading" className="font-semibold">
              Places along this route
            </h2>
            <span className="text-xs text-stone-500">within {corridorKm} km</span>
          </div>
          {placesState.status === "loading" && (
            <p className="text-sm text-stone-500">Finding places…</p>
          )}
          {placesState.status === "error" && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {placesState.message}
            </p>
          )}
          {placesState.status === "ok" && (
            <>
              {allPlaces.length > 0 && (
                <PlaceFilters
                  counts={categoryCounts}
                  bestCount={
                    categories.length === 0 ? places.length : bestAlongRoute(allPlaces).length
                  }
                  selected={categories}
                  maxDetourKm={maxDetourKm}
                  onSelectedChange={setCategories}
                  onMaxDetourChange={setMaxDetourKm}
                />
              )}
              {places.length > 0 ? (
                <>
                  <PlaceList
                    places={places}
                    activeId={activePlaceId}
                    hoverId={hoverPlaceId}
                    onSelect={(id) => {
                      const p = places.find((x) => x.id === id);
                      if (p) openPlaceDetail(p);
                    }}
                    onHover={setHoverPlaceId}
                  />
                  {hiddenCount > 0 && (
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      Showing the best stops: up to {BEST_PER_STRETCH} every {STRETCH_KM} km. Pick a
                      category to see all {hiddenCount + places.length} places.
                    </p>
                  )}
                  <p className="text-xs text-stone-500">
                    Detours are straight-line distances from the route; the road may be longer.
                  </p>
                </>
              ) : (
                <p className="text-sm text-stone-500">
                  {allPlaces.length === 0
                    ? `No places within ${corridorKm} km of this route yet. Try a wider corridor.`
                    : "No places match these filters."}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="relative z-10 flex shrink-0 flex-col gap-4 border-stone-200 bg-(--background) p-4 shadow-sm md:w-[26rem] md:overflow-y-auto md:border-r md:shadow-none dark:border-stone-800">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-brand text-xl font-bold">Bike Travelling Guide</h1>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Every worthwhile stop along your exact route.
            </p>
          </div>
          {!isDesktop && hasTrip && (
            <button
              type="button"
              aria-expanded={showForm}
              onClick={() => setFormOpen((o) => !o)}
              className="shrink-0 rounded-md border border-stone-300 px-3 py-1 text-sm dark:border-stone-700"
            >
              {showForm ? "Done" : "Edit trip"}
            </button>
          )}
        </header>

        {showForm ? (
          <TripForm
            stops={stops}
            vehicle={vehicle}
            corridorKm={corridorKm}
            focusId={focusId}
            near={mapBias}
            onStopsChange={setStops}
            onAddStop={addStop}
            onVehicleChange={setVehicle}
            onCorridorChange={setCorridorKm}
          />
        ) : (
          <p className="truncate text-sm font-medium">
            {first?.label} → {last?.label}
            {stops.length > 2 && (
              <span className="font-normal text-stone-500">
                {" "}
                · {stops.length - 2} stop{stops.length > 3 ? "s" : ""}
              </span>
            )}
          </p>
        )}

        {isDesktop && panel}
      </aside>

      <div className="relative min-h-0 flex-1">
        <MapView
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          stops={mapStops}
          places={places}
          activePlaceId={activePlaceId}
          hoverPlaceId={hoverPlaceId}
          onSelectPlace={selectPlaceFromMap}
          onHoverPlace={setHoverPlaceId}
          onViewChange={(center, zoom) => setMapBias({ center, zoom })}
          bottomInset={sheetInset}
        />
      </div>

      {!isDesktop && (
        <BottomSheet label="Routes and places" snap={sheetSnap} onSnapChange={setSheetSnap}>
          {panel}
        </BottomSheet>
      )}
    </div>
  );
}
