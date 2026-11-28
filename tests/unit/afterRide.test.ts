import { describe, expect, it } from "vitest";
import { askForReviews, placesAtStops } from "@/lib/afterRide";

const place = (slug: string, category: string, location: [number, number]) => ({
  slug,
  name: slug,
  category,
  location,
});

describe("review after the ride (G11)", () => {
  const places = [
    place("manjarabad-fort", "fort", [75.7581, 12.9173]),
    place("sakleshpur", "town", [75.785, 12.943]),
    place("", "fuel", [75.786, 12.943]),
  ];

  it("finds the places the trip stopped at, once each, and not towns or pumps", () => {
    const stops = [
      { location: [77.59, 12.97] as [number, number] },
      { location: [75.7582, 12.9174] as [number, number] },
      { location: [75.785, 12.943] as [number, number] },
      { location: [75.7581, 12.9173] as [number, number] },
      { location: null },
    ];
    expect(placesAtStops(stops, places).map((p) => p.slug)).toEqual(["manjarabad-fort"]);
  });

  it("asks once the saved trip has sat unchanged for 12 hours", () => {
    const now = Date.parse("2026-11-28T12:00:00Z");
    expect(askForReviews("2026-11-28T06:00:00Z", now)).toBe(false);
    expect(askForReviews("2026-11-27T23:00:00Z", now)).toBe(true);
    expect(askForReviews("not a date", now)).toBe(false);
  });
});
