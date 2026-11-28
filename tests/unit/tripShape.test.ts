import { describe, expect, it } from "vitest";
import type { LngLat } from "@/lib/geo";
import { isLoop, makeLoop, MAX_VIA_STOPS, rideBack } from "@/lib/trip";

interface S {
  id: string;
  label: string;
  location: LngLat | null;
}
const stop = (id: string, location: LngLat | null): S => ({ id, label: id, location });
const BENGALURU = stop("Bengaluru", [77.5946, 12.9716]);
const SAKLESHPUR = stop("Sakleshpur", [75.785, 12.943]);
const KALASA = stop("Kalasa", [75.356, 13.234]);
const copy = (s: S): S => ({ ...s, id: `${s.id}-back` });

describe("ride back and loop", () => {
  it("reverses the stops for the ride back", () => {
    expect(rideBack([BENGALURU, SAKLESHPUR, KALASA]).map((s) => s.id)).toEqual([
      "Kalasa",
      "Sakleshpur",
      "Bengaluru",
    ]);
  });

  it("makes a loop that ends at the start, with the destination on the way", () => {
    const loop = makeLoop([BENGALURU, SAKLESHPUR, KALASA], copy)!;
    expect(loop.map((s) => s.id)).toEqual(["Bengaluru", "Sakleshpur", "Kalasa", "Bengaluru-back"]);
    expect(loop.at(-1)!.location).toEqual(BENGALURU.location);
    expect(isLoop(loop)).toBe(true);
  });

  it("refuses a loop that is one already or has no room for another stop", () => {
    expect(makeLoop([BENGALURU, KALASA, copy(BENGALURU)], copy)).toBeNull();
    const full = [
      BENGALURU,
      ...Array.from({ length: MAX_VIA_STOPS }, (_, i) => stop(`via${i}`, [76, 13])),
      KALASA,
    ];
    expect(makeLoop(full, copy)).toBeNull();
  });

  it("is not a loop while an end is unknown", () => {
    expect(isLoop([BENGALURU, stop("typing", null)])).toBe(false);
  });
});
