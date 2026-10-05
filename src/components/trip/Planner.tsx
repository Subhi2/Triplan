"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DynamicMapView as MapView } from "@/components/map/DynamicMapView";
import type { MapStop } from "@/components/map/types";
import { PlaceFilters } from "@/components/place/PlaceFilters";
import { PlaceList } from "@/components/place/PlaceList";
import { PlacePanel } from "@/components/place/PlacePanel";
import { placeRowId } from "@/components/place/PlaceRow";
import { usePlacesAlong } from "@/components/place/usePlacesAlong";
import { BottomSheet, SHEET_SNAPS, type SheetSnap } from "@/components/ui/BottomSheet";
import { DynamicRidePreview } from "@/components/ride/DynamicRidePreview";
import { FamousRidesStrip } from "@/components/ride/FamousRidesStrip";
import { PreviewButton } from "@/components/ride/PreviewButton";
import { StoryShare } from "@/components/ride/StoryShare";
import { DaySplit } from "@/components/route/DaySplit";
import { RouteProfile } from "@/components/route/RouteProfile";
import { SafetyStops } from "@/components/route/SafetyStops";
import { useDayPlan } from "@/components/route/useDayPlan";
import { useSafetyAlong } from "@/components/route/useSafetyAlong";
import { useRouteProfiles } from "@/components/route/useRouteProfiles";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { categoryStyle } from "@/lib/categories";
import { pointAtKm, type LngLat } from "@/lib/geo";
import { googleMapsTripUrl } from "@/lib/googleMaps";
import { gpxFileName, sliceLine, tripGpx } from "@/lib/gpx";
import { DEFAULT_RIDE_HOURS, suggestDays, type RideHours } from "@/lib/multiDay";
import { BEST_PER_STRETCH, bestAlongRoute, STRETCH_KM, type PlaceAlong } from "@/lib/places";
import { defaultDeparture } from "@/lib/rideCheck";
import type { SafetyKind } from "@/lib/safety";
import type { RideSummary } from "@/lib/rides";
import { tripHeadline } from "@/lib/site";
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
import { PlainWordsBox } from "./PlainWordsBox";
import { PlannerHeader } from "./PlannerHeader";
import { RideCheck } from "./RideCheck";
import { RoadStrip } from "./RoadStrip";
import { RouteCards } from "./RouteCards";
import type { MapBias } from "./StopInput";
import { TripForm, type StopDraft } from "./TripForm";
import { TripSaveBar } from "./TripSaveBar";

/** Height of the header floating over the map on phones, kept clear when framing the route. */
const FLOATING_HEADER_PX = 72;

/** Places in a GPX file at most: GPS units slow down with thousands of waypoints. */
const MAX_GPX_PLACES = 300;

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
  /** Rides offered as "Try a famous ride" while there is no trip. */
  famousRides?: RideSummary[];
  /** Whether "plan in plain words" is switched on (the AI key is set). */
  aiEnabled?: boolean;
}

