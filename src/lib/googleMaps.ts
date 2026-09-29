import { metresAlong, round5, type LngLat } from "./geo";
import { stopIndexAt } from "./trip";

// Links that open Google Maps (the app on phones), built with the documented Maps URLs
// (https://developers.google.com/maps/documentation/urls/get-started). Nothing is fetched from
// Google; we only link to it.

/** Google Maps takes at most 9 stops between start and destination (3 in mobile browsers). */
export const MAX_GOOGLE_WAYPOINTS = 9;

const latLng = ([lng, lat]: LngLat) => `${round5(lat)},${round5(lng)}`;

/**
 * Google Maps' page for a place, found by name and area, so its photos and reviews show.
 * A search, not a pin: a common name ("Shiva Temple") can match another place in the district.
 */
export function googleMapsPlaceUrl(place: {
  name: string;
  district?: string | null;
  state?: string | null;
}): string {
  const query = [place.name, place.district, place.state].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export interface GoogleMapsTrip {
  url: string | null; // null when there are more stops than Google Maps takes
  waypointCount: number;
}

/**
 * Directions from the trip's start to its destination through its via stops and the picked
 * places, in the order they come along `route`. Places already in the trip are not repeated.
 */
export function googleMapsTripUrl(
  stops: LngLat[], // start, vias, destination
  picked: LngLat[],
  route: LngLat[],
): GoogleMapsTrip {
  const [origin, ...rest] = stops;
  const destination = rest.pop();
  if (!origin || !destination) return { url: null, waypointCount: 0 };
  const extra = picked.filter((p) => stopIndexAt(stops, p) === -1);
  const waypoints = [...rest, ...extra]
    .map((p) => ({ p, at: route.length > 1 ? metresAlong(route, p) : 0 }))
    .sort((a, b) => a.at - b.at)
    .map((w) => w.p);
  if (waypoints.length > MAX_GOOGLE_WAYPOINTS) {
    return { url: null, waypointCount: waypoints.length };
  }
  const params = new URLSearchParams({
    api: "1",
    origin: latLng(origin),
    destination: latLng(destination),
    travelmode: "driving",
  });
  if (waypoints.length > 0) params.set("waypoints", waypoints.map(latLng).join("|"));
  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    waypointCount: waypoints.length,
  };
}
