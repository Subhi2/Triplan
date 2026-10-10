import { describe, expect, it, vi } from "vitest";
import type { LngLat } from "@/lib/geo";
import type { PlaceAlong } from "@/lib/places";
import { splitByGhats, storyStops, thinLine } from "@/lib/story";
import { storyFileName } from "@/components/ride/StoryShare";

const place = (id: string, km: number, extra: Partial<PlaceAlong> = {}): PlaceAlong => ({
  id,
  slug: id,
  name: id,
  category: "viewpoint",
  location: [76, 12],
  kmFromStart: km,
  detourKm: 0.2,
  rating: null,
  ratingCount: 0,
  bestMonths: [],
  bestMonthsEstimated: false,
  thumbUrl: null,
  trending: false,
  notable: false,
  ...extra,
});

describe("storyStops", () => {
  it("spreads the picks along the route, best of each stretch, in km order", () => {
    const places = [
      place("a", 5),
      place("b", 8, { notable: true }),
      place("c", 150),
      place("d", 290, { category: "waterfall" }),
      place("e", 295),
    ];
    const picks = storyStops(places, 300, 3).map((p) => p.id);
    expect(picks).toEqual(["b", "c", "d"]);
  });

  it("fills empty stretches with the next best anywhere", () => {
    const places = [place("a", 1), place("b", 2), place("c", 3)];
    expect(storyStops(places, 300, 3).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(storyStops([], 300)).toEqual([]);
  });
});

describe("splitByGhats", () => {
  const line: LngLat[] = Array.from({ length: 11 }, (_, i) => [76, 12 + i * 0.01]);

  it("cuts the line into ghat and open runs that join up", () => {
    const runs = splitByGhats(line, [[0.5, 0.8]]);
    expect(runs.map((r) => r.ghat)).toEqual([false, true, false]);
    expect(runs[0]!.coords.at(-1)).toEqual(runs[1]!.coords[0]);
    expect(runs.reduce((n, r) => n + r.coords.length, 0)).toBe(line.length + 2);
  });

  it("gives one run without ghats", () => {
    expect(splitByGhats(line, [])).toEqual([{ coords: line, ghat: false }]);
  });
});

describe("thinLine", () => {
  it("keeps long lines small and their ends", () => {
    const line: LngLat[] = Array.from({ length: 10_001 }, (_, i) => [i, 0]);
    const thin = thinLine(line, 1500);
    expect(thin.length).toBeLessThanOrEqual(1501);
    expect(thin[0]).toEqual([0, 0]);
    expect(thin.at(-1)).toEqual([10_000, 0]);
  });
});

describe("storyFileName", () => {
  it("makes a tidy file name", () => {
    expect(storyFileName("Bengaluru → Kalasa via Sakleshpur")).toBe(
      "story-bengaluru-kalasa-via-sakleshpur.png",
    );
    expect(storyFileName("→")).toBe("story-trip.png");
  });
});

describe("GET /og/story", () => {
  it("draws the planner route named in the link, and a plain poster for an unknown one", async () => {
    vi.resetModules();
    vi.doMock("@/server/services/storyService", () => ({
      storyForRoute: vi.fn(async () => null),
      storyForTrip: vi.fn(async () => null),
      storyForRide: vi.fn(async () => null),
    }));
    const { storyForRoute, storyForRide } = await import("@/server/services/storyService");
    const { GET } = await import("@/app/og/story/route");
    const id = `${"b".repeat(32)}-1`;
    const res = await GET(
      new Request(
        `http://localhost/og/story?route=${id}&from=Pollachi@77.00873,10.65882&to=Valparai@76.95573,10.32799&v=car`,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("max-age=60");
    expect(storyForRoute).toHaveBeenCalledWith(
      id,
      [
        { label: "Pollachi", location: [77.00873, 10.65882] },
        { label: "Valparai", location: [76.95573, 10.32799] },
      ],
      "car",
    );
    await GET(new Request("http://localhost/og/story?ride=pollachi-to-valparai"));
    expect(storyForRide).toHaveBeenCalledWith("pollachi-to-valparai");
  }, 30_000);
});
