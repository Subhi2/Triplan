import { describe, expect, it } from "vitest";
import {
  formatRideShort,
  IN_SEASON_BOOST,
  nearbyRank,
  nearbyQuerySchema,
  parseNearbyUrl,
  pickCandidates,
  reachRadiusM,
  rideThereHref,
  serializeNearbyUrl,
  straightReachKm,
  topNearby,
} from "@/lib/nearby";
import { parseTripUrl } from "@/lib/tripUrl";

describe("Near me URL", () => {
  it("round-trips a position, kept to 3 decimals", () => {
    const state = parseNearbyUrl(new URLSearchParams("at=75.785123,12.943456&within=120&v=car"));
    expect(state).toEqual({
      at: { label: null, location: [75.785, 12.943] },
      within: 120,
      vehicle: "car",
      categories: [],
    });
    expect(serializeNearbyUrl(state)).toBe("at=75.785%2C12.943&within=120&v=car");
  });

  it("keeps a typed place's name", () => {
    const state = parseNearbyUrl(new URLSearchParams("at=Sakleshpur@75.78512,12.94345&cat=fort"));
    expect(state.at).toEqual({ label: "Sakleshpur", location: [75.785, 12.943] });
    expect(state.categories).toEqual(["fort"]);
    expect(parseNearbyUrl(new URLSearchParams(serializeNearbyUrl(state)))).toEqual(state);
  });

  it("falls back to defaults on bad values", () => {
    const state = parseNearbyUrl(
      new URLSearchParams("at=nowhere&within=45&v=plane&cat=town,nope,temple"),
    );
    expect(state).toEqual({ at: null, within: 60, vehicle: "bike", categories: ["temple"] });
  });

  it("never writes more than 3 decimals of a position", () => {
    const query = serializeNearbyUrl({
      at: { label: null, location: [75.7851234, 12.9434567] },
      within: 60,
      vehicle: "bike",
      categories: [],
    });
    expect(decodeURIComponent(query)).toContain("at=75.785,12.943");
  });
});

describe("nearbyQuerySchema", () => {
  it("rounds the position and applies defaults", () => {
    expect(nearbyQuerySchema.parse({ lng: "75.78512", lat: "12.94345" })).toEqual({
      lng: 75.785,
      lat: 12.943,
      within: 60,
      vehicle: "bike",
      mode: "reach",
    });
  });

  it("splits categories", () => {
    const q = nearbyQuerySchema.parse({ lng: "75", lat: "13", categories: "fort,temple,fort" });
    expect(q.categories).toEqual(["fort", "temple"]);
  });

  it.each([
    { lng: "75", lat: "13", within: "45" },
    { lng: "200", lat: "13" },
    { lng: "75" },
    { lng: "75", lat: "13", categories: "Fort;DROP" },
    { lng: "75", lat: "13", mode: "fly" },
  ])("rejects %o", (q) => {
    expect(nearbyQuerySchema.safeParse(q).success).toBe(false);
  });
});

describe("reach", () => {
  it("searches a generous straight-line radius, smaller for bikes, capped", () => {
    expect(reachRadiusM(60, "car")).toBe(60_000);
    expect(reachRadiusM(60, "bike")).toBeLessThan(60_000);
    expect(reachRadiusM(240, "car")).toBe(240_000);
    expect(reachRadiusM(240, "car")).toBeLessThanOrEqual(250_000);
  });

  it("guesses a smaller straight-line reach when road times are unavailable", () => {
    expect(straightReachKm(60, "car")).toBe(35);
    expect(straightReachKm(60, "bike")).toBeLessThan(35);
  });
});

describe("pickCandidates", () => {
  const place = (id: string, distanceKm: number, fame: number) => ({ id, distanceKm, fame });

  it("keeps at most max, spread over the distance rings", () => {
    // 50 famous places far away, 50 plain ones close by.
    const far = Array.from({ length: 50 }, (_, i) => place(`far${i}`, 90 + i / 10, 3));
    const near = Array.from({ length: 50 }, (_, i) => place(`near${i}`, 5 + i / 10, 1));
    const picked = pickCandidates([...far, ...near], 100, (p) => p.fame, 20);
    expect(picked).toHaveLength(20);
    expect(picked.filter((p) => p.id.startsWith("near")).length).toBeGreaterThanOrEqual(5);
  });

  it("fills unused ring slots with the best of the rest, best first", () => {
    const places = Array.from({ length: 10 }, (_, i) => place(`p${i}`, 1, i));
    const picked = pickCandidates(places, 100, (p) => p.fame, 6);
    expect(picked.map((p) => p.id)).toEqual(["p9", "p8", "p7", "p6", "p5", "p4"]);
  });
});

describe("formatRideShort", () => {
  it.each([
    [4.4, { value: "4", unit: "MIN" }],
    [59.4, { value: "59", unit: "MIN" }],
    [65, { value: "1:05", unit: "HRS" }],
    [240, { value: "4:00", unit: "HRS" }],
    [0.2, { value: "1", unit: "MIN" }],
  ])("%s min", (min, expected) => {
    expect(formatRideShort(min)).toEqual(expected);
  });
});

describe("topNearby", () => {
  it("keeps the best 20 and shows them nearest first", () => {
    const places = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      fame: i, // p29 is the best
      rideMin: 100 - i, // and the nearest
      distanceKm: 100 - i,
    }));
    const top = topNearby(places);
    expect(top).toHaveLength(20);
    expect(top[0]!.id).toBe("p29");
    expect(top.map((p) => p.id)).not.toContain("p9");
  });

  it("orders by straight-line distance without road times", () => {
    const top = topNearby([
      { id: "far", fame: 3, rideMin: null, distanceKm: 30 },
      { id: "near", fame: 1, rideMin: null, distanceKm: 3 },
    ]);
    expect(top.map((p) => p.id)).toEqual(["near", "far"]);
  });
});

describe("rideThereHref", () => {
  it("opens the planner from the point to the place, the start at 3 decimals", () => {
    const href = rideThereHref(
      { label: "Your location", location: [75.7851234, 12.9434567] },
      { name: "Manjarabad Fort", location: [75.7581, 12.9173] },
      "car",
    );
    expect(href.startsWith("/?")).toBe(true);
    const trip = parseTripUrl(new URLSearchParams(href.slice(2)));
    expect(trip.from).toEqual({ label: "Your location", location: [75.785, 12.943] });
    expect(trip.to).toEqual({ label: "Manjarabad Fort", location: [75.7581, 12.9173] });
    expect(trip.vehicle).toBe("car");
    expect(decodeURIComponent(href)).not.toMatch(/75\.7851/);
  });
});

describe("nearbyRank", () => {
  it("lifts places at their best this month", () => {
    const fort = { fame: 2, bestMonths: [9, 10, 11] };
    expect(nearbyRank(fort, 10)).toBe(2 + IN_SEASON_BOOST);
    expect(nearbyRank(fort, 5)).toBe(2);
  });
});
