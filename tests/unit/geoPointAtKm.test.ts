import { describe, expect, it } from "vitest";
import { pointAtKm, type LngLat } from "@/lib/geo";
import { niceStep } from "@/components/route/ElevationChart";

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
