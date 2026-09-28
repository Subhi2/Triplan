"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import type { LngLat } from "@/lib/geo";
import type { RouteOption } from "@/lib/trip";
import { ROUTE_LAYER_IDS, RouteLayer } from "./RouteLayer";

// OpenFreeMap needs no API key. Set NEXT_PUBLIC_MAP_STYLE_URL to use MapTiler or another style.
const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

const KARNATAKA = { longitude: 76.2, latitude: 13.2, zoom: 6.3 };

export interface MapStop {
  id: string;
  label: string;
  location: LngLat;
  role: "start" | "via" | "end";
}

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
  onSelectRoute: (id: string) => void;
  stops: MapStop[];
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

export function MapView({ routes, selectedId, onSelectRoute, stops }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [hoverRoute, setHoverRoute] = useState(false);

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
    if (points.length === 1) map.flyTo({ center: points[0], zoom: 10, duration: 600 });
    else map.fitBounds(b, { padding: 48, duration: 600, maxZoom: 12 });
    // frameKey captures the inputs; re-running on every render would fight the user's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  return (
    <Map
      ref={mapRef}
      initialViewState={KARNATAKA}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={ROUTE_LAYER_IDS}
      cursor={hoverRoute ? "pointer" : undefined}
      onMouseEnter={() => setHoverRoute(true)}
      onMouseLeave={() => setHoverRoute(false)}
      onClick={(e) => {
        const id: unknown = e.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRoute(id);
      }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <RouteLayer routes={routes} selectedId={selectedId} />
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
