import { describe, expect, it } from "vitest";
import { decodeStop, parseTripUrl, serializeTripUrl, type TripUrlState } from "@/lib/tripUrl";

const trip: TripUrlState = {
  from: { label: "Bengaluru", location: [77.5946, 12.9716] },
  via: [{ label: "Sakleshpur", location: [75.785, 12.943] }],
  to: { label: "Kalasa", location: [75.356, 13.234] },
  vehicle: "car",
  corridorKm: 10,
  categories: [],
  maxDetourKm: null,
  rideHours: null,
  days: null,
};

describe("trip URL state", () => {
  it("round-trips a trip through the query string", () => {
    const qs = serializeTripUrl(trip);
    expect(decodeURIComponent(qs)).toBe(
      "from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234&v=car&c=10",
    );
    expect(parseTripUrl(new URLSearchParams(qs))).toEqual(trip);
  });

  it("round-trips place filters", () => {
    const filtered = { ...trip, categories: ["temple", "fort"], maxDetourKm: 2 as const };
    const qs = serializeTripUrl(filtered);
    expect(decodeURIComponent(qs)).toContain("&cat=temple,fort&hd=2");
    expect(parseTripUrl(new URLSearchParams(qs))).toEqual(filtered);
  });

  it("keeps labels that contain @ and commas", () => {
    expect(decodeStop("Cafe @ Hill, Kalasa@75.356,13.234")).toEqual({
      label: "Cafe @ Hill, Kalasa",
      location: [75.356, 13.234],
    });
  });

  it("drops invalid values and falls back to defaults", () => {
    const state = parseTripUrl(
      new URLSearchParams(
        "from=nowhere&via=X@200,10&via=Belur@75.865,13.165&v=plane&c=7&cat=temple,Bad!,temple&hd=3",
      ),
    );
    expect(state).toEqual({
      from: null,
      via: [{ label: "Belur", location: [75.865, 13.165] }],
      to: null,
      vehicle: "bike",
      corridorKm: 5,
      categories: ["temple"],
      maxDetourKm: null,
      rideHours: null,
      days: null,
    });
  });

  it("caps via stops at five", () => {
    const qs = Array.from({ length: 7 }, (_, i) => `via=S${i}@75,13`).join("&");
    expect(parseTripUrl(new URLSearchParams(qs)).via).toHaveLength(5);
  });
});
