import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import { haversineM, type LngLat } from "@/lib/geo";
import { rideFromGeoJson, tracksOf, trimEnds, TRIM_END_M } from "@/lib/rideFile";

// A straight ride north along 75.5° E: 0.009° of latitude is about 1 km.
const line = (km: number, from = 13): LngLat[] =>
  Array.from({ length: km * 10 + 1 }, (_, i) => [75.5, from + i * 0.0009] as LngLat);

function lengthM(coords: LngLat[]): number {
  return coords.slice(1).reduce((m, c, i) => m + haversineM(coords[i]!, c), 0);
}

function fc(...features: FeatureCollection["features"]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("tracksOf", () => {
  it("takes lines and multi-segment tracks, longest first, with their times", () => {
    const short = line(3);
    const long = line(10, 14);
    const tracks = tracksOf(
      fc(
        {
          type: "Feature",
          properties: { name: "Short" },
          geometry: { type: "LineString", coordinates: short },
        },
        {
          type: "Feature",
          properties: {
            name: "Ghat ride",
            coordinateProperties: {
              times: [
                long.slice(0, 50).map((_, i) => new Date(Date.UTC(2026, 9, 1, 6, i)).toISOString()),
                long.slice(50).map((_, i) => new Date(Date.UTC(2026, 9, 1, 7, i)).toISOString()),
              ],
            },
          },
          geometry: { type: "MultiLineString", coordinates: [long.slice(0, 50), long.slice(50)] },
        },
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [75, 13] } },
      ),
    );
    expect(tracks.map((t) => t.name)).toEqual(["Ghat ride", "Short"]);
    expect(tracks[0]!.coords).toHaveLength(long.length);
    expect(tracks[0]!.times.every((t) => t !== null)).toBe(true);
  });
});

describe("trimEnds", () => {
  it("cuts 500 m from each end", () => {
    const coords = line(5);
    const trimmed = trimEnds(coords)!;
    expect(haversineM(coords[0]!, trimmed[0]!)).toBeCloseTo(TRIM_END_M, -1);
    expect(haversineM(coords.at(-1)!, trimmed.at(-1)!)).toBeCloseTo(TRIM_END_M, -1);
    expect(lengthM(trimmed)).toBeCloseTo(lengthM(coords) - 2 * TRIM_END_M, -1);
  });

  it("leaves nothing of a line shorter than 1 km", () => {
    expect(trimEnds(line(0.8))).toBeNull();
  });
});

describe("rideFromGeoJson", () => {
  it("sends no point within 500 m of either end", () => {
    const coords = line(20);
    const ride = rideFromGeoJson(
      fc({
        type: "Feature",
        properties: { name: "Charmadi" },
        geometry: { type: "LineString", coordinates: coords },
      }),
    );
    if (!ride.ok) throw new Error(ride.error);
    for (const p of ride.geometry.coordinates as LngLat[]) {
      expect(haversineM(p, coords[0]!)).toBeGreaterThan(TRIM_END_M - 2);
      expect(haversineM(p, coords.at(-1)!)).toBeGreaterThan(TRIM_END_M - 2);
    }
    // A straight line simplifies to its two ends.
    expect(ride.geometry.coordinates).toHaveLength(2);
    expect(ride.name).toBe("Charmadi");
    expect(ride.durationS).toBeNull();
  });

  it("times the kept part from the file's times", () => {
    const coords = line(10);
    const start = Date.UTC(2026, 9, 1, 6, 0);
    const times = coords.map((_, i) => new Date(start + i * 36_000).toISOString()); // 1 h in all
    const ride = rideFromGeoJson(
      fc({
        type: "Feature",
        properties: { coordinateProperties: { times } },
        geometry: { type: "LineString", coordinates: coords },
      }),
    );
    if (!ride.ok) throw new Error(ride.error);
    // 9 of the 10 km are kept: 90% of the hour.
    expect(ride.durationS).toBeGreaterThan(3200);
    expect(ride.durationS).toBeLessThan(3300);
  });

  it("refuses a file with no line, or a ride under 2 km", () => {
    expect(rideFromGeoJson(fc())).toEqual({
      ok: false,
      error: "No track or route found in this file.",
    });
    const short = rideFromGeoJson(
      fc({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: line(2.5) },
      }),
    );
    expect(short).toEqual({ ok: false, error: "The ride is shorter than 2 km." });
  });
});
