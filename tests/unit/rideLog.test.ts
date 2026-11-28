import { beforeEach, describe, expect, it, vi } from "vitest";
import { logEntrySchema, totalsByYear, yearCardPath, type RideLogEntry } from "@/lib/rideLog";

vi.mock("@/lib/community/enabled", () => ({ communityEnabled: true, COMMUNITY_LOCAL_AUTH: true }));
const currentRider = vi.fn();
vi.mock("@/server/services/riderService", () => ({ currentRider }));
vi.mock("@/server/services/writeLimit", () => ({ allowWrite: vi.fn(async () => true) }));
class CommunityError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
vi.mock("@/server/services/clubService", () => ({ CommunityError }));
const logOf = vi.fn();
const addToLog = vi.fn();
const removeFromLog = vi.fn();
vi.mock("@/server/services/rideLogService", () => ({ logOf, addToLog, removeFromLog }));

const { GET, POST } = await import("@/app/api/me/log/route");

const entry = (riddenOn: string, km: number, hairpins = 0): RideLogEntry => ({
  id: riddenOn,
  riddenOn,
  title: "A ride",
  distanceKm: km,
  hairpins,
  climbM: null,
  rideSlug: null,
});

describe("My rides (G11)", () => {
  it("adds up each year, newest first, and makes a card link of numbers only", () => {
    const years = totalsByYear([
      entry("2026-11-02", 330.6, 20),
      entry("2026-03-10", 120.2),
      entry("2025-12-25", 80),
    ]);
    expect(years).toEqual([
      { year: 2026, rides: 2, km: 451, hairpins: 20 },
      { year: 2025, rides: 1, km: 80, hairpins: 0 },
    ]);
    expect(yearCardPath(years[0]!)).toBe("/og/year?y=2026&r=2&km=451&hp=20");
  });

  it("takes a ride with a day, a name and its km, not one in the future", () => {
    const ok = logEntrySchema.parse({
      riddenOn: "2026-11-01",
      title: " Ghat loop ",
      distanceKm: 90,
    });
    expect(ok).toMatchObject({ title: "Ghat loop", hairpins: 0, climbM: null, tripId: null });
    expect(
      logEntrySchema.safeParse({ riddenOn: "2999-01-01", title: "x", distanceKm: 9 }).success,
    ).toBe(false);
    expect(
      logEntrySchema.safeParse({ riddenOn: "2026-11-01", title: "x", distanceKm: 0 }).success,
    ).toBe(false);
  });
});

describe("/api/me/log", () => {
  beforeEach(() => {
    currentRider.mockReset().mockResolvedValue({ id: "r1", nickname: "Asha" });
    logOf.mockReset().mockResolvedValue([]);
    addToLog.mockReset().mockResolvedValue(undefined);
  });

  it("is the rider's own: nobody without a nickname reads or writes it", async () => {
    currentRider.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    const res = await POST(
      new Request("http://x/api/me/log", {
        method: "POST",
        body: JSON.stringify({ riddenOn: "2026-11-01", title: "x", distanceKm: 9 }),
      }),
    );
    expect(res.status).toBe(401);
    expect(addToLog).not.toHaveBeenCalled();
  });

  it("logs a ride for the rider", async () => {
    const res = await POST(
      new Request("http://x/api/me/log", {
        method: "POST",
        body: JSON.stringify({ riddenOn: "2026-11-01", title: "Kalasa", distanceKm: 330 }),
      }),
    );
    expect(res.status).toBe(201);
    expect(addToLog).toHaveBeenCalledWith("r1", expect.objectContaining({ title: "Kalasa" }));
  });
});
