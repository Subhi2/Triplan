"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapStop } from "@/components/map/MapView";
import { PlaceFilters } from "@/components/place/PlaceFilters";
import { PlaceList } from "@/components/place/PlaceList";
import { PlacePanel } from "@/components/place/PlacePanel";
import { placeRowId } from "@/components/place/PlaceRow";
import { usePlacesAlong } from "@/components/place/usePlacesAlong";
import { BottomSheet, SHEET_SNAPS, type SheetSnap } from "@/components/ui/BottomSheet";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import type { LngLat } from "@/lib/geo";
import { googleMapsTripUrl } from "@/lib/googleMaps";
import { BEST_PER_STRETCH, bestAlongRoute, STRETCH_KM, type PlaceAlong } from "@/lib/places";
import { defaultDeparture } from "@/lib/rideCheck";
import type { SavedTrip, TripPlan } from "@/lib/savedTrip";
import {
  MAX_VIA_STOPS,
  stopIndexAt,
  viaInsertIndex,
  type CorridorKm,
  type RouteOption,
  type Vehicle,
} from "@/lib/trip";
import { parseTripUrl, serializeTripUrl, type DetourLimitKm, type UrlStop } from "@/lib/tripUrl";
import { AddToTrip, type PlaceInTrip } from "./AddToTrip";
import { GoogleMapsBar } from "./GoogleMapsBar";
import { RideCheck } from "./RideCheck";
import { RouteCards } from "./RouteCards";
import type { MapBias } from "./StopInput";
import { TripForm, type StopDraft } from "./TripForm";
import { TripSaveBar } from "./TripSaveBar";

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

interface Props {
  /** A saved trip to open (/trips/[id]). */
  savedTrip?: SavedTrip | null;
}

