import { describe, expect, it } from "vitest";
import { ProviderError } from "@/server/providers/http";
import { NoRouteError } from "@/server/providers/routing";
import { buildOsrmRouteUrl, parseOsrmResponse } from "@/server/providers/routing/osrm";
import { rawRouteFixture, routeFixture } from "../helpers/fixtures";

describe("parseOsrmResponse", () => {
  it("parses the recorded Bengaluru → Kalasa response with its alternative", () => {
    const routes = parseOsrmResponse(rawRouteFixture("bengaluru-kalasa"), "car");

    expect(routes).toHaveLength(2);
    expect(routes.map((r) => Math.round(r.distanceM / 1000))).toEqual([338, 312]);
    for (const r of routes) {
      expect(r.geometry.type).toBe("LineString");
      expect(r.legs).toHaveLength(1);
      // [lng, lat] order: Karnataka is around lng 74–78, lat 11–18.
      const [lng, lat] = r.geometry.coordinates[0]!;
      expect(lng).toBeGreaterThan(74);
      expect(lat).toBeLessThan(18);
    }
  });

  it("returns one leg per stop-to-stop section", () => {
    const [route] = parseOsrmResponse(rawRouteFixture("bengaluru-sakleshpur-kalasa"), "car");
    expect(route!.legs).toHaveLength(2);
    expect(route!.legs.reduce((sum, l) => sum + l.distanceM, 0)).toBeCloseTo(route!.distanceM, 0);
  });

  it("scales duration by 1.1 for bikes", () => {
    const raw = rawRouteFixture("bengaluru-kalasa");
    const [car] = parseOsrmResponse(raw, "car");
    const [bike] = parseOsrmResponse(raw, "bike");
    expect(bike!.durationS).toBeCloseTo(car!.durationS * 1.1);
    expect(bike!.distanceM).toBe(car!.distanceM);
  });

  it("throws NoRouteError when OSRM finds no route", () => {
    expect(() =>
      parseOsrmResponse({ code: "NoRoute", message: "Impossible route" }, "car"),
    ).toThrow(NoRouteError);
  });

  it("throws ProviderError for other errors and malformed bodies", () => {
    expect(() => parseOsrmResponse({ code: "TooBig" }, "car")).toThrow(ProviderError);
    expect(() => parseOsrmResponse({ routes: "nope" }, "car")).toThrow(ProviderError);
    expect(() => parseOsrmResponse("<html>", "car")).toThrow(ProviderError);
  });
});

describe("buildOsrmRouteUrl", () => {
  it("asks for alternatives only with exactly two waypoints", () => {
    const two = buildOsrmRouteUrl("https://osrm.test/", {
      waypoints: [
        [77.5946, 12.9716],
        [75.356, 13.234],
      ],
      alternatives: true,
      profile: "bike",
    });
    expect(two).toBe(
      "https://osrm.test/route/v1/driving/77.5946,12.9716;75.356,13.234" +
        "?overview=full&geometries=geojson&alternatives=2&steps=true",
    );

    const three = buildOsrmRouteUrl("https://osrm.test", {
      waypoints: [
        [77.5946, 12.9716],
        [75.785, 12.943],
        [75.356, 13.234],
      ],
      alternatives: true,
      profile: "bike",
    });
    expect(three).toContain("alternatives=false");
  });

  it("rounds coordinates to 5 decimals", () => {
    const url = buildOsrmRouteUrl("https://osrm.test", {
      waypoints: [
        [77.594612345, 12.971598765],
        [75.356, 13.234],
      ],
      alternatives: false,
      profile: "car",
    });
    expect(url).toContain("77.59461,12.9716;");
  });
});

describe("road stretches", () => {
  it("keeps each road's number in route order, merging consecutive steps on the same road", () => {
    const [route] = parseOsrmResponse(
      {
        code: "Ok",
        routes: [
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [77.59, 12.97],
                [75.33, 13.19],
              ],
            },
            distance: 1_000,
            duration: 60,
            legs: [
              {
                distance: 1_000,
                duration: 60,
                summary: "",
                steps: [
                  { distance: 100 },
                  { distance: 300, ref: "NH75" },
                  { distance: 200, ref: "NH75" },
                  { distance: 400, ref: " SH 57 " },
                  { distance: 0, ref: "SH 57" },
                ],
              },
            ],
          },
        ],
      },
      "car",
    );
    expect(route!.roads).toEqual([
      { distanceM: 100, ref: null },
      { distanceM: 500, ref: "NH75" },
      { distanceM: 400, ref: "SH 57" },
    ]);
  });

  it("reads road numbers from the recorded Bengaluru → Samse route", () => {
    const refs = new Set(routeFixture("bengaluru-samse")[0]!.roads!.map((r) => r.ref));
    expect(refs).toContain("NH73");
    expect(refs).toContain("SH106");
  });
});
