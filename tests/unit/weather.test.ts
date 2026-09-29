import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LngLat } from "@/lib/geo";
import {
  pointAtKm,
  rainLevel,
  sampleKms,
  stepAt,
  summarizeWeather,
  type ForecastStep,
  type WeatherPoint,
} from "@/lib/weather";
import {
  locationforecastSchema,
  parseLocationforecast,
  snapToGrid,
} from "@/server/providers/weather/metno";
import type { WeatherProvider } from "@/server/providers/weather";
import { jsonFixture, routeFixture } from "../helpers/fixtures";

vi.mock("@/server/services/corridorService", () => ({ townsAlong: vi.fn() }));
vi.mock("@/server/services/routeService", () => ({ getRouteGeometry: vi.fn() }));
const { townsAlong } = await import("@/server/services/corridorService");
const { getRouteGeometry } = await import("@/server/services/routeService");
const { weatherAlong } = await import("@/server/services/weatherService");
const { POST } = await import("@/app/api/weather/route");

// Recorded 2026-09-29 from api.met.no for Sakleshpur (12.94, 75.79).
const steps = parseLocationforecast(
  locationforecastSchema.parse(jsonFixture("metno/sakleshpur-complete.json")),
);

describe("parseLocationforecast", () => {
  it("takes hourly rain while there is some, then 6-hourly", () => {
    expect(steps[0]).toEqual({
      time: "2026-09-29T18:00:00Z",
      tempC: 20.8,
      windMs: 2.4,
      rainMm: 0.2,
      rainHours: 1,
      symbol: "lightrain",
    });
    const sixHourly = steps.find((s) => s.rainHours === 6)!;
    expect(Date.parse(sixHourly.time) - Date.parse(steps[0]!.time)).toBeGreaterThan(48 * 3.6e6);
    // The last step has no periods at all.
    expect(steps.at(-1)).toMatchObject({ rainMm: null, rainHours: null, symbol: null });
  });

  it("snaps points to a 0.05° grid with at most 2 decimals", () => {
    expect(snapToGrid([75.7851, 12.9432])).toEqual([75.8, 12.95]);
    expect(snapToGrid([77.5946, 12.9716])).toEqual([77.6, 12.95]);
  });
});

describe("stepAt", () => {
  it("picks the step that covers the time, and nothing past the forecast", () => {
    expect(stepAt(steps, new Date("2026-09-29T18:40:00Z"))!.time).toBe("2026-09-29T18:00:00Z");
    expect(stepAt(steps, new Date("2026-09-29T17:00:00Z"))).toBeNull(); // before the first
    expect(stepAt(steps, new Date("2026-10-20T06:00:00Z"))).toBeNull(); // beyond the forecast
  });
});

describe("rainLevel", () => {
  it("grades rain per hour", () => {
    expect(rainLevel(0.1, 1)).toBe("dry");
    expect(rainLevel(0.5, 1)).toBe("light");
    expect(rainLevel(3, 1)).toBe("rain");
    expect(rainLevel(30, 6)).toBe("heavy");
    expect(rainLevel(3, 6)).toBe("light");
    expect(rainLevel(null, null)).toBe("dry");
  });
});

describe("sampling the route", () => {
  it("spaces points about 40 km apart, from start to end, at most 8", () => {
    expect(sampleKms(330)).toHaveLength(8);
    expect(sampleKms(330)[0]).toBe(0);
    expect(sampleKms(330).at(-1)).toBe(330);
    expect(sampleKms(60)).toEqual([0, 30, 60]);
    expect(sampleKms(5)).toEqual([0, 5]);
  });

  it("finds the point a distance along the line", () => {
    const line: LngLat[] = [
      [75, 13],
      [76, 13],
    ];
    const [lng, lat] = pointAtKm(line, 54.2); // about half of the 108 km
    expect(lng).toBeCloseTo(75.5, 1);
    expect(lat).toBe(13);
    expect(pointAtKm(line, 500)).toEqual([76, 13]);
  });
});

const point = (label: string, forecast: Partial<NonNullable<WeatherPoint["forecast"]>> | null) =>
  ({
    km: 0,
    label,
    location: [75, 13],
    eta: "2026-10-03T06:00:00.000Z",
    forecast: forecast && {
      tempC: 24,
      windMs: 2,
      rainMm: 0,
      rainHours: 1,
      symbol: "cloudy",
      rain: "dry",
      thunder: false,
      ...forecast,
    },
  }) satisfies WeatherPoint;