export function Planner({ savedTrip = null }: Props) {
  const searchParams = useSearchParams();
  const [initial] = useState(() => {
    const fromUrl = parseTripUrl(new URLSearchParams(searchParams.toString()));
    // A saved trip opens as saved, unless the URL already holds the planner's state (a reload).
    if (!savedTrip || fromUrl.from || fromUrl.to) return fromUrl;
    const [from, ...via] = savedTrip.stops;
    const to = via.pop();
    return {
      ...fromUrl,
      from: from ?? null,
      via,
      to: to ?? null,
      vehicle: savedTrip.vehicle,
      corridorKm: savedTrip.corridorKm,
    };
  });
  const [saved, setSaved] = useState<SavedTrip | null>(savedTrip);
  // Reopening a saved trip selects the route option it was saved with, once.
  const preferredRouteId = useRef(savedTrip?.routeId ?? null);
  const [openPlace, setOpenPlace] = useState<PlaceAlong | null>(null);
  // Places ticked to open in Google Maps as stops, with the trip.
  const [picked, setPicked] = useState<PlaceAlong[]>([]);
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
  // When the rider sets off, for the ride check and the weather on the way. Local time.
  const [departure, setDeparture] = useState(() => defaultDeparture());
  // Where the map is looking, to bias place suggestions. Starts at the initial map view's centre.
  const [mapBias, setMapBias] = useState<MapBias>({ center: [76.75, 15.05], zoom: 5 });

  const isDesktop = useMediaQuery("(min-width: 768px)");
  // A touch screen: typing brings up an on-screen keyboard.
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(1);
  // On mobile the form folds away once a full trip is loaded, leaving room for the map.
  const [formOpen, setFormOpen] = useState(() => !(initial.from && initial.to));
  // A stop field has focus: on phones the sheet steps aside for the keyboard and suggestions.
  const [typing, setTyping] = useState(false);

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
        const preferred = data.routes.find((r) => r.id === preferredRouteId.current);
        preferredRouteId.current = null;
        setSelectedRouteId((preferred ?? data.routes[0])?.id ?? null);
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

  // "Add to trip": a place becomes a via stop, placed in route order.
  const stopLocations = stops.map((s) => s.location);

  function placeInTrip(location: LngLat): PlaceInTrip {
    const i = stopIndexAt(stopLocations, location);
    if (i === 0) return { kind: "start" };
    if (i === stops.length - 1) return { kind: "end" };
    if (i > 0) return { kind: "via", stopNumber: i };
    return stops.length - 2 >= MAX_VIA_STOPS ? { kind: "full" } : { kind: "add" };
  }

  function addToTrip({ name, location }: { name: string; location: LngLat }) {
    const line = (selectedRoute?.geometry.coordinates ?? []) as LngLat[];
    const index =
      line.length > 1 ? viaInsertIndex(stopLocations, line, location) : stops.length - 1;
    setStops([
      ...stops.slice(0, index),
      { id: newId(), label: name, location },
      ...stops.slice(index),
    ]);
  }

  function removeFromTrip(location: LngLat) {
    const i = stopIndexAt(stopLocations, location);
    if (i > 0 && i < stops.length - 1) setStops(stops.filter((_, j) => j !== i));
  }

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);
  function setPlacePicked(place: PlaceAlong, on: boolean) {
    setPicked((prev) =>
      on
        ? [...prev.filter((p) => p.id !== place.id), place]
        : prev.filter((p) => p.id !== place.id),
    );
  }
  const googleTrip = googleMapsTripUrl(
    stops.flatMap((s) => (s.location ? [s.location] : [])),
    picked.map((p) => p.location),
    (selectedRoute?.geometry.coordinates ?? []) as LngLat[],
  );

  // The trip as shown, for saving: resolved stops and the selected route.
  const plan: TripPlan | null =
    selectedRoute && first?.location && last?.location
      ? {
          stops: stops.flatMap((s) =>
            s.location ? [{ label: s.label, location: s.location }] : [],
          ),
          vehicle,
          corridorKm,
          route: {
            id: selectedRoute.id,
            geometry: selectedRoute.geometry as TripPlan["route"]["geometry"],
            distanceKm: selectedRoute.distanceKm,
            durationMin: selectedRoute.durationMin,
            viaLabel: selectedRoute.viaLabel,
          },
        }
      : null;
  const defaultTitle = `${first?.label ?? ""} → ${last?.label ?? ""}${
    selectedRoute ? ` ${selectedRoute.viaLabel}` : ""
  }`.slice(0, 120);

  function onSaved(trip: SavedTrip) {
    setSaved(trip);
    // The trip's own link from now on; the query string keeps the planner's state for reloads.
    const url = `/trips/${trip.id}?${query}`;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.replaceState(null, "", url);
    }
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
  const compactHeader = !isDesktop && hasTrip;
  // Phones: no sheet until there is a trip to show (the map gets the room), and none while the
  // on-screen keyboard is up. Elsewhere the form rises above the sheet while typing instead.
  const sheetShown = !isDesktop && routeState.status !== "idle" && !(typing && coarsePointer);
  const sheetInset =
    sheetShown && typeof window !== "undefined" ? SHEET_SNAPS[sheetSnap] * window.innerHeight : 0;

  function toggleForm() {
    // Editing on a phone: the sheet drops to its smallest size so the map stays in view.
    const open = !showForm;
    setFormOpen(open);
    setSheetSnap(open ? 0 : 1);
    if (!open) setTyping(false);
  }

  const [hadTrip, setHadTrip] = useState(hasTrip);
  if (hasTrip !== hadTrip) {
    setHadTrip(hasTrip);
    if (hasTrip && !isDesktop && formOpen && stops.length === 2) {
      setFormOpen(false);
      setTyping(false);
      setSheetSnap(1);
    }
  }

  const openAlong = openPlace ? (allPlaces.find((p) => p.id === openPlace.id) ?? null) : null;

  const panel = openPlace ? (
    <PlacePanel
      key={openPlace.slug}
      slug={openPlace.slug}
      name={openPlace.name}
      along={openAlong}
      vehicle={vehicle}
      tripAction={
        <>
          <AddToTrip
            status={placeInTrip(openPlace.location)}
            onAdd={() => addToTrip(openPlace)}
            onRemove={() => removeFromTrip(openPlace.location)}
          />
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-0">
            <input
              type="checkbox"
              checked={pickedIds.has(openPlace.id)}
              onChange={(e) => setPlacePicked(openPlace, e.target.checked)}
              className="accent-brand h-5 w-5 md:h-4 md:w-4"
            />
            Tick for Google Maps
          </label>
        </>
      }
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
      {(saved || plan) && (
        <TripSaveBar saved={saved} plan={plan} defaultTitle={defaultTitle} onSaved={onSaved} />
      )}
      {selectedRoute && first?.location && last?.location && (
        <RideCheck
          route={selectedRoute}
          vehicle={vehicle}
          from={{ label: first.label, location: first.location }}
          to={{ label: last.label, location: last.location }}
          departure={departure}
          onDepartureChange={setDeparture}
        />
      )}

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
                    pickedIds={pickedIds}
                    onPickedChange={setPlacePicked}
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
      {selectedRoute && (
        <GoogleMapsBar
          trip={googleTrip}
          pickedCount={picked.length}
          onClear={() => setPicked([])}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside
        className={`relative flex shrink-0 flex-col gap-3 border-stone-200 bg-(--background) px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 shadow-sm md:w-[26rem] md:gap-4 md:overflow-y-auto md:border-r md:p-4 md:shadow-none dark:border-stone-800 ${typing ? "z-30" : "z-10"}`}
      >
        <header className="flex items-center justify-between gap-2">
          {/* Phones with a trip: one row, the trip itself in place of the app's name. */}
          {compactHeader ? (
            <div className="min-w-0">
              <h1 className="sr-only">Bike Travelling Guide</h1>
              <p className="truncate font-semibold">
                {first?.label} → {last?.label}
              </p>
              {stops.length > 2 && (
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  {stops.length - 2} stop{stops.length > 3 ? "s" : ""} on the way
                </p>
              )}
            </div>
          ) : (
            <div className="min-w-0">
              <h1 className="text-brand text-lg font-bold md:text-xl">Bike Travelling Guide</h1>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Every worthwhile stop along your exact route.
              </p>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/trips"
              className="text-brand inline-flex min-h-11 items-center px-2 text-sm font-medium hover:underline"
            >
              {compactHeader ? "Trips" : "Saved trips"}
            </Link>
            {!isDesktop && hasTrip && (
              <button
                type="button"
                aria-expanded={showForm}
                onClick={toggleForm}
                className="min-h-11 rounded-md border border-stone-300 px-3 text-sm font-medium dark:border-stone-700"
              >
                {showForm ? "Done" : "Edit trip"}
              </button>
            )}
          </div>
        </header>

        {showForm ? (
          <div
            onFocusCapture={(e) => {
              if (e.target instanceof HTMLInputElement && e.target.type === "text") setTyping(true);
            }}
            onBlurCapture={() => setTyping(false)}
          >
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
          </div>
        ) : null}

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
        <BottomSheet
          label="Routes and places"
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          hidden={!sheetShown}
        >
          {panel}
        </BottomSheet>
      )}
    </div>
  );
}
