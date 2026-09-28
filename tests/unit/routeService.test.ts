import { describe, expect, it, vi } from "vitest";
import type { RoutingProvider } from "@/server/providers/routing";
import { getRoutes, type RouteServiceDeps } from "@/server/services/routeService";
import type { TownOnRoute } from "@/server/services/viaLabel";
import { routeFixture } from "../helpers/fixtures";

const BENGALURU = { label: "Bengaluru", location: [77.5946, 12.9716] as [number, number] };
const SAKLESHPUR = { label: "Sakleshpur", location: [75.785, 12.943] as [number, number] };
const KALASA = { label: "Kalasa", location: [75.356, 13.234] as [number, number] };

function deps(
  fixture: Parameters<typeof routeFixture>[0],
  towns: TownOnRoute[][],
): RouteServiceDeps {
  let call = 0;
  return {
    routing: { route: vi.fn(async () => routeFixture(fixture, "bike")) } satisfies RoutingProvider,
    townsAlong: vi.fn(async () => towns[call++] ?? []),
  };
}

const t = (name: string, kmFromStart: number): TownOnRoute => ({
  name,
  kmFromStart,
  location: [0, 0],
});

describe("getRoutes", () => {
  it("asks for alternatives with two stops and labels each route", async () => {
    const d = deps("bengaluru-kalasa", [
      [t("Bengaluru", 0), t("Chikkamagaluru", 250), t("Mudigere", 280), t("Kalasa", 337)],
      [
        t("Bengaluru", 0),
        t("Hassan", 182),
        t("Sakleshpur", 220),
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
    expect(routes[0]!.distanceKm).toBeCloseTo(337.6, 1);
    expect(routes[0]!.id).toMatch(/^[0-9a-f]{12}$/);
    expect(routes[0]!.id).not.toBe(routes[1]!.id);
  });

  it("routes through via stops without alternatives and names the route after them", async () => {
    const d = deps("bengaluru-sakleshpur-kalasa", [[t("Hassan", 198), t("Sakleshpur", 238)]]);
    const routes = await getRoutes({ stops: [BENGALURU, SAKLESHPUR, KALASA], vehicle: "car" }, d);

    expect(d.routing.route).toHaveBeenCalledWith(
      expect.objectContaining({ alternatives: false, profile: "car" }),
    );
    expect(routes).toHaveLength(1);
    expect(routes[0]!.viaLabel).toBe("via Sakleshpur");
  });
});
