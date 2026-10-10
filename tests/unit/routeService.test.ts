import { describe, expect, it, vi } from "vitest";
import type { RouteInput, RoutingProvider } from "@/server/providers/routing";
import { getRouteGeometry, getRoutes, type RouteServiceDeps } from "@/server/services/routeService";
import type { CandidateTown } from "@/server/services/altRoutes";
import type { TownOnRoute } from "@/server/services/viaLabel";
import { routeFixture } from "../helpers/fixtures";

const BENGALURU = { label: "Bengaluru", location: [77.5946, 12.9716] as [number, number] };
const SAKLESHPUR = { label: "Sakleshpur", location: [75.785, 12.943] as [number, number] };
const KALASA = { label: "Kalasa", location: [75.356, 13.234] as [number, number] };
const SAMSE = { label: "Samse", location: [75.33432, 13.18798] as [number, number] };

function deps(
  fixture: Parameters<typeof routeFixture>[0],
  towns: TownOnRoute[][],
  candidates: CandidateTown[] = [],
): RouteServiceDeps {
  let call = 0;
  return {
    routing: { route: vi.fn(async () => routeFixture(fixture, "bike")) } satisfies RoutingProvider,
    townsAlong: vi.fn(async () => towns[call++] ?? []),
    townsInBox: vi.fn(async () => candidates),
  };
}

const t = (name: string, kmFromStart: number, population: number | null = null): TownOnRoute => ({
  name,
  kmFromStart,
  population,
  kind: "town",
  location: [0, 0],
});

describe("getRoutes", () => {
  it("asks for alternatives with two stops and labels each route", async () => {
    const d = deps("bengaluru-kalasa", [
      [t("Bengaluru", 0), t("Chikkamagaluru", 250, 118_496), t("Mudigere", 280), t("Kalasa", 337)],
      [
        t("Bengaluru", 0),
        t("Hassan", 182, 155_006),
        t("Sakleshpur", 220, 23_352),
        t("Mudigere", 257),
        t("Kalasa", 312),
      ],
    ]);
    const routes = await getRoutes({ stops: [BENGALURU, KALASA], vehicle: "bike" }, d);

    expect(d.routing.route).toHaveBeenCalledWith({
      waypoints: [BENGALURU.location, KALASA.location],
      alternatives: true,
      profile: "bike",
    });
    expect(routes.map((r) => r.viaLabel)).toEqual(["via Chikkamagaluru", "via Hassan, Sakleshpur"]);
    // Start and destination towns are not "via" towns.
    expect(routes[1]!.towns).toEqual(["Hassan", "Sakleshpur", "Mudigere"]);
    // With where they are, so the rider can ride through one of them.
    expect(routes[1]!.townStops?.map((s) => s.name)).toEqual(routes[1]!.towns);
    expect(routes[1]!.townStops?.[0]?.location).toEqual([0, 0]);
    expect(routes[0]!.distanceKm).toBeCloseTo(337.6, 1);
    // Both reach Kalasa through the hills: hairpins from the road's shape.
    expect(routes[0]!.curvature!.hairpins).toBeGreaterThan(10);
    expect(routes[1]!.curvature!.hairpins).toBeGreaterThan(10);
    // Ids point at the cached routing response: same hash, different index.
    expect(routes[0]!.id).toMatch(/^[0-9a-f]{32}-0$/);
    expect(routes[1]!.id).toBe(routes[0]!.id.replace(/-0$/, "-1"));
  });

  it("routes through via stops without alternatives and names the route after them", async () => {
    const d = deps("bengaluru-sakleshpur-kalasa", [[t("Hassan", 198), t("Sakleshpur", 238)]]);
    const routes = await getRoutes({ stops: [BENGALURU, SAKLESHPUR, KALASA], vehicle: "car" }, d);

    expect(d.routing.route).toHaveBeenCalledWith(
      expect.objectContaining({ alternatives: false, profile: "car" }),
    );
    expect(routes).toHaveLength(1);
    expect(routes[0]!.viaLabel).toBe("via Sakleshpur");
    // Via stops mean the rider chose the path: no extra options.
    expect(d.townsInBox).not.toHaveBeenCalled();
  });

  it("reports the road mix of each route", async () => {
    const d = deps("bengaluru-samse", []);
    const [route] = await getRoutes({ stops: [BENGALURU, SAMSE], vehicle: "bike" }, d);
    const mix = route!.roadMix!;
    expect(mix.nationalM + mix.stateM + mix.ghatM + mix.otherM).toBeCloseTo(
      route!.distanceKm * 1000,
      0,
    );
    expect(mix.ghatM).toBeGreaterThan(40_000); // the Mudigere–Samse hills
  });
});

