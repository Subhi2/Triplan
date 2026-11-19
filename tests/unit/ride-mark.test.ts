import { beforeEach, describe, expect, it, vi } from "vitest";
import { rideMarkSchema } from "@/lib/community/schemas";

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
const marksOf = vi.fn();
const saveMark = vi.fn();
const removeMark = vi.fn();
vi.mock("@/server/services/rideMarkService", () => ({ marksOf, saveMark, removeMark }));

const put = (body: unknown) =>
  new Request("http://x/api/me/rides", { method: "PUT", body: JSON.stringify(body) });

describe("rideMarkSchema", () => {
  it("takes a pending mark and a done mark with a date and note", () => {
    expect(rideMarkSchema.safeParse({ rideSlug: "manali-to-leh", status: "pending" }).success).toBe(
      true,
    );
    const done = rideMarkSchema.safeParse({
      rideSlug: "manali-to-leh",
      status: "done",
      doneOn: "2025-07-01",
      note: " Rode in July ",
    });
    expect(done.success && done.data.note).toBe("Rode in July");
  });

  it("rejects a date or note on a pending ride, a future date and a bad slug", () => {
    const bad = [
      { rideSlug: "a", status: "pending", doneOn: "2025-07-01" },
      { rideSlug: "a", status: "done", doneOn: "2999-01-01" },
      { rideSlug: "A b", status: "done" },
      { rideSlug: "a", status: "done", doneOn: "2025-13-45" },
    ];
    for (const b of bad) expect(rideMarkSchema.safeParse(b).success).toBe(false);
  });
});

describe("/api/me/rides", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for a nickname first", async () => {
    currentRider.mockResolvedValue(null);
    const { GET, PUT } = await import("@/app/api/me/rides/route");
    expect((await GET()).status).toBe(401);
    expect((await PUT(put({ rideSlug: "a", status: "done" }))).status).toBe(401);
    expect(saveMark).not.toHaveBeenCalled();
  });

  it("saves only this rider's own mark and reads only theirs", async () => {
    currentRider.mockResolvedValue({ id: "r1", nickname: "Ghat", isAnonymous: true });
    saveMark.mockResolvedValue({ rideSlug: "a", status: "done", doneOn: null, note: "" });
    marksOf.mockResolvedValue([]);
    const { GET, PUT } = await import("@/app/api/me/rides/route");
    expect((await PUT(put({ rideSlug: "a", status: "done" }))).status).toBe(200);
    expect(saveMark).toHaveBeenCalledWith("r1", expect.objectContaining({ rideSlug: "a" }));
    await GET();
    expect(marksOf).toHaveBeenCalledWith("r1");
  });

  it("answers 400 for bad input and the service's status for an unknown ride", async () => {
    currentRider.mockResolvedValue({ id: "r1", nickname: "Ghat", isAnonymous: true });
    const { PUT } = await import("@/app/api/me/rides/route");
    expect((await PUT(put({ rideSlug: "a", status: "later" }))).status).toBe(400);
    saveMark.mockRejectedValue(new CommunityError("Ride not found", 404));
    expect((await PUT(put({ rideSlug: "zz", status: "pending" }))).status).toBe(404);
  });
});
