import { describe, expect, it } from "vitest";
import type { LngLat } from "@/lib/geo";
import {
  breakMinutes,
  defaultDeparture,
  fromDateTimeLocal,
  fuelVerdict,
  longestFuelGap,
  planDaylight,
  toDateTimeLocal,
} from "@/lib/rideCheck";

const BENGALURU: LngLat = [77.5946, 12.9716];
const KALASA: LngLat = [75.356, 13.234];

describe("longestFuelGap", () => {
  it("finds the longest stretch between pumps, counting from the start and to the end", () => {
    const stations = [
      { name: "Nelamangala", kmFromStart: 30 },
      { name: "Hassan", kmFromStart: 180 },
      { name: "Kunigal", kmFromStart: 70 },
    ];
    expect(longestFuelGap(stations, 330, "Bengaluru", "Kalasa")).toEqual({
      fromKm: 180,
      toKm: 330,
      km: 150,
      from: "Hassan",
      to: "Kalasa",
    });
    expect(longestFuelGap(stations, 200, "Bengaluru", "Hassan").from).toBe("Kunigal");
  });

  it("covers the whole trip when there is no pump", () => {
    expect(longestFuelGap([], 120, "A", "B")).toMatchObject({ km: 120, from: "A", to: "B" });
  });
});

describe("fuelVerdict", () => {
  it("wants a quarter of the range in reserve", () => {
    expect(fuelVerdict(150, 200)).toBe("ok");
    expect(fuelVerdict(180, 200)).toBe("tight");
    expect(fuelVerdict(201, 200)).toBe("short");
  });
});

describe("breakMinutes", () => {
  it("adds 15 minutes for every full 2 hours", () => {
    expect(breakMinutes(119)).toBe(0);
    expect(breakMinutes(120)).toBe(15);
    expect(breakMinutes(330)).toBe(30);
  });
});

describe("planDaylight (Bengaluru → Kalasa, 3 October 2026)", () => {
  // Times in UTC; India is UTC+5:30. Sunset in Kalasa is about 18:20 IST (12:50 UTC).
  const ride = (departUtc: string, rideMin = 300) =>
    planDaylight({ departAt: new Date(departUtc), rideMin, start: BENGALURU, end: KALASA });

  it("puts sunset at the destination in the early evening", () => {
    const { sunsetAtEnd, dawnAtStart } = ride("2026-10-03T00:30:00Z");
    expect(sunsetAtEnd.getTime()).toBeGreaterThan(Date.parse("2026-10-03T12:30:00Z"));
    expect(sunsetAtEnd.getTime()).toBeLessThan(Date.parse("2026-10-03T13:10:00Z"));
    // Civil dawn in Bengaluru is about 05:45 IST (00:15 UTC), 20 minutes before sunrise.
    expect(dawnAtStart.getTime()).toBeGreaterThan(Date.parse("2026-10-03T00:00:00Z"));
    expect(dawnAtStart.getTime()).toBeLessThan(Date.parse("2026-10-03T00:30:00Z"));
  });

  it("an early start arrives in daylight, with breaks added", () => {
    const plan = ride("2026-10-03T00:30:00Z"); // 06:00 IST
    expect(plan.breakMin).toBe(30);
    expect(plan.arriveAt.toISOString()).toBe("2026-10-03T06:00:00.000Z");
    expect(plan.verdict).toBe("day");
    expect(plan.startsInDark).toBe(false);
    expect(plan.longDay).toBe(false);
    // Latest start: sunset, less an hour, less 5 h 30 min on the road.
    expect(plan.latestStart.getTime()).toBe(plan.sunsetAtEnd.getTime() - (60 + 330) * 60_000);
  });

  it("arriving within the last hour of light is dusk, after sunset is dark", () => {
    expect(ride("2026-10-03T06:30:00Z").verdict).toBe("dusk"); // arrive 17:30 IST
    expect(ride("2026-10-03T09:00:00Z").verdict).toBe("dark"); // arrive 20:00 IST
  });

  it("flags a start before sunrise and a very long day", () => {
    expect(ride("2026-10-02T23:30:00Z").startsInDark).toBe(true); // 05:00 IST
    expect(ride("2026-10-03T00:30:00Z", 600).longDay).toBe(true);
  });
});

describe("departure time values", () => {
  it("defaults to 06:00 tomorrow", () => {
    expect(defaultDeparture(new Date(2026, 8, 29, 23, 45))).toBe("2026-09-30T06:00");
    expect(defaultDeparture(new Date(2026, 11, 31, 10, 0))).toBe("2027-01-01T06:00");
  });

  it("round-trips datetime-local values as local time", () => {
    const d = fromDateTimeLocal("2026-10-03T06:05")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 9, 3, 6, 5,
    ]);
    expect(toDateTimeLocal(d)).toBe("2026-10-03T06:05");
    expect(fromDateTimeLocal("tomorrow")).toBeNull();
  });
});
