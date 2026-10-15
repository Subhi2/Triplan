import { gpx, kml, tcx } from "@tmcw/togeojson";
import type { FeatureCollection, LineString } from "geojson";
import { haversineM, pointAtKm, round5, simplifyLine, type LngLat } from "./geo";

// Ride your GPX (docs/02, "Ride your GPX"): a GPX, KML or TCX file of a ride is read in the
// browser. Only its line leaves the phone, with 500 m cut from each end so a home address is not
// shared. Pure, apart from `readRideFile`, which needs the browser's DOMParser.

export const MAX_RIDE_FILE_BYTES = 10 * 1024 * 1024;
/** Cut from each end of the line before it leaves the phone. */
export const TRIM_END_M = 500;
/** Lines shorter than this (after the trim) are not a ride. */
export const MIN_RIDE_KM = 2;
export const RIDE_SIMPLIFY_M = 10;
/** Points sent at most (a 1,500 km ride simplified to 10 m stays far below this). */
export const MAX_RIDE_POINTS = 50_000;

export type RideFileResult =
  | { ok: true; geometry: LineString; durationS: number | null; name: string | null }
  | { ok: false; error: string };

interface Track {
  coords: LngLat[];
  /** Milliseconds per point, where the file has times. */
  times: (number | null)[];
  name: string | null;
}

function lengthM(coords: LngLat[]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += haversineM(coords[i - 1]!, coords[i]!);
  return m;
}

function parseTime(t: unknown): number | null {
  if (typeof t !== "string") return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

/** Every line in the file (tracks and routes; a multi-segment track joined), longest first. */
export function tracksOf(fc: FeatureCollection): Track[] {
  const tracks: Track[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const props = (f.properties ?? {}) as {
      name?: unknown;
      coordinateProperties?: { times?: unknown };
    };
    const name = typeof props.name === "string" && props.name.trim() ? props.name.trim() : null;
    const rawTimes = props.coordinateProperties?.times;
    if (g.type === "LineString") {
      const times = Array.isArray(rawTimes) ? rawTimes.map(parseTime) : [];
      tracks.push({ coords: g.coordinates.map(([x, y]) => [x!, y!]), times, name });
    } else if (g.type === "MultiLineString") {
      const parts = Array.isArray(rawTimes) ? rawTimes : [];
      tracks.push({
        coords: g.coordinates.flatMap((line) => line.map(([x, y]) => [x!, y!] as LngLat)),
        times: g.coordinates.flatMap((line, i) => {
          const t = parts[i];
          return line.map((_, j) => (Array.isArray(t) ? parseTime(t[j]) : null));
        }),
        name,
      });
    }
  }
  return tracks
    .filter((t) => t.coords.length >= 2)
    .sort((a, b) => lengthM(b.coords) - lengthM(a.coords));
}

/** The line with TRIM_END_M cut from each end, or null when too little is left. */
export function trimEnds(coords: LngLat[], trimM = TRIM_END_M): LngLat[] | null {
  const totalM = lengthM(coords);
  if (totalM <= 2 * trimM) return null;
  const startKm = trimM / 1000;
  const endKm = (totalM - trimM) / 1000;
  const start = pointAtKm(coords, startKm);
  const end = pointAtKm(coords, endKm);
  if (!start || !end) return null;
  const out: LngLat[] = [start];
  let at = 0;
  for (let i = 1; i < coords.length; i++) {
    at += haversineM(coords[i - 1]!, coords[i]!);
    if (at / 1000 > startKm && at / 1000 < endKm) out.push(coords[i]!);
  }
  out.push(end);
  return out;
}

/** Riding time from the file's first and last times, for the part kept; null without times. */
function durationOf(track: Track, keptShare: number): number | null {
  const times = track.times.filter((t): t is number => t !== null);
  if (times.length < 2) return null;
  const s = (Math.max(...times) - Math.min(...times)) / 1000;
  // Under a minute, or over two weeks, is not a ride's time.
  return s >= 60 && s <= 14 * 86_400 ? Math.round(s * keptShare) : null;
}

/** The ride to send: the longest line, trimmed, simplified to 10 m and rounded to 5 decimals. */
export function rideFromGeoJson(fc: FeatureCollection): RideFileResult {
  const [track] = tracksOf(fc);
  if (!track) return { ok: false, error: "No track or route found in this file." };
  const trimmed = trimEnds(track.coords);
  const totalM = lengthM(track.coords);
  if (!trimmed || (totalM - 2 * TRIM_END_M) / 1000 < MIN_RIDE_KM) {
    return { ok: false, error: `The ride is shorter than ${MIN_RIDE_KM} km.` };
  }
  const coords = simplifyLine(trimmed, RIDE_SIMPLIFY_M).map(
    ([lng, lat]) => [round5(lng), round5(lat)] as LngLat,
  );
  if (coords.length > MAX_RIDE_POINTS) return { ok: false, error: "This ride is too long." };
  return {
    ok: true,
    geometry: { type: "LineString", coordinates: coords },
    durationS: durationOf(track, (totalM - 2 * TRIM_END_M) / totalM),
    name: track.name,
  };
}

/** Reads a GPX, KML or TCX file in the browser. */
export async function readRideFile(file: File): Promise<RideFileResult> {
  if (file.size > MAX_RIDE_FILE_BYTES) {
    return { ok: false, error: "The file is over 10 MB." };
  }
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return { ok: false, error: "This file could not be read as GPX, KML or TCX." };
  }
  const root = doc.documentElement.nodeName.toLowerCase();
  const fc =
    root === "gpx"
      ? gpx(doc)
      : root === "kml"
        ? kml(doc)
        : root.endsWith("trainingcenterdatabase")
          ? tcx(doc)
          : null;
  if (!fc) return { ok: false, error: "Open a GPX, KML or TCX file." };
  return rideFromGeoJson(fc as FeatureCollection);
}
