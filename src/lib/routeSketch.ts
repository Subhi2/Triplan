import type { LngLat } from "./geo";

export interface RouteSketch {
  /** SVG path of the route line ("M x y L x y ..."), empty without a line. */
  path: string;
  /** Stops in the same pixel space, in trip order. */
  stops: { x: number; y: number }[];
}

export type Projector = (p: LngLat) => { x: number; y: number };

/**
 * A projection fitting `points` into a width × height box (with padding), north up. Longitudes
 * are scaled by cos(latitude) so shapes look as they do on the map.
 */
export function fitProjection(
  points: LngLat[],
  width: number,
  height: number,
  padding = 24,
): Projector {
  if (points.length === 0) return () => ({ x: width / 2, y: height / 2 });
  const lats = points.map(([, lat]) => lat);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map(([lng]) => lng * kx);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);

  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // A single point (or a straight north-south / east-west line) must not divide by zero.
  const scale = Math.min(
    spanX > 0 ? innerW / spanX : Infinity,
    spanY > 0 ? innerH / spanY : Infinity,
  );
  const s = Number.isFinite(scale) ? scale : 0;
  const offsetX = padding + (innerW - spanX * s) / 2;
  const offsetY = padding + (innerH - spanY * s) / 2;

  return ([lng, lat]) => ({
    x: Math.round((offsetX + (lng * kx - minX) * s) * 10) / 10,
    y: Math.round((offsetY + (maxY - lat) * s) * 10) / 10,
  });
}

/** An SVG path through the points. */
export function svgPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/**
 * Fits a route line and its stops into a width × height box (with padding) for drawing on a share
 * card.
 */
export function sketchRoute(
  line: LngLat[],
  stops: LngLat[],
  width: number,
  height: number,
  padding = 24,
): RouteSketch {
  const all = [...line, ...stops];
  if (all.length === 0) return { path: "", stops: [] };
  const project = fitProjection(all, width, height, padding);
  return { path: svgPath(line.map(project)), stops: stops.map(project) };
}
