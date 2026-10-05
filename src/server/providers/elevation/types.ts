import type { LngLat } from "@/lib/geo";

export interface ElevationProvider {
  /**
   * Heights in metres at each point, read from terrain tiles at `zoom` (bilinear between pixel
   * centres). Null for points whose tile could not be read.
   */
  heights(points: LngLat[], zoom: number): Promise<(number | null)[]>;
}

/** A decoded terrain tile: heights in metres, row by row, `size` × `size`. */
export interface HeightTile {
  size: number;
  heights: Float32Array;
}
