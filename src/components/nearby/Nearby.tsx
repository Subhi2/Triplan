"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocate } from "@/components/geo/useLocate";
import { DynamicMapView as MapView } from "@/components/map/DynamicMapView";
import type { MapFrame, MapStop } from "@/components/map/types";
import { PlacePanel } from "@/components/place/PlacePanel";
import type { MapBias } from "@/components/trip/StopInput";
import { BottomSheet, SHEET_SNAPS, type SheetSnap } from "@/components/ui/BottomSheet";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { roundLngLat3, type LngLat } from "@/lib/geo";
import {
  MY_LOCATION,
  NEARBY_TOP,
  nearbyRank,
  parseNearbyUrl,
  rideThereHref,
  serializeNearbyUrl,
  topNearby,
  type NearbyOrigin,
  type PlaceNear,
  type ReachMinutes,
} from "@/lib/nearby";
import { SITE_NAME } from "@/lib/site";
import type { Vehicle } from "@/lib/trip";
import { NearbyFilters, NearbyList } from "./NearbyList";
import { nearbyRowId } from "./NearbyRow";
import { OriginBar } from "./OriginBar";
import { ReachChips } from "./ReachChips";
import { RideMode } from "./RideMode";
import { useNearbyPlaces } from "./useNearbyPlaces";

/** Height of the header floating over the map on phones, kept clear when framing. */
const FLOATING_HEADER_PX = 72;

const WITHIN_WORDS: Record<ReachMinutes, string> = {
  30: "30 min",
  60: "an hour",
  120: "2 hours",
  240: "half a day",
};

/** How the point searched around was chosen: it decides its name and its marker. */
type OriginSource = "gps" | "place" | "map";

/**
 * The Near me screen: well-known places the rider can reach from where they are (or from a typed
 * place, or a spot on the map) within a time on the road. See "Nearby search" in docs/02.
 */
