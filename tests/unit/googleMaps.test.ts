import { describe, expect, it } from "vitest";
import type { LngLat } from "@/lib/geo";
import { googleMapsPlaceUrl, googleMapsTripUrl, MAX_GOOGLE_WAYPOINTS } from "@/lib/googleMaps";
import { routeFixture } from "../helpers/fixtures";

const BENGALURU: LngLat = [77.5946, 12.9716];
const HASSAN: LngLat = [76.0962, 13.0033];
const SAKLESHPUR: LngLat = [75.785, 12.943];
const MUDIGERE: LngLat = [75.6397, 13.1365];
const KALASA: LngLat = [75.356, 13.234];
const line = routeFixture("bengaluru-sakleshpur-kalasa")[0]!.geometry.coordinates as LngLat[];

const params = (url: string | null) => new URL(url!).searchParams;

describe("googleMapsPlaceUrl", () => {
  it("searches the place's name with the map at its exact spot", () => {
    expect(googleMapsPlaceUrl({ name: "Manjarabad Fort", location: [75.7581, 12.9173] })).toBe(
      "https://www.google.com/maps/search/Manjarabad%20Fort/@12.9173,75.7581,17z",
    );
    expect(
      googleMapsPlaceUrl({ name: "Shiva Temple / Hampi", location: [76.47635735, 15.3439411] }),
    ).toBe(
      "https://www.google.com/maps/search/Shiva%20Temple%20%2F%20Hampi/@15.34394,76.47636,17z",
    );
  });
});

describe("googleMapsTripUrl", () => {
  it("goes from start to destination through via stops and ticked places in route order", () => {
    const trip = googleMapsTripUrl([BENGALURU, SAKLESHPUR, KALASA], [MUDIGERE, HASSAN], line);
    expect(trip.waypointCount).toBe(3);
    const p = params(trip.url);
    expect(trip.url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/);
    expect(p.get("origin")).toBe("12.9716,77.5946");
    expect(p.get("destination")).toBe("13.234,75.356");
    expect(p.get("waypoints")).toBe("13.0033,76.0962|12.943,75.785|13.1365,75.6397");
    expect(p.get("travelmode")).toBe("driving");
  });

  it("does not repeat a ticked place that is already a stop", () => {
    const trip = googleMapsTripUrl([BENGALURU, SAKLESHPUR, KALASA], [[75.7851, 12.9431]], line);
    expect(params(trip.url).get("waypoints")).toBe("12.943,75.785");
  });

  it("works without stops in between", () => {
    const p = params(googleMapsTripUrl([BENGALURU, KALASA], [], line).url);
    expect(p.has("waypoints")).toBe(false);
  });

  it("gives no link beyond Google's stop limit", () => {
    const many = Array.from({ length: MAX_GOOGLE_WAYPOINTS + 1 }, (_, i): LngLat => [
      76 + i * 0.01,
      13,
    ]);
    expect(googleMapsTripUrl([BENGALURU, KALASA], many, line)).toEqual({
      url: null,
      waypointCount: MAX_GOOGLE_WAYPOINTS + 1,
    });
  });

  it("needs a start and a destination", () => {
    expect(googleMapsTripUrl([BENGALURU], [HASSAN], line).url).toBeNull();
  });
});