describe("extra route options through towns", () => {
  const BELUR: CandidateTown = {
    name: "Belur",
    location: [75.8636, 13.1648],
    population: null,
    kind: "town",
  };
  const HASSAN: CandidateTown = {
    name: "Hassan",
    location: [76.0996, 13.0068], // on the NH75 route already
    population: 133_400,
    kind: "town",
  };

  /** Engine alternatives for the direct search; `viaRoute` for any search through a town. */
  function routing(viaRoute: () => ReturnType<typeof routeFixture>) {
    return {
      route: vi.fn(async (input: RouteInput) =>
        input.waypoints.length === 2 ? routeFixture("bengaluru-samse", "bike") : viaRoute(),
      ),
    };
  }

  it("tops up OSRM's two routes to three with a route through a town off both", async () => {
    const d = { ...deps("bengaluru-samse", [], [HASSAN, BELUR]) };
    d.routing = routing(() => routeFixture("bengaluru-belur-samse", "bike"));
    const routes = await getRoutes({ stops: [BENGALURU, SAMSE], vehicle: "bike" }, d);

    expect(routes).toHaveLength(3);
    // Hassan is on an existing route, so only Belur is tried.
    expect(d.routing.route).toHaveBeenCalledTimes(2);
    expect(d.routing.route).toHaveBeenLastCalledWith({
      waypoints: [BENGALURU.location, BELUR.location, SAMSE.location],
      alternatives: false,
      profile: "bike",
    });
    expect(routes[2]!.distanceKm).toBeCloseTo(344.5, 1);
    expect(routes[2]!.id).toMatch(/^[0-9a-f]{32}-0$/);
    expect(new Set(routes.map((r) => r.id)).size).toBe(3);
  });

  it("skips a town whose route is much longer than the best one", async () => {
    const d = { ...deps("bengaluru-samse", [], [BELUR]) };
    d.routing = routing(() =>
      routeFixture("bengaluru-belur-samse", "bike").map((r) => ({
        ...r,
        distanceM: r.distanceM * 2,
      })),
    );
    expect(await getRoutes({ stops: [BENGALURU, SAMSE], vehicle: "bike" }, d)).toHaveLength(2);
  });

  it("skips a town whose route is mostly the same road as an existing one", async () => {
    const d = { ...deps("bengaluru-samse", [], [BELUR]) };
    d.routing = routing(() => routeFixture("bengaluru-samse", "bike").slice(0, 1));
    expect(await getRoutes({ stops: [BENGALURU, SAMSE], vehicle: "bike" }, d)).toHaveLength(2);
  });

  it("keeps the engine's routes when routing through a town fails", async () => {
    const d = { ...deps("bengaluru-samse", [], [BELUR]) };
    d.routing = routing(() => {
      throw new Error("OSRM down");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getRoutes({ stops: [BENGALURU, SAMSE], vehicle: "bike" }, d)).toHaveLength(2);
  });

  it("still returns the engine's routes when the town lookups fail", async () => {
    const d = deps("bengaluru-samse", []);
    d.townsAlong = vi.fn(async () => {
      throw new Error("connect ETIMEDOUT");
    });
    d.townsInBox = vi.fn(async () => {
      throw new Error("connect ETIMEDOUT");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const routes = await getRoutes({ stops: [BENGALURU, SAMSE], vehicle: "bike" }, d);
    expect(routes).toHaveLength(2);
    expect(routes.every((r) => r.towns.length === 0)).toBe(true);
  });
});

describe("getRouteGeometry", () => {
  it("reads a route's geometry back from the route cache by id", async () => {
    const routes = routeFixture("bengaluru-kalasa");
    const store = new Map<string, unknown>();
    const cache = { get: async (k: string) => store.get(k), set: async () => {} };
    const d = deps("bengaluru-kalasa", []);
    const [, second] = await getRoutes({ stops: [BENGALURU, KALASA], vehicle: "bike" }, d);
    store.set(`route:v2:${second!.id.split("-")[0]}`, routes);

    expect(await getRouteGeometry(second!.id, cache)).toEqual(routes[1]!.geometry);
    expect(await getRouteGeometry(second!.id.replace(/-1$/, "-2"), cache)).toBeNull();
    expect(await getRouteGeometry("not-an-id", cache)).toBeNull();
  });
});
