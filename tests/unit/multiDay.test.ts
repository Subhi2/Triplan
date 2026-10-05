import { describe, expect, it, vi } from "vitest";
import type { LngLat } from "@/lib/geo";
import {
  dayAtKm,
  daysRequestSchema,
  kmAtMin,
  MAX_DAYS,
  minAtKm,
  routeTimeline,
  splitDays,
  suggestDays,
  type OvernightTown,
} from "@/lib/multiDay";
import type { RouteResult } from "@/server/providers/routing";
import { planDays, type DayPlanDeps } from "@/server/services/dayPlanService";

// A straight line north along 76° E: 0.9° of latitude is about 100 km.
const line: LngLat[] = [
  [76, 12],
  [76, 17.4],
];
const town = (name: string, km: number, extra: Partial<OvernightTown> = {}): OvernightTown => ({
  name,
  location: [76, 12 + km / 111.2],
  kmFromStart: km,
  population: 20_000,
  kind: "town",
  stays: 5,
  ...extra,
});

describe("route timeline", () => {
  it("runs faster on fast stretches and evenly without stretch times", () => {
    // 300 km of expressway in 3 h, then 300 km of ghats and small roads in 7 h.
    const t = routeTimeline(
      [
        { distanceM: 300_000, durationS: 3 * 3600 },
        { distanceM: 300_000, durationS: 7 * 3600 },
      ],
      600,
      600,
    );
    expect(minAtKm(t, 300)).toBeCloseTo(180);
    expect(kmAtMin(t, 300)).toBeCloseTo(300 + (120 / 420) * 300);
    expect(minAtKm(t, 900)).toBe(600);

    const even = routeTimeline([{ distanceM: 1, ref: null } as never], 600, 600);
    expect(even).toEqual({ km: [0, 600], min: [0, 600] });
    expect(routeTimeline([{ distanceM: 600_000, durationS: 0 }], 600, 500).min).toEqual([0, 500]);
  });

  it("suggests days with each day allowed a fifth over", () => {
    expect(suggestDays(7.2 * 60, 6)).toBe(1);
    expect(suggestDays(7.3 * 60, 6)).toBe(2);
    expect(suggestDays(17.85 * 60, 8)).toBe(2);
    expect(suggestDays(17.85 * 60, 6)).toBe(3);
    expect(suggestDays(30, 6)).toBe(1);
    expect(suggestDays(500 * 60, 4)).toBe(MAX_DAYS);
  });
});

describe("splitDays", () => {
  const timeline = { km: [0, 600], min: [0, 600] };

  it("ends the day in the best town near an even split", () => {
    const legs = splitDays({
      timeline,
      days: 2,
      towns: [
        town("Early", 100, { stays: 40, kind: "city", population: 500_000 }), // outside the window
        town("Village", 300, { stays: 0, population: 3_000 }),
        town("Hill town", 330, { stays: 60, kind: "city", population: 120_000 }),
      ],
      line,
    });
    expect(legs).toHaveLength(2);
    expect(legs[0]!.end).toMatchObject({ name: "Hill town", kind: "city", stayCount: 60 });
    expect(legs[0]!.rideMin).toBeCloseTo(330);
    expect(legs[1]).toMatchObject({ day: 2, fromKm: 330, toKm: 600 });
    expect(legs[1]!.end.kind).toBe("destination");
    expect(legs[1]!.end.location).toEqual(line[1]);
  });

  it("evens out the days left after a night early or late", () => {
    const legs = splitDays({
      timeline,
      days: 3,
      towns: [town("A", 240, { stays: 50 }), town("B", 420)],
      line,
    });
    // The first night is late (240 of an even 200), so days two and three share the last 360.
    expect(legs.map((l) => l.end.name)).toEqual(["A", "B", null]);
    expect(legs[1]!.rideMin).toBeCloseTo(180);
    expect(legs[2]!.rideMin).toBeCloseTo(180);
  });

  it("ends on the road at the even split when no town is near it", () => {
    const legs = splitDays({ timeline, days: 2, towns: [town("Far", 50)], line });
    expect(legs[0]!.end).toMatchObject({ name: null, kind: "road", kmFromStart: 300 });
    expect(legs[0]!.end.location[1]).toBeCloseTo(12 + 300 / 111.2, 1);
  });

  it("puts a km in its day; the night's town belongs to the day ending there", () => {
    const legs = [{ toKm: 330 }, { toKm: 600 }];
    expect(dayAtKm(legs, 10)).toBe(1);
    expect(dayAtKm(legs, 330)).toBe(1);
    expect(dayAtKm(legs, 331)).toBe(2);
    expect(dayAtKm(legs, 700)).toBe(2);
  });
});

