import { describe, expect, it } from "vitest";
import { formatKm } from "@/lib/format";

describe("formatKm", () => {
  it("shows metres as km with one decimal", () => {
    expect(formatKm(0)).toBe("0.0 km");
    expect(formatKm(1234)).toBe("1.2 km");
    expect(formatKm(282_650)).toBe("282.7 km");
  });
});
