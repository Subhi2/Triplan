import type { LngLat } from "./geo";

export interface RouteSketch {
  /** SVG path of the route line ("M x y L x y ..."), empty without a line. */
  path: string;
  /** Stops in the same pixel space, in trip order. */
  stops: { x: number; y: number }[];
}

/**
 * Fits a route line and its stops into a width × height box (with padding) for drawing on a share
 * card. Longitudes are scaled by cos(latitude) so the shape looks as it does on the map.
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

  const lats = all.map(([, lat]) => lat);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = all.map(([lng]) => lng * kx);
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

  const project = ([lng, lat]: LngLat) => ({
    x: Math.round((offsetX + (lng * kx - minX) * s) * 10) / 10,
    y: Math.round((offsetY + (maxY - lat) * s) * 10) / 10, // north up
  });

  const path = line
    .map(project)
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`)
    .join(" ");
  return { path, stops: stops.map(project) };
}
