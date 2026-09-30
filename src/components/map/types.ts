import type { LngLat } from "@/lib/geo";
import type { PlaceAlong } from "@/lib/places";
import type { RouteOption } from "@/lib/trip";

// Props shared by the MapLibre map (MapView) and the Google map (google/GoogleMapView), so the
// planner and the Near me screen can use either (docs/02, "Google Maps Platform").

/** What a place marker needs: places along a route and places near a point both fit. */
export type PlacePin = Pick<PlaceAlong, "id" | "name" | "category" | "location">;

/** The user's own position ("you are here"), with the direction they are moving when known. */
export interface MapMe {
  location: LngLat;
  headingDeg: number | null;
}

/** Points to frame when there are no routes, and a key that changes when they should be reframed. */
export interface MapFrame {
  key: string;
  points: LngLat[];
}

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
  places: PlacePin[];
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
  /** The "you are here" marker. */
  me?: MapMe | null;
  /** Framing when there are no routes (the Near me screen); stops are framed otherwise. */
  frame?: MapFrame | null;
  /** A tap on the map away from any marker or route. */
  onMapClick?: (at: LngLat) => void;
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

/** What to frame: all routes once there are some, else the given frame, else the stops. */
export function framePoints(
  routes: RouteOption[],
  stops: MapStop[],
  frame?: MapFrame | null,
): LngLat[] {
  if (routes.length > 0) return routes.flatMap((r) => r.geometry.coordinates as LngLat[]);
  return frame ? frame.points : stops.map((s) => s.location);
}

/** Changes when the framing should change (not on every render, which would fight panning). */
export function frameKey(routes: RouteOption[], stops: MapStop[], frame?: MapFrame | null): string {
  if (routes.length > 0) return routes.map((r) => r.id).join();
  return frame ? `frame:${frame.key}` : stops.map((s) => s.id + s.location).join();
}
