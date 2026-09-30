import { describe, expect, it } from "vitest";
import { bestTimeSummary, isInSeason, monthIn } from "@/lib/months";

describe("isInSeason", () => {
  it("is true only in a best month", () => {
    expect(isInSeason([10, 11, 12, 1, 2], 1)).toBe(true);
    expect(isInSeason([10, 11, 12, 1, 2], 6)).toBe(false);
    expect(isInSeason([], 6)).toBe(false);
  });
});

describe("monthIn", () => {
  it("reads the month in the given time zone", () => {
    // 20:00 UTC on 31 Jan is 01:30 on 1 Feb in India.
    const t = new Date("2026-01-31T20:00:00Z");
    expect(monthIn("UTC", t)).toBe(1);
    expect(monthIn("Asia/Kolkata", t)).toBe(2);
  });
});

describe("bestTimeSummary", () => {
  it("names the best months or says they are not known", () => {
    expect(bestTimeSummary([10, 11, 12, 1, 2])).toBe("Best Oct–Feb");
    expect(bestTimeSummary([])).toBe("Best time not known yet");
  });
});