export function Planner({ savedTrip = null, famousRides = [], aiEnabled = false }: Props) {
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
  // The multi-day split: riding hours a day (null = the vehicle's default) and days (null = as
  // many as the route needs).
  const [rideHours, setRideHours] = useState<RideHours | null>(initial.rideHours);
  const [dayCount, setDayCount] = useState<number | null>(initial.days);
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
  // Wide enough for the places in a column of their own, next to the routes.
  const isWide = useMediaQuery("(min-width: 1024px)");
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
    rideHours,
    days: dayCount,
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
  const profiles = useRouteProfiles(routes, selectedRouteId);
  const climbM = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(profiles).flatMap(([id, p]) =>
          p.status === "ok" ? [[id, p.profile.ascentM]] : [],
        ),
      ),
    [profiles],
  );
  // The elevation chart's scrubber, for the selected route only.
  const [scrub, setScrub] = useState<{ routeId: string; km: number } | null>(null);
  const scrubKm = scrub && scrub.routeId === selectedRouteId ? scrub.km : null;
  // Safety stops along the selected route, and the kind picked to list and pin.
  const safety = useSafetyAlong(selectedRoute);
  const [safetyPick, setSafetyPick] = useState<{ routeId: string; kind: SafetyKind } | null>(null);
  const safetyKind = safetyPick && safetyPick.routeId === selectedRouteId ? safetyPick.kind : null;
  const servicePins =
    safety.status === "ok" && safetyKind
      ? safety.summary.points.filter((p) => p.kind === safetyKind)
      : undefined;
  const hoursPerDay = rideHours ?? DEFAULT_RIDE_HOURS[vehicle];
  const suggestedDays = selectedRoute ? suggestDays(selectedRoute.durationMin, hoursPerDay) : 1;
  const days = dayCount ?? suggestedDays;
  const dayState = useDayPlan(selectedRoute, hoursPerDay, dayCount, days > 1);
  const dayPlan =
    days > 1 && dayState.status === "ok" && dayState.routeId === selectedRouteId
      ? dayState.plan
      : null;
  const nights = dayPlan ? dayPlan.legs.slice(0, -1).map((l) => l.end) : [];
  const [previewOpen, setPreviewOpen] = useState(false);
  const closePreview = useCallback(() => setPreviewOpen(false), []);
  const mapCursor =
    scrubKm !== null && selectedRoute
      ? pointAtKm(selectedRoute.geometry.coordinates as LngLat[], scrubKm)
      : null;

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

  /**
   * The trip as a GPX file: the route, the stops, and the ticked places (or, with none ticked,
   * the places in the list), for navigating offline in OsmAnd, Organic Maps or a GPS unit.
   */
  function downloadGpx() {
    if (!selectedRoute) return;
    const resolved = stops.flatMap((s) => (s.location ? [{ ...s, location: s.location }] : []));
    const title = saved?.title ?? tripHeadline(resolved.map((s) => s.label));
    const line = selectedRoute.geometry.coordinates as LngLat[];
    const short = (label: string) => label.split(",")[0]!.trim();
    const nightName = (i: number) =>
      nights[i]?.name ?? `km ${Math.round(nights[i]?.kmFromStart ?? 0)}`;
    const gpx = tripGpx({
      name: title,
      link: saved ? `${window.location.origin}/trips/${saved.id}` : window.location.href,
      route: line,
      days: dayPlan?.legs.map((l, i) => ({
        name: `Day ${l.day}: ${i === 0 ? short(resolved[0]!.label) : nightName(i - 1)} → ${
          l.end.kind === "destination" ? short(resolved.at(-1)!.label) : nightName(i)
        }`,
        route: sliceLine(line, l.fromKm, l.toKm),
      })),
      nights: nights.flatMap((n, i) => [
        {
          name: `Night ${i + 1}: ${nightName(i)}`,
          location: n.location,
          description: `${n.stayCount} stays within 5 km · km ${Math.round(n.kmFromStart)}`,
          symbol: "Lodging",
        },
        ...n.stays.map((st) => ({
          name: st.name,
          location: st.location,
          description: `Stay · night ${i + 1} · ${st.distanceKm.toFixed(1)} km${st.phone ? ` · ${st.phone}` : ""}`,
          symbol: "Lodging",
        })),
      ]),
      stops: resolved.map((s, i) => {
        const role = i === 0 ? "Start" : i === resolved.length - 1 ? "Destination" : `Stop ${i}`;
        return {
          name: s.label,
          location: s.location,
          description: role,
          symbol: i === 0 ? "Flag, Green" : i === resolved.length - 1 ? "Flag, Red" : "Flag, Blue",
        };
      }),
      places: (picked.length > 0 ? picked : places).slice(0, MAX_GPX_PLACES).map((p) => ({
        name: p.name,
        location: p.location,
        description: `${categoryStyle(p.category).name} · km ${Math.round(p.kmFromStart)}`,
        symbol: "Scenic Area",
      })),
    });
    const url = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = gpxFileName(title);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

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
  const destination = (last?.label ?? "").split(",")[0]!.trim();

  const placePanel = openPlace && (
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
  );

  const routesPanel = (
    <div className="flex flex-col gap-5">
      <section aria-label="Routes" aria-live="polite" aria-busy={routeState.status === "loading"}>
        {routeState.status === "idle" && (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Choose a start and destination to see routes.
          </p>
        )}
        {routeState.status === "loading" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-stone-600 dark:text-stone-400">Finding routes…</p>
            <div aria-hidden className="shimmer h-24 rounded-2xl" />
            <div aria-hidden className="shimmer h-16 rounded-2xl opacity-70" />
          </div>
        )}
        {routeState.status === "error" && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {routeState.message}
          </p>
        )}
        {routeState.status === "ok" && (
          <>
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-bold tracking-tight">
                {routes.length === 1 ? "1 way" : `${routes.length} ways`} to {destination}
              </h2>
              <span className="text-xs whitespace-nowrap text-stone-600 dark:text-stone-400">
                {vehicle === "bike" ? "Bike" : "Car"} · within {corridorKm} km
              </span>
            </div>
            <RouteCards
              routes={routes}
              selectedId={selectedRouteId}
              onSelect={setSelectedRouteId}
              climbM={climbM}
            />
          </>
        )}
      </section>
      {selectedRoute && (
        <RouteProfile
          key={selectedRoute.id}
          state={profiles[selectedRoute.id]}
          ghats={selectedRoute.roadMix?.ghats ?? []}
          cursorKm={scrubKm}
          onCursorChange={(km) => setScrub(km === null ? null : { routeId: selectedRoute.id, km })}
          markKm={allPlaces.find((p) => p.id === (hoverPlaceId ?? activePlaceId))?.kmFromStart}
        />
      )}
      {selectedRoute && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <PreviewButton onClick={() => setPreviewOpen(true)} />
          <StoryShare
            storyUrl={`/og/story?route=${selectedRoute.id}&${query}`}
            title={tripHeadline(stops.flatMap((st) => (st.location ? [st.label] : [])))}
            link={typeof window === "undefined" ? "" : window.location.href}
          />
        </div>
      )}
      {selectedRoute && (
        <DaySplit
          state={dayState}
          days={days}
          suggestedDays={suggestedDays}
          hoursPerDay={hoursPerDay}
          destination={destination}
          onHoursChange={(h) => {
            setRideHours(h === DEFAULT_RIDE_HOURS[vehicle] ? null : h);
            setDayCount(null);
          }}
          onDaysChange={setDayCount}
        />
      )}
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
          hospitalGap={
            safety.status === "ok" && safety.summary.counts.hospital > 0
              ? safety.summary.longestGap.hospital
              : null
          }
        />
      )}
    </div>
  );

  const placesPanel = selectedRoute && (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="places-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="places-heading" className="font-display text-xl font-bold tracking-tight">
            Along the road
          </h2>
          <span className="tabular font-mono text-xs text-stone-600 dark:text-stone-400">
            0 – {Math.round(selectedRoute.distanceKm)} km
          </span>
        </div>
        <RoadStrip
          route={selectedRoute}
          places={places}
          activePlaceId={activePlaceId}
          hoverPlaceId={hoverPlaceId}
          nights={nights.map((n) => ({ km: n.kmFromStart, name: n.name }))}
        />
        <SafetyStops
          state={safety}
          selected={safetyKind}
          onSelect={(kind) =>
            setSafetyPick(kind && selectedRoute ? { routeId: selectedRoute.id, kind } : null)
          }
        />
        {placesState.status === "loading" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-stone-600 dark:text-stone-400">Finding places…</p>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden
                className="shimmer h-14 rounded-xl"
                style={{ opacity: 1 - i * 0.25 }}
              />
            ))}
          </div>
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
                  nights={nights.map((n, i) => ({
                    km: n.kmFromStart,
                    label: `Night in ${n.name ?? `km ${Math.round(n.kmFromStart)}`} · day ${i + 2}`,
                  }))}
                />
                {hiddenCount > 0 && (
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Showing the best stops: up to {BEST_PER_STRETCH} every {STRETCH_KM} km. Pick a
                    category to see all {hiddenCount + places.length} places.
                  </p>
                )}
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  Detours are straight-line distances from the route; the road may be longer.
                </p>
              </>
            ) : (
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {allPlaces.length === 0
                  ? `No places within ${corridorKm} km of this route yet. Try a wider corridor.`
                  : "No places match these filters."}
              </p>
            )}
          </>
        )}
      </section>
      <GoogleMapsBar
        trip={googleTrip}
        pickedCount={picked.length}
        onClear={() => setPicked([])}
        onDownloadGpx={downloadGpx}
      />
    </div>
  );

  // Wide screens: trip and routes | places | map. Narrower: one side panel, or the phone sheet.
  const secondColumn = isWide ? (placePanel ?? placesPanel) : null;
  const sidePanel = isWide
    ? routesPanel
    : (placePanel ?? (
        <div className="flex flex-col gap-6">
          {routesPanel}
          {placesPanel}
        </div>
      ));
  // Phones with a trip: the header floats over the map instead of pushing it down.
  const floatingHeader = compactHeader && !showForm;

  return (
    <div className="relative flex h-dvh flex-col md:flex-row">
      <aside
        className={`flex shrink-0 flex-col gap-3 ${
          floatingHeader
            ? "absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-2xl border border-stone-200/80 bg-(--surface)/85 py-1.5 pr-1.5 pl-4 shadow-sm backdrop-blur-md dark:border-stone-700/80"
            : "relative bg-(--background) px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 shadow-sm md:w-[26rem] md:gap-5 md:overflow-y-auto md:border-r md:border-stone-200 md:p-6 md:shadow-none lg:w-[24rem] dark:md:border-stone-800"
        } ${typing ? "z-30" : "z-10"}`}
      >
        <PlannerHeader
          compact={compactHeader}
          fromLabel={first?.label ?? ""}
          toLabel={last?.label ?? ""}
          vehicle={vehicle}
          corridorKm={corridorKm}
          viaCount={stops.length - 2}
          formToggle={!isDesktop && hasTrip ? { open: showForm, onToggle: toggleForm } : null}
        />

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

        {!hasTrip && !typing && (
          <>
            {aiEnabled && <PlainWordsBox near={mapBias.center} />}
            <FamousRidesStrip rides={famousRides} />
            <p className="flex gap-3 text-xs text-stone-600 dark:text-stone-400">
              <Link
                href="/about"
                className="inline-flex min-h-11 items-center underline md:min-h-0"
              >
                About Triplan
              </Link>
              <a
                href="https://github.com/Subhi2/Triplan"
                className="inline-flex min-h-11 items-center underline md:min-h-0"
              >
                Code on GitHub
              </a>
            </p>
          </>
        )}

        {isDesktop && sidePanel}
      </aside>

      {secondColumn && (
        <aside
          aria-label={placePanel ? "Place" : "Places along the road"}
          className="relative w-[26rem] shrink-0 overflow-y-auto border-r border-stone-200 bg-(--surface) px-4 pt-6 dark:border-stone-800"
        >
          {secondColumn}
        </aside>
      )}

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
          cursor={mapCursor}
          servicePins={servicePins}
          bottomInset={sheetInset}
          topInset={floatingHeader ? FLOATING_HEADER_PX : 0}
        />
      </div>

      {previewOpen && selectedRoute && (
        <DynamicRidePreview
          title={tripHeadline(stops.flatMap((st) => (st.location ? [st.label] : [])))}
          geometry={selectedRoute.geometry}
          ghats={selectedRoute.roadMix?.ghats ?? []}
          hairpinKm={selectedRoute.curvature?.hairpinKm ?? []}
          profile={(() => {
            const p = profiles[selectedRoute.id];
            return p?.status === "ok" ? p.profile : null;
          })()}
          places={places}
          onClose={closePreview}
        />
      )}

      {!isDesktop && (
        <BottomSheet
          label="Routes and places"
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          hidden={!sheetShown}
        >
          {sidePanel}
        </BottomSheet>
      )}
    </div>
  );
}
