import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonCache } from "@/server/db/cache";
import { geocodeCacheKey, withGeocodeCache } from "@/server/providers/geocoding/cached";
import { createThrottle } from "@/server/providers/http";
import {
  routeCacheKey,
  tableCacheKey,
  withRouteCache,
  withTableCache,
} from "@/server/providers/routing/cached";
import type {
  RouteInput,
  RoutingProvider,
  RoutingTableProvider,
  TableInput,
} from "@/server/providers/routing";
import { routeFixture } from "../helpers/fixtures";

function mapCache(): JsonCache & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (k) => store.get(k),
    set: async (k, v) => void store.set(k, v),
  };
}

const input: RouteInput = {
  waypoints: [
    [77.5946, 12.9716],
    [75.356, 13.234],
  ],
  alternatives: true,
  profile: "bike",
};

describe("route cache", () => {
  it("keys on waypoints rounded to 5 decimals, profile and alternatives", () => {
    const nudged: RouteInput = {
      ...input,
      waypoints: [
        [77.594601, 12.971599],
        [75.356, 13.234],
      ],
    };
    expect(routeCacheKey(nudged)).toBe(routeCacheKey(input));
    expect(routeCacheKey({ ...input, profile: "car" })).not.toBe(routeCacheKey(input));
    expect(routeCacheKey({ ...input, alternatives: false })).not.toBe(routeCacheKey(input));
  });

  it("calls the provider once and serves repeats from the cache", async () => {
    const routes = routeFixture("bengaluru-kalasa");
    const inner: RoutingProvider = { route: vi.fn(async () => routes) };
    const cached = withRouteCache(inner, mapCache());

    expect(await cached.route(input)).toEqual(routes);
    expect(await cached.route(input)).toEqual(routes);
    expect(inner.route).toHaveBeenCalledTimes(1);
  });
});

describe("table cache", () => {
  const table: TableInput = {
    origin: [75.785, 12.943],
    destinations: [
      [75.7581, 12.9173],
      [76.0996, 13.0068],
    ],
    profile: "bike",
  };

  it("keys on the origin at 3 decimals, the destinations and the profile", () => {
    expect(tableCacheKey({ ...table, origin: [75.7851, 12.9432] })).toBe(tableCacheKey(table));
    expect(tableCacheKey({ ...table, origin: [75.79, 12.943] })).not.toBe(tableCacheKey(table));
    expect(tableCacheKey({ ...table, destinations: table.destinations.slice(1) })).not.toBe(
      tableCacheKey(table),
    );
    expect(tableCacheKey({ ...table, profile: "car" })).not.toBe(tableCacheKey(table));
    expect(tableCacheKey(table)).toMatch(/^table:v1:/);
  });

  it("calls the provider once and serves repeats from the cache", async () => {
    const cells = [{ distanceM: 5000, durationS: 400 }, null];
    const inner: RoutingTableProvider = { table: vi.fn(async () => cells) };
    const cached = withTableCache(inner, mapCache());

    expect(await cached.table(table)).toEqual(cells);
    expect(await cached.table(table)).toEqual(cells);
    expect(inner.table).toHaveBeenCalledTimes(1);
  });
});

describe("geocode cache", () => {
  it("normalises the query and keys on provider, limit and viewbox", () => {
    expect(geocodeCacheKey("photon", "  Sakleshpur   Town ")).toBe(
      geocodeCacheKey("photon", "sakleshpur town"),
    );
    expect(geocodeCacheKey("photon", "x")).not.toBe(geocodeCacheKey("nominatim", "x"));
    expect(geocodeCacheKey("photon", "x", { limit: 3 })).not.toBe(
      geocodeCacheKey("photon", "x", { limit: 5 }),
    );
    expect(geocodeCacheKey("nominatim", "x", { viewbox: [1, 2, 3, 4] })).not.toBe(
      geocodeCacheKey("nominatim", "x"),
    );
  });

  it("rounds the map bias so small pans still hit the cache", () => {
    const key = (near: [number, number], zoom: number) =>
      geocodeCacheKey("photon", "samse", { near, zoom });
    expect(key([76.74, 15.04], 5)).toBe(key([76.6, 15.1], 5.4)); // same 0.5° cell
    expect(key([76.74, 15.04], 5)).not.toBe(key([75.36, 13.23], 5));
    expect(key([76.74, 15.04], 5)).not.toBe(key([76.74, 15.04], 12));
  });

  it("serves repeats from the cache", async () => {
    const search = vi.fn(async () => [
      { id: "node/1", name: "A", label: "A", location: [1, 2] as [number, number], kind: "x/y" },
    ]);
    const cached = withGeocodeCache({ search }, mapCache(), "photon");
    await cached.search("Kalasa");
    await cached.search("kalasa ");
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("createThrottle", () => {
  afterEach(() => void vi.useRealTimers());

  it("spaces concurrent callers at least the interval apart", async () => {
    vi.useFakeTimers();
    const wait = createThrottle(1_000);
    const done: number[] = [];
    const start = Date.now();
    const calls = [0, 1, 2].map((i) => wait().then(() => done.push(i)));

    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual([0]);
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all(calls);
    expect(done).toEqual([0, 1, 2]);
    expect(Date.now() - start).toBe(2_000);
  });

  it("refuses a caller that would wait longer than maxWaitMs, without taking a slot", async () => {
    vi.useFakeTimers();
    const wait = createThrottle(1_000, Date.now, 1_500);
    const start = Date.now();
    const first = wait();
    const second = wait(); // waits 1 s
    await expect(wait()).rejects.toMatchObject({ status: 503 }); // would wait 2 s
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([first, second]);
    // The refused call left no slot behind: the next one runs at 2 s, not 3 s.
    let ranAt = 0;
    const fourth = wait().then(() => (ranAt = Date.now() - start));
    await vi.advanceTimersByTimeAsync(1_000);
    await fourth;
    expect(ranAt).toBe(2_000);
  });
});
