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
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import type { LngLat } from "@/lib/geo";
import {
  PLACE_CLUSTERS_LAYER,
  PLACE_HIT_LAYER,
  PLACE_POINTS_LAYER,
  PLACE_TAP_LAYERS,
  PLACES_SOURCE,
  PlaceMarkers,
} from "./PlaceMarkers";
import { ROUTE_LAYER_IDS, RouteLayer } from "./RouteLayer";
import { CursorDot } from "./CursorDot";
import { MeDot } from "./MeDot";
import { ServicePins } from "./ServicePins";
import { bounds, frameKey, framePoints, INDIA_BOUNDS, type MapViewProps } from "./types";

export type { MapStop } from "./types";

// OpenFreeMap needs no API key. Set NEXT_PUBLIC_MAP_STYLE_URL to use MapTiler or another style.
const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

// Before a trip is chosen, frame India (places are imported for every state).
const INITIAL_VIEW = { bounds: INDIA_BOUNDS, fitBoundsOptions: { padding: 16 } };
const INTERACTIVE_LAYERS = [
  ...ROUTE_LAYER_IDS,
  PLACE_CLUSTERS_LAYER,
  PLACE_HIT_LAYER,
  PLACE_POINTS_LAYER,
];

/** The MapLibre map (OpenStreetMap tiles): used when no Google key is set. */
export function MapView(props: MapViewProps) {
  const { routes, stops, places, activePlaceId, bottomInset = 0, topInset = 0 } = props;
  const mapRef = useRef<MapRef>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const hovered = useRef<string | null>(null);
  const coarsePointer = useMediaQuery("(pointer: coarse)");

  const padding = { top: 48 + topInset, left: 48, right: 48, bottom: 48 + bottomInset };

  // Frame all routes when they change; with no routes yet, the given frame or the stops.
  const frame = frameKey(routes, stops, props.frame);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points = framePoints(routes, stops, props.frame);
    const b = bounds(points);
    if (!b) return;
    if (points.length === 1) map.flyTo({ center: points[0], zoom: 10, duration: 600, padding });
    else map.fitBounds(b, { padding, duration: 600, maxZoom: 12 });
    // frame captures the inputs; re-running on every render would fight the user's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

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
    const id: unknown = f && PLACE_TAP_LAYERS.includes(f.layer.id) ? f.properties?.id : null;
    setHover(typeof id === "string" ? id : null);
  }

  async function handleClick(e: MapLayerMouseEvent) {
    const f = e.features?.[0];
    if (!f) {
      props.onMapClick?.([e.lngLat.lng, e.lngLat.lat]);
      return;
    }
    const layer = f.layer.id;
    const id: unknown = f.properties?.id;
    if (PLACE_TAP_LAYERS.includes(layer) && typeof id === "string") {
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
      attributionControl={{ compact: true }}
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
      {/* Touch screens pinch to zoom; the buttons would only cover the map. */}
      {!coarsePointer && <NavigationControl position="top-right" showCompass={false} />}
      <RouteLayer routes={routes} selectedId={props.selectedRouteId} />
      {props.servicePins && props.servicePins.length > 0 && (
        <ServicePins pins={props.servicePins} />
      )}
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
      {props.me && (
        <Marker longitude={props.me.location[0]} latitude={props.me.location[1]} anchor="center">
          <MeDot headingDeg={props.me.headingDeg} />
        </Marker>
      )}
      {props.cursor && (
        <Marker longitude={props.cursor[0]} latitude={props.cursor[1]} anchor="center">
          <CursorDot />
        </Marker>
      )}
    </Map>
  );
}
