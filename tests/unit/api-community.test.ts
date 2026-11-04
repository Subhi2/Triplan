import { beforeEach, describe, expect, it, vi } from "vitest";

// Community routes (docs/02, "Community (G6)") with the services mocked: who may call them, the
// proof of work on posts, and service errors turned into their status.

vi.mock("@/lib/community/enabled", () => ({ communityEnabled: true, COMMUNITY_LOCAL_AUTH: true }));

const currentRider = vi.fn();
const saveRider = vi.fn();
const deleteRider = vi.fn();
vi.mock("@/server/services/riderService", () => ({ currentRider, saveRider, deleteRider }));

const accountForNewRider = vi.fn();
vi.mock("@/server/auth/session", () => ({
  accountForNewRider,
  currentAccount: vi.fn(async () => null),
  endSession: vi.fn(async () => {}),
}));

class CommunityError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
const createClub = vi.fn();
vi.mock("@/server/services/clubService", () => ({
  CommunityError,
  createClub,
  listClubs: vi.fn(async () => []),
  clubsOf: vi.fn(async () => []),
}));

const requestToJoin = vi.fn();
const actOnRideMember = vi.fn();
vi.mock("@/server/services/groupRideService", () => ({
  requestToJoin,
  actOnRideMember,
  leaveRide: vi.fn(),
  ridesOf: vi.fn(async () => []),
}));

const gatePost = vi.fn();
vi.mock("@/server/services/postGate", () => ({ gatePost }));
vi.mock("@/server/services/writeLimit", () => ({ allowWrite: async () => true }));

const me = { id: "11111111-1111-4111-8111-111111111111", nickname: "Asha", isAnonymous: true };
const rideId = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const pow = {
  challenge: {
    parameters: {
      algorithm: "PBKDF2/SHA-256",
      nonce: "n",
      salt: "s",
      cost: 1000,
      keyLength: 32,
      keyPrefix: "ab",
      keySignature: "k",
      expiresAt: 1,
    },
    signature: "sig",
  },
  solution: { counter: 3, derivedKey: "ab12" },
};

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) });

const meRoute = await import("@/app/api/me/route");
const clubsRoute = await import("@/app/api/clubs/route");
const requestsRoute = await import("@/app/api/group-rides/[id]/requests/route");
const decideRoute = await import("@/app/api/group-rides/[id]/requests/[riderId]/route");

describe("community API", () => {
  beforeEach(() => {
    currentRider.mockReset().mockResolvedValue(me);
    saveRider
      .mockReset()
      .mockImplementation(async (a, nickname) => ({ ...me, id: a.id, nickname }));
    accountForNewRider.mockReset().mockResolvedValue({ id: me.id, isAnonymous: true });
    createClub.mockReset().mockResolvedValue({ slug: "hassan-riders" });
    requestToJoin.mockReset().mockResolvedValue("pending");
    actOnRideMember.mockReset().mockResolvedValue(undefined);
    gatePost.mockReset().mockResolvedValue(null);
  });

  it("saves a nickname on the request's account", async () => {
    const res = await meRoute.POST(post("/api/me", { nickname: "  Asha  " }));
    expect(res.status).toBe(200);
    expect(saveRider).toHaveBeenCalledWith({ id: me.id, isAnonymous: true }, "Asha");
  });

  it("asks the browser to sign in first when there is no account", async () => {
    accountForNewRider.mockResolvedValue(null);
    const res = await meRoute.POST(post("/api/me", { nickname: "Asha" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "NO_ACCOUNT" });
  });

  it("answers GET /api/me with no rider for a visitor", async () => {
    currentRider.mockResolvedValue(null);
    const res = await meRoute.GET();
    expect(await res.json()).toEqual({ me: null });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("needs a nickname before starting a club", async () => {
    currentRider.mockResolvedValue(null);
    const res = await clubsRoute.POST(
      post("/api/clubs", { club: { name: "Hassan Riders", homeLabel: "Hassan" }, pow }),
    );
    expect(res.status).toBe(401);
    expect(createClub).not.toHaveBeenCalled();
  });

  it("starts a club only after the proof of work passes", async () => {
    gatePost.mockResolvedValueOnce(Response.json({ error: "No" }, { status: 403 }));
    const body = { club: { name: "Hassan Riders", homeLabel: "Hassan" }, pow };
    expect((await clubsRoute.POST(post("/api/clubs", body))).status).toBe(403);
    expect(createClub).not.toHaveBeenCalled();
    const res = await clubsRoute.POST(post("/api/clubs", body));
    expect(res.status).toBe(201);
    expect(createClub).toHaveBeenCalledWith(
      me.id,
      expect.objectContaining({ name: "Hassan Riders" }),
    );
  });

  it("turns a service's refusal into its status", async () => {
    createClub.mockRejectedValue(new CommunityError("You can own up to 3 clubs.", 409));
    const res = await clubsRoute.POST(
      post("/api/clubs", { club: { name: "Hassan Riders", homeLabel: "Hassan" }, pow }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "You can own up to 3 clubs." });
  });

  it("sends a join request with its note and answers where it landed", async () => {
    requestToJoin.mockResolvedValue("waitlist");
    const res = await requestsRoute.POST(
      post(`/api/group-rides/${rideId}/requests`, { request: { note: "Classic 350" }, pow }),
      { params: Promise.resolve({ id: rideId }) },
    );
    expect(await res.json()).toEqual({ status: "waitlist" });
    expect(requestToJoin).toHaveBeenCalledWith(rideId, me.id, {
      note: "Classic 350",
      pillion: false,
    });
  });

  it("refuses unknown actions and bad ids before calling the service", async () => {
    const params = Promise.resolve({ id: rideId, riderId: other });
    expect((await decideRoute.POST(post("/x", { action: "promote" }), { params })).status).toBe(
      400,
    );
    const bad = Promise.resolve({ id: "nope", riderId: other });
    expect(
      (await decideRoute.POST(post("/x", { action: "approve" }), { params: bad })).status,
    ).toBe(404);
    expect(actOnRideMember).not.toHaveBeenCalled();
    const ok = await decideRoute.POST(post("/x", { action: "approve" }), { params });
    expect(ok.status).toBe(200);
    expect(actOnRideMember).toHaveBeenCalledWith(rideId, me.id, other, "approve");
  });
});