describe("planDays", () => {
  const result: RouteResult = {
    geometry: { type: "LineString", coordinates: line },
    distanceM: 600_000,
    durationS: 10 * 3600,
    legs: [],
    roads: [
      { distanceM: 300_000, durationS: 3 * 3600, ref: "NH48" },
      { distanceM: 300_000, durationS: 7 * 3600, ref: null },
    ],
  };
  const deps = (): DayPlanDeps => ({
    routeResult: vi.fn(async () => result),
    townsAlong: vi.fn(async () => [
      { ...town("Expressway town", 300), population: 50_000 },
      { ...town("Ghat town", 390), population: 40_000 },
      { ...town("Start suburb", 10), population: 900_000 },
    ]),
    stayCounts: vi.fn(async (points: LngLat[]) => points.map(() => 12)),
    staysNear: vi.fn(async (points: LngLat[]) =>
      points.map(() => [
        { id: "node/1", name: "Hotel Hill View", phone: null, location: [76, 15] as LngLat, distanceKm: 0.4, slug: null },
      ]),
    ),
  });
  const routeId = `${"b".repeat(32)}-0`;

  it("splits by riding time and lists stays for each night", async () => {
    const d = deps();
    const plan = await planDays({ routeId, hoursPerDay: 5 }, d);
    expect(plan).toMatchObject({ suggestedDays: 2, days: 2, hoursPerDay: 5 });
    // Half the riding time is at km 386 (fast first half), so the ghat town wins.
    expect(plan!.legs[0]!.end).toMatchObject({ name: "Ghat town", stayCount: 12 });
    expect(plan!.legs[0]!.end.stays[0]!.name).toBe("Hotel Hill View");
    // Towns near the ends are not weighed.
    expect(vi.mocked(d.stayCounts).mock.calls[0]![0]).toHaveLength(2);
  });

  it("needs no database for one day, and is null for an expired id with no geometry", async () => {
    const d = deps();
    const plan = await planDays({ routeId, hoursPerDay: 10 }, d);
    expect(plan!.legs).toHaveLength(1);
    expect(d.townsAlong).not.toHaveBeenCalled();
    expect(d.staysNear).not.toHaveBeenCalled();

    vi.mocked(d.routeResult).mockResolvedValue(null);
    expect(await planDays({ routeId, hoursPerDay: 6 }, d)).toBeNull();
    const fallback = await planDays(
      {
        routeId,
        geometry: { type: "LineString" as const, coordinates: line },
        distanceKm: 600,
        durationMin: 600,
        hoursPerDay: 5,
        days: 2,
      },
      d,
    );
    // Without stretch times the even split is km 300.
    expect(fallback!.legs[0]!.end.name).toBe("Expressway town");
  });

  it("validates the request", () => {
    expect(daysRequestSchema.safeParse({ routeId, hoursPerDay: 6 }).success).toBe(true);
    expect(daysRequestSchema.safeParse({ routeId, hoursPerDay: 3 }).success).toBe(false);
    expect(daysRequestSchema.safeParse({ hoursPerDay: 6 }).success).toBe(false);
    expect(
      daysRequestSchema.safeParse({ routeId, hoursPerDay: 6, days: MAX_DAYS + 1 }).success,
    ).toBe(false);
  });
});

vi.mock("@/server/services/routeService", () => ({ getRouteResult: vi.fn(async () => null) }));

describe("POST /api/route/days", () => {
  it("answers 400 for a bad body and 404 for an expired route id", async () => {
    const { POST } = await import("@/app/api/route/days/route");
    const post = (body: unknown) =>
      POST(new Request("http://x/api/route/days", { method: "POST", body: JSON.stringify(body) }));
    expect((await post({ hoursPerDay: 6 })).status).toBe(400);
    const res = await post({ routeId: `${"c".repeat(32)}-1`, hoursPerDay: 6 });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });
});
