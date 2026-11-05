import type { LngLat } from "@/lib/geo";

/** A point from ?lng=&lat= (each rounded to 3 decimals, about 100 m, as Near me does), or undefined. */
export function pointFromQuery(params: URLSearchParams): LngLat | undefined {
  if (!params.has("lng") || !params.has("lat")) return undefined;
  const lng = Number(params.get("lng"));
  const lat = Number(params.get("lat"));
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    return undefined;
  }
  return [Math.round(lng * 1000) / 1000, Math.round(lat * 1000) / 1000];
}