describe("summarizeWeather", () => {
  it("reports the wettest place, thunder before rain, and the temperature range", () => {
    const summary = summarizeWeather([
      point("Bengaluru", { tempC: 19 }),
      point("Hassan", { rain: "light" }),
      point("Sakleshpur", { rain: "heavy", tempC: 22 }),
      point("Kalasa", { rain: "heavy", windMs: 11 }),
    ]);
    expect(summary).toMatchObject({ level: "heavy", minTempC: 19, maxTempC: 24, missing: 0 });
    expect(summary.worst!.label).toBe("Sakleshpur");
    expect(summary.windy!.label).toBe("Kalasa");

    const storm = summarizeWeather([point("A", { rain: "heavy" }), point("B", { thunder: true })]);
    expect(storm.level).toBe("thunder");
    expect(storm.worst!.label).toBe("B");
  });

  it("is dry with no worst place, or 'none' past the forecast", () => {
    expect(summarizeWeather([point("A", {}), point("B", {})])).toMatchObject({
      level: "dry",
      worst: null,
    });
    expect(summarizeWeather([point("A", null)])).toMatchObject({ level: "none", missing: 1 });
  });
});

describe("weatherAlong", () => {
  const route = routeFixture("bengaluru-sakleshpur-kalasa")[0]!;

  beforeEach(() => {
    vi.mocked(townsAlong)
      .mockReset()
      .mockResolvedValue([
        {
          name: "Hassan",
          location: [76.1, 13.0],
          kmFromStart: 180,
          population: null,
          kind: "city",
        },
      ]);
  });

  it("asks for the forecast at each point for the time the rider gets there", async () => {
    const asked: LngLat[] = [];
    const forecast: ForecastStep = {
      time: "2026-10-03T00:00:00Z",
      tempC: 25,
      windMs: 3,
      rainMm: 2,
      rainHours: 1,
      symbol: "rain",
    };
    const provider: WeatherProvider = {
      forecast: async (p) => {
        asked.push(p);
        return [forecast];
      },
    };
    const points = await weatherAlong(
      route.geometry,
      new Date("2026-10-03T00:30:00Z"),
      300,
      provider,
    );
    expect(points).toHaveLength(8);
    expect(asked).toHaveLength(8);
    expect(points[0]!.eta).toBe("2026-10-03T00:30:00.000Z");
    // 300 min riding plus 30 min of breaks.
    expect(points.at(-1)!.eta).toBe("2026-10-03T06:00:00.000Z");
    expect(points.some((p) => p.label === "Hassan")).toBe(true);
    expect(points[1]!.label).toMatch(/^km \d+$/);
    // Steps cover at most 6 hours: later points are past this one-step forecast.
    expect(points[0]!.forecast).toMatchObject({ rain: "rain", tempC: 25 });
    expect(points.at(-1)!.forecast).toBeNull();
  });

  it("gives a point no forecast when its request fails, and fails when all do", async () => {
    let n = 0;
    const flaky: WeatherProvider = {
      forecast: async () => {
        if (n++ === 0) throw new Error("down");
        return [];
      },
    };
    const points = await weatherAlong(route.geometry, new Date(), 300, flaky);
    expect(points[0]!.forecast).toBeNull();

    const down: WeatherProvider = { forecast: () => Promise.reject(new Error("down")) };
    await expect(weatherAlong(route.geometry, new Date(), 300, down)).rejects.toThrow();
  });
});

describe("POST /api/weather", () => {
  const post = (body: unknown) =>
    POST(
      new Request("http://localhost/api/weather", { method: "POST", body: JSON.stringify(body) }),
    );

  it("rejects a request without a route or with a bad time", async () => {
    expect((await post({ departAt: "2026-10-03T00:30:00Z", rideMin: 300 })).status).toBe(400);
    expect(
      (await post({ routeId: `${"0".repeat(32)}-1`, departAt: "tomorrow", rideMin: 300 })).status,
    ).toBe(400);
  });

  it("says when the cached route has expired", async () => {
    vi.mocked(getRouteGeometry).mockResolvedValue(null);
    const res = await post({
      routeId: `${"0".repeat(32)}-1`,
      departAt: "2026-10-03T00:30:00Z",
      rideMin: 300,
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });
});
