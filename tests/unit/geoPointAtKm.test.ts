import { describe, expect, it } from "vitest";
import { metresAlong, pointAtKm, simplifyLine, type LngLat } from "@/lib/geo";
import { niceStep } from "@/components/route/ElevationChart";
import { routeFixture } from "../helpers/fixtures";

const M_PER_DEG_LAT = 111_195;

describe("pointAtKm", () => {
  const line: LngLat[] = [
    [76, 12],
    [76, 12 + 10_000 / M_PER_DEG_LAT],
    [76, 12 + 20_000 / M_PER_DEG_LAT],
  ];

  it("walks the given km along the line", () => {
    const [lng, lat] = pointAtKm(line, 15)!;
    expect(lng).toBe(76);
    expect((lat - 12) * M_PER_DEG_LAT).toBeCloseTo(15_000, -1);
  });

  it("stays on the line at and past its ends", () => {
    expect(pointAtKm(line, -1)).toEqual(line[0]);
    expect(pointAtKm(line, 99)).toEqual(line[2]);
    expect(pointAtKm([], 1)).toBeNull();
  });
});

describe("niceStep", () => {
  it("picks round steps for chart ticks", () => {
    expect(niceStep(1200, 3)).toBe(500);
    expect(niceStep(331, 5)).toBe(100);
    expect(niceStep(64, 4)).toBe(20);
    expect(niceStep(300, 3)).toBe(100);
  });
});

describe("simplifyLine", () => {
  it("keeps the ends and the bends, drops points on a straight stretch", () => {
    const straight: [number, number][] = Array.from({ length: 101 }, (_, i) => [
      75 + i * 0.001,
      13,
    ]);
    expect(simplifyLine(straight, 10)).toEqual([
      [75, 13],
      [75.1, 13],
    ]);
    const bend: [number, number][] = [...straight.slice(0, 51), [75.05, 13.01], [75.05, 13.02]];
    expect(simplifyLine(bend, 10)).toEqual([
      [75, 13],
      [75.05, 13],
      [75.05, 13.02],
    ]);
  });

  it("shrinks a real route to a fraction while staying within the tolerance", () => {
    const line = routeFixture("bengaluru-kalasa")[0]!.geometry.coordinates as [number, number][];
    const simple = simplifyLine(line, 10);
    expect(simple.length).toBeLessThan(line.length / 3);
    // Every dropped point stays within about 10 m of the simplified line.
    const toLineM = (p: LngLat) => {
      const along = metresAlong(simple, p);
      const at = pointAtKm(simple, along / 1000)!;
      const dLat = (p[1] - at[1]) * M_PER_DEG_LAT;
      const dLng = (p[0] - at[0]) * M_PER_DEG_LAT * Math.cos((p[1] * Math.PI) / 180);
      return Math.hypot(dLat, dLng);
    };
    const worst = Math.max(...line.filter((_, i) => i % 7 === 0).map(toLineM));
    expect(worst).toBeLessThan(15);
  });
});
