import type { LngLat } from "@/lib/geo";
import type { PlaceAlong } from "@/lib/places";
import type { RouteOption } from "@/lib/trip";

// Props shared by the MapLibre map (MapView) and the Google map (google/GoogleMapView), so the
// planner can use either (docs/02, "Google Maps Platform").

export interface MapStop {
  id: string;
  label: string;
  location: LngLat;
  role: "start" | "via" | "end";
}

export interface MapViewProps {
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
  /** Pixels hidden at the top (the header floating over the map on phones). */
  topInset?: number;
  /** Called with the map centre and zoom after it loads and after every move. */
  onViewChange?: (center: LngLat, zoom: number) => void;
}

/** Before a trip is chosen, frame India (places are imported for every state). */
export const INDIA_BOUNDS: [LngLat, LngLat] = [
  [68.1, 6.7],
  [97.4, 35.7],
];

export function bounds(points: LngLat[]): [LngLat, LngLat] | null {
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

/** What to frame: all routes once there are some, else the stops. */
export function framePoints(routes: RouteOption[], stops: MapStop[]): LngLat[] {
  return routes.length > 0
    ? routes.flatMap((r) => r.geometry.coordinates as LngLat[])
    : stops.map((s) => s.location);
}

/** Changes when the framing should change (not on every render, which would fight panning). */
export function frameKey(routes: RouteOption[], stops: MapStop[]): string {
  return routes.length > 0
    ? routes.map((r) => r.id).join()
    : stops.map((s) => s.id + s.location).join();
}
