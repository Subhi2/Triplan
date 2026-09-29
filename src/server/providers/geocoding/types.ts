import type { LngLat } from "@/lib/geo";

export interface GeocodeHit {
  id: string; // "node/123", "way/456"
  name: string;
  label: string; // full display name
  location: LngLat;
  kind: string; // OSM "category/type", e.g. "historic/fort"
}

export interface GeocodeOptions {
  limit?: number;
  /** Only return results inside [minLng, minLat, maxLng, maxLat]. */
  viewbox?: [number, number, number, number];
  /** Prefer results near this point (the map centre), within a radius set by `zoom`. */
  near?: LngLat;
  zoom?: number;
}

export interface GeocodingProvider {
  search(query: string, options?: GeocodeOptions): Promise<GeocodeHit[]>;
}
