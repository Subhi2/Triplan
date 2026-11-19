import { describe, expect, it } from "vitest";
import { doneCardDate } from "@/lib/doneCard";

const now = new Date("2026-06-01T00:00:00Z");

describe("doneCardDate", () => {
  it("formats a real past day", () => {
    expect(doneCardDate("2025-07-14", now)).toBe("14 Jul 2025");
  });
  it("drops anything else", () => {
    for (const v of [null, "", "yesterday", "2025-02-30", "2025-13-01", "2027-01-01", "<b>x</b>"]) {
      expect(doneCardDate(v, now)).toBeNull();
    }
  });
});
