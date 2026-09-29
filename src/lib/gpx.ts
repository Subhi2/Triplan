import type { LngLat } from "./geo";

// GPX 1.1 export of a trip (docs/07, G1.4): the route as a track, the stops and places as
// waypoints. Opens in OsmAnd, Organic Maps, Komoot, Garmin and most GPS units, which navigate
// it offline.

export interface GpxPoint {
  name: string;
  location: LngLat;
  /** Shown by some apps under the name, e.g. "Fort · km 142". */
  description?: string;
  /** Waypoint symbol; apps map these to icons ("Flag, Blue", "Scenic Area"...). */
  symbol?: string;
}

export interface GpxTrip {
  name: string;
  link?: string; // the trip's page
  route: LngLat[];
  stops: GpxPoint[];
  places: GpxPoint[];
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);
// 6 decimals is about 10 cm: plenty, and keeps the file small.
const coord = ([lng, lat]: LngLat) => `lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"`;

function waypoint(p: GpxPoint): string {
  return [
    `  <wpt ${coord(p.location)}>`,
    `    <name>${esc(p.name)}</name>`,
    ...(p.description ? [`    <desc>${esc(p.description)}</desc>`] : []),
    ...(p.symbol ? [`    <sym>${esc(p.symbol)}</sym>`] : []),
    "  </wpt>",
  ].join("\n");
}

export function tripGpx(trip: GpxTrip): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Bike Travelling Guide" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    `    <name>${esc(trip.name)}</name>`,
    ...(trip.link ? [`    <link href="${esc(trip.link)}"><text>Open the trip</text></link>`] : []),
    "  </metadata>",
    ...trip.stops.map(waypoint),
    ...trip.places.map(waypoint),
    "  <trk>",
    `    <name>${esc(trip.name)}</name>`,
    "    <trkseg>",
    ...trip.route.map((p) => `      <trkpt ${coord(p)}/>`),
    "    </trkseg>",
    "  </trk>",
    "</gpx>",
    "",
  ].join("\n");
}

/** "Bengaluru → Kalasa via Sakleshpur" -> "bengaluru-to-kalasa-via-sakleshpur.gpx" */
export function gpxFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/→/g, " to ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return `${slug || "trip"}.gpx`;
}
