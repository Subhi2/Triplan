import { describe, expect, it } from "vitest";
import { formatDuration, formatKm } from "@/lib/format";

describe("formatKm", () => {
  it("shows metres as km with one decimal", () => {
    expect(formatKm(0)).toBe("0.0 km");
    expect(formatKm(1234)).toBe("1.2 km");
    expect(formatKm(282_650)).toBe("282.7 km");
  });
});

describe("formatDuration", () => {
  it("shows minutes as hours and minutes", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(284.6)).toBe("4 h 45 min");
  });
});