export function Nearby() {
  const searchParams = useSearchParams();
  const [initial] = useState(() => parseNearbyUrl(new URLSearchParams(searchParams.toString())));
  const [origin, setOrigin] = useState<NearbyOrigin | null>(initial.at);
  const [source, setSource] = useState<OriginSource>(initial.at?.label ? "place" : "map");
  const [within, setWithin] = useState<ReachMinutes>(initial.within);
  const [vehicle, setVehicle] = useState<Vehicle>(initial.vehicle);
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [showAll, setShowAll] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [openPlace, setOpenPlace] = useState<PlaceNear | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [mapBias, setMapBias] = useState<MapBias>({ center: [76.75, 15.05], zoom: 5 });
  const { state: locateState, locate, reset: resetLocate } = useLocate();
  // Ride mode ("Ahead of you") covers the screen while on; focus returns to its button after.
  const [riding, setRiding] = useState(false);
  const rideButton = useRef<HTMLButtonElement>(null);
  const stopRiding = useCallback(() => {
    setRiding(false);
    requestAnimationFrame(() => rideButton.current?.focus());
  }, []);

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(1);

  // Keep the search in the URL so it can be shared (positions at 3 decimals, ~100 m).
  const query = serializeNearbyUrl({ at: origin, within, vehicle, categories });
  useEffect(() => {
    if (window.location.search !== `?${query}`) {
      window.history.replaceState(null, "", `/nearby?${query}`);
    }
  }, [query]);

  const nearby = useNearbyPlaces(origin?.location ?? null, within, vehicle);
  const all = useMemo(() => (nearby.status === "ok" ? nearby.data.places : []), [nearby]);
  const roadTimes = nearby.status === "ok" ? nearby.data.roadTimes : "osrm";

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>(categories.map((c) => [c, 0]));
    for (const p of all) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [all, categories]);
  // This month in the rider's own time, as the place details' month chart.
  const [month] = useState(() => new Date().getMonth() + 1);
  const top = useMemo(() => topNearby(all, (p) => nearbyRank(p, month)), [all, month]);
  const places = useMemo(() => {
    if (categories.length > 0) return all.filter((p) => categories.includes(p.category));
    return showAll ? all : top;
  }, [all, top, categories, showAll]);

  const originName =
    origin?.label ?? (origin ? (source === "gps" ? "Your location" : "Pinned spot") : null);

  function searchAround(at: NearbyOrigin, how: OriginSource) {
    setOrigin(at);
    setSource(how);
    setChoosing(false);
    setPicking(false);
    setOpenPlace(null);
    setActiveId(null);
    setShowAll(false);
    resetLocate();
    if (!isDesktop) setSheetSnap(1);
  }

  async function searchAroundMe() {
    const at = await locate();
    if (at) searchAround({ label: null, location: at }, "gps");
  }

  function startPicking() {
    setPicking(true);
    // Phones: the sheet steps aside so the map can be tapped.
    if (!isDesktop) setSheetSnap(0);
  }

  function openPlaceDetail(p: PlaceNear) {
    setActiveId(p.id);
    setOpenPlace(p);
    if (!isDesktop && sheetSnap === 0) setSheetSnap(1);
  }

  function closePlaceDetail() {
    const id = openPlace?.id;
    setOpenPlace(null);
    if (id) {
      requestAnimationFrame(() =>
        document.getElementById(nearbyRowId(id))?.querySelector("button")?.focus(),
      );
    }
  }

  function selectPlaceFromMap(id: string) {
    const p = places.find((x) => x.id === id);
    if (openPlace && p) return openPlaceDetail(p);
    setActiveId(id);
    if (!isDesktop && sheetSnap === 0) setSheetSnap(1);
  }

  // Frame the point while loading, then the point and its places once they arrive.
  const frame: MapFrame | null = origin
    ? {
        key: `${origin.location.join()}|${within}|${vehicle}|${nearby.status}|${all.length}`,
        points: [origin.location, ...places.map((p) => p.location)],
      }
    : null;
  const mapStops: MapStop[] =
    origin && source !== "gps"
      ? [{ id: "origin", label: originName ?? "", location: origin.location, role: "start" }]
      : [];
  const me = origin && source === "gps" ? { location: origin.location, headingDeg: null } : null;

  const sheetInset =
    !isDesktop && typeof window !== "undefined" ? SHEET_SNAPS[sheetSnap] * window.innerHeight : 0;

  const placePanel = openPlace && (
    <PlacePanel
      key={openPlace.slug}
      slug={openPlace.slug}
      name={openPlace.name}
      along={null}
      vehicle={vehicle}
      tripAction={
        origin && (
          <Link
            href={rideThereHref(
              {
                label: source === "gps" ? MY_LOCATION : (originName ?? "Start"),
                location: origin.location,
              },
              openPlace,
              vehicle,
            )}
            className="bg-brand hover:bg-brand-dark inline-flex min-h-12 items-center gap-2 rounded-xl px-5 font-bold text-white shadow-sm active:scale-[0.97] md:min-h-11"
          >
            {vehicle === "bike" ? "Ride there" : "Drive there"}
            <svg
              aria-hidden
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        )
      }
      onBack={closePlaceDetail}
    />
  );

  const results = origin && (
    <section
      aria-labelledby="nearby-heading"
      aria-busy={nearby.status === "loading"}
      className="flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="nearby-heading" className="font-display text-xl font-bold tracking-tight">
          Within {WITHIN_WORDS[within]} by {vehicle}
        </h2>
        {nearby.status === "ok" && (
          <span className="tabular font-mono text-xs text-stone-600 dark:text-stone-400">
            {all.length} {all.length === 1 ? "place" : "places"}
          </span>
        )}
      </div>
      {nearby.status === "loading" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-stone-600 dark:text-stone-400">Finding places in reach…</p>
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
      {nearby.status === "error" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {nearby.message}
        </p>
      )}
      {nearby.status === "ok" && (
        <>
          {roadTimes === "straight" && (
            <p
              role="status"
              className="bg-marigold-tint rounded-xl px-3 py-2 text-sm text-stone-800 dark:bg-amber-950 dark:text-amber-100"
            >
              Road times are unavailable right now, so these are straight-line distances. The road
              will be longer.
            </p>
          )}
          {all.length > 0 && (
            <NearbyFilters
              counts={categoryCounts}
              topCount={top.length}
              selected={categories}
              onSelectedChange={(c) => {
                setCategories(c);
                setShowAll(false);
              }}
            />
          )}
          {places.length > 0 ? (
            <>
              <NearbyList
                places={places}
                vehicle={vehicle}
                month={month}
                activeId={activeId}
                hoverId={hoverId}
                onSelect={(id) => {
                  const p = places.find((x) => x.id === id);
                  if (p) openPlaceDetail(p);
                }}
                onHover={setHoverId}
              />
              {categories.length === 0 && !showAll && all.length > NEARBY_TOP && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-(--surface) px-4 text-sm font-bold hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
                >
                  Show all {all.length} places
                </button>
              )}
              <p className="text-xs text-stone-600 dark:text-stone-400">
                {roadTimes === "osrm"
                  ? "Times are for the road there, without stops; allow extra on ghat roads."
                  : "Distances are in a straight line from the point searched around."}
              </p>
            </>
          ) : (
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {all.length === 0
                ? within < 240
                  ? `Nothing well-known within ${WITHIN_WORDS[within]} yet. Try a longer time.`
                  : "Nothing well-known within half a day yet."
                : "No places match these filters."}
            </p>
          )}
        </>
      )}
    </section>
  );

  const panel = placePanel ?? (
    <div
      className="flex flex-col gap-5"
      onFocusCapture={(e) => {
        // Phones: typing a place opens the sheet fully, clear of the on-screen keyboard.
        if (!isDesktop && coarsePointer && e.target instanceof HTMLInputElement) {
          if (e.target.type === "text") setSheetSnap(2);
        }
      }}
    >
      <OriginBar
        originName={originName}
        locate={locateState}
        choosing={choosing || !origin}
        picking={picking}
        near={mapBias}
        onLocate={() => void searchAroundMe()}
        onPickPlace={(r) => searchAround({ label: r.name, location: r.location }, "place")}
        onStartPicking={startPicking}
        onCancelPicking={() => {
          setPicking(false);
          if (!isDesktop) setSheetSnap(1);
        }}
        onChange={() => setChoosing(true)}
        onCancelChange={() => {
          setChoosing(false);
          resetLocate();
        }}
      />
      {!picking && (
        <button
          ref={rideButton}
          type="button"
          onClick={() => setRiding(true)}
          className="bg-brand-tint text-brand-dark inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold active:scale-[0.97] dark:bg-teal-950/60 dark:text-teal-200"
        >
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l7 18-7-4-7 4z" />
          </svg>
          Riding? See what&apos;s ahead
        </button>
      )}
      {origin && !choosing && !picking && (
        <ReachChips
          within={within}
          vehicle={vehicle}
          onWithinChange={setWithin}
          onVehicleChange={setVehicle}
        />
      )}
      {!choosing && !picking && results}
      {!origin && !picking && (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Temples, forts, viewpoints, waterfalls and lakes you can reach from here, by road time.
          Your location is only used for this search; it is never stored.
        </p>
      )}
    </div>
  );

  const floatingHeader = !isDesktop;

  return (
    <div className="relative flex h-dvh flex-col md:flex-row">
      <aside
        className={`z-10 flex shrink-0 flex-col gap-3 ${
          floatingHeader
            ? "absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-2xl border border-stone-200/80 bg-(--surface)/85 py-1.5 pr-1.5 pl-2 shadow-sm backdrop-blur-md dark:border-stone-700/80"
            : "relative overflow-y-auto border-r border-stone-200 bg-(--background) p-6 md:w-[26rem] dark:border-stone-800"
        }`}
      >
        <header className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href={`/?v=${vehicle}`}
              aria-label={`Back to the ${SITE_NAME} planner`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <svg
                aria-hidden
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="font-display text-xl leading-none font-extrabold tracking-tight md:text-3xl">
                Near me
              </h1>
              {!floatingHeader && (
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  Well-known places within reach, by road time.
                </p>
              )}
            </div>
          </div>
          <Link
            href="/trips"
            className="text-brand-dark inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-bold hover:underline dark:text-teal-300"
          >
            {floatingHeader ? "Trips" : "Your trips"}
          </Link>
        </header>
        {isDesktop && <div className="mt-3">{panel}</div>}
      </aside>

      <div className="relative min-h-0 flex-1">
        <MapView
          routes={[]}
          selectedRouteId={null}
          onSelectRoute={() => {}}
          stops={mapStops}
          places={places}
          activePlaceId={activeId}
          hoverPlaceId={hoverId}
          onSelectPlace={selectPlaceFromMap}
          onHoverPlace={setHoverId}
          onViewChange={(center: LngLat, zoom: number) => setMapBias({ center, zoom })}
          me={me}
          frame={frame}
          onMapClick={
            picking
              ? (at) => searchAround({ label: null, location: roundLngLat3(at) }, "map")
              : undefined
          }
          bottomInset={sheetInset}
          topInset={floatingHeader ? FLOATING_HEADER_PX : 0}
        />
      </div>

      {riding && <RideMode month={month} onStop={stopRiding} />}

      {!isDesktop && (
        <BottomSheet label="Places near you" snap={sheetSnap} onSnapChange={setSheetSnap}>
          {panel}
        </BottomSheet>
      )}
    </div>
  );
}
