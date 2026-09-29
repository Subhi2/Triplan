"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import Map, {
  Marker,
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { LngLat } from "@/lib/geo";
import type { PlaceAlong } from "@/lib/places";
import type { RouteOption } from "@/lib/trip";
import {
  PLACE_CLUSTERS_LAYER,
  PLACE_POINTS_LAYER,
  PLACES_SOURCE,
  PlaceMarkers,
} from "./PlaceMarkers";
import { ROUTE_LAYER_IDS, RouteLayer } from "./RouteLayer";

// OpenFreeMap needs no API key. Set NEXT_PUBLIC_MAP_STYLE_URL to use MapTiler or another style.
const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

// Before a trip is chosen, frame India (places are imported for every state).
const INITIAL_VIEW = {
  bounds: [
    [68.1, 6.7],
    [97.4, 35.7],
  ] as [[number, number], [number, number]],
  fitBoundsOptions: { padding: 16 },
};
const INTERACTIVE_LAYERS = [...ROUTE_LAYER_IDS, PLACE_CLUSTERS_LAYER, PLACE_POINTS_LAYER];

export interface MapStop {
  id: string;
  label: string;
  location: LngLat;
  role: "start" | "via" | "end";
}

interface Props {
  routes: RouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  stops: MapStop[];
  places: PlaceAlong[];
  activePlaceId: string | null;
  hoverPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  onHoverPlace: (id: string | null) => void;
  /** Pixels hidden at the bottom (the mobile sheet), kept clear when framing. */
  bottomInset?: number;
  /** Called with the map centre and zoom after it loads and after every move. */
  onViewChange?: (center: LngLat, zoom: number) => void;
}

function bounds(points: LngLat[]): [LngLat, LngLat] | null {
  if (points.length === 0) return null;
  let [minLng, minLat] = points[0]!;
  let [maxLng, maxLat] = points[0]!;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function MapView(props: Props) {
  const { routes, stops, places, activePlaceId, bottomInset = 0 } = props;
  const mapRef = useRef<MapRef>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const hovered = useRef<string | null>(null);

  const padding = { top: 48, left: 48, right: 48, bottom: 48 + bottomInset };

  // Frame all routes when they change; with no routes yet, frame the stops.
  const frameKey =
    routes.length > 0 ? routes.map((r) => r.id).join() : stops.map((s) => s.id + s.location).join();
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points =
      routes.length > 0
        ? routes.flatMap((r) => r.geometry.coordinates as LngLat[])
        : stops.map((s) => s.location);
    const b = bounds(points);
    if (!b) return;
    if (points.length === 1) map.flyTo({ center: points[0], zoom: 10, duration: 600, padding });
    else map.fitBounds(b, { padding, duration: 600, maxZoom: 12 });
    // frameKey captures the inputs; re-running on every render would fight the user's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  // Pan to the active place if it is off screen (e.g. picked from the list).
  useEffect(() => {
    const map = mapRef.current;
    const place = places.find((p) => p.id === activePlaceId);
    if (!map || !place) return;
    if (!map.getBounds().contains(place.location)) {
      map.easeTo({
        center: place.location,
        zoom: Math.max(map.getZoom(), 10),
        padding,
        duration: 500,
      });
    }
    // Only when the active place changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaceId]);

  function setHover(id: string | null) {
    if (hovered.current !== id) {
      hovered.current = id;
      props.onHoverPlace(id);
    }
  }

  function handleMouseMove(e: MapLayerMouseEvent) {
    const f = e.features?.[0];
    setCursor(f ? "pointer" : undefined);
    const id: unknown = f?.layer.id === PLACE_POINTS_LAYER ? f.properties?.id : null;
    setHover(typeof id === "string" ? id : null);
  }

  async function handleClick(e: MapLayerMouseEvent) {
    const f = e.features?.[0];
    if (!f) return;
    const layer = f.layer.id;
    const id: unknown = f.properties?.id;
    if (layer === PLACE_POINTS_LAYER && typeof id === "string") {
      props.onSelectPlace(id);
    } else if (layer === PLACE_CLUSTERS_LAYER && f.geometry.type === "Point") {
      const map = mapRef.current;
      const source = map?.getSource(PLACES_SOURCE) as GeoJSONSource | undefined;
      const clusterId: unknown = f.properties?.cluster_id;
      if (!map || !source || typeof clusterId !== "number") return;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({ center: f.geometry.coordinates as LngLat, zoom, duration: 500 });
    } else if (typeof id === "string") {
      props.onSelectRoute(id);
    }
  }

  const highlightIds = [activePlaceId, props.hoverPlaceId].filter((x): x is string => !!x);

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={INTERACTIVE_LAYERS}
      cursor={cursor}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        setCursor(undefined);
        setHover(null);
      }}
      onClick={(e) => void handleClick(e)}
      onLoad={(e) => {
        const c = e.target.getCenter();
        props.onViewChange?.([c.lng, c.lat], e.target.getZoom());
      }}
      onMoveEnd={(e) =>
        props.onViewChange?.([e.viewState.longitude, e.viewState.latitude], e.viewState.zoom)
      }
    >
      <NavigationControl position="top-right" showCompass={false} />
      <RouteLayer routes={routes} selectedId={props.selectedRouteId} />
      <PlaceMarkers places={places} highlightIds={highlightIds} />
      {stops.map((s, i) => (
        <Marker key={s.id} longitude={s.location[0]} latitude={s.location[1]} anchor="center">
          <div
            title={s.label}
            className={`flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white px-1 text-xs font-bold text-white shadow ${
              s.role === "via" ? "bg-slate-600" : "bg-brand"
            }`}
          >
            {s.role === "start" ? "A" : s.role === "end" ? "B" : i}
          </div>
        </Marker>
      ))}
    </Map>
  );
}
