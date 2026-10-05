import { haversineM, type LngLat } from "./geo";

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
  /** A multi-day split: one track per day instead of one for the route, and the nights. */
  days?: { name: string; route: LngLat[] }[];
  nights?: GpxPoint[];
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

function track(name: string, route: LngLat[]): string[] {
  return [
    "  <trk>",
    `    <name>${esc(name)}</name>`,
    "    <trkseg>",
    ...route.map((p) => `      <trkpt ${coord(p)}/>`),
    "    </trkseg>",
    "  </trk>",
  ];
}

export function tripGpx(trip: GpxTrip): string {
  const tracks =
    trip.days && trip.days.length > 1
      ? trip.days.flatMap((d) => track(d.name, d.route))
      : track(trip.name, trip.route);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Triplan" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    `    <name>${esc(trip.name)}</name>`,
    ...(trip.link ? [`    <link href="${esc(trip.link)}"><text>Open the trip</text></link>`] : []),
    "  </metadata>",
    ...trip.stops.map(waypoint),
    ...(trip.nights ?? []).map(waypoint),
    ...trip.places.map(waypoint),
    ...tracks,
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

/**
 * The part of a line from `fromKm` to `toKm` along it (great-circle km), cut exactly at both
 * ends: each day's track in a multi-day GPX.
 */
export function sliceLine(coords: LngLat[], fromKm: number, toKm: number): LngLat[] {
  const out: LngLat[] = [];
  const from = fromKm * 1000;
  const to = toKm * 1000;
  let travelled = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const d = haversineM(a, b);
    const at = (m: number): LngLat => {
      const f = d > 0 ? (m - travelled) / d : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };
    if (out.length === 0 && travelled + d >= from) out.push(at(Math.max(from, travelled)));
    if (out.length > 0) {
      if (travelled + d >= to) {
        out.push(at(to));
        return out;
      }
      out.push(b);
    }
    travelled += d;
  }
  return out;
}
