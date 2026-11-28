import { beforeEach, describe, expect, it, vi } from "vitest";

const placeBySlug = vi.fn();
const savePlaceFlag = vi.fn();
vi.mock("@/server/services/riderPostService", () => ({ placeBySlug, savePlaceFlag }));
const gatePost = vi.fn();
vi.mock("@/server/services/postGate", () => ({ gatePost }));

const { POST } = await import("@/app/api/places/[slug]/flags/route");

const place = { id: "p1", name: "Manjarabad Fort", slug: "manjarabad-fort" };
const deviceKey = "A".repeat(43);
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
const params = Promise.resolve({ slug: "manjarabad-fort" });
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/places/manjarabad-fort/flags", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params },
  );

describe("POST /api/places/[slug]/flags", () => {
  beforeEach(() => {
    placeBySlug.mockReset().mockResolvedValue(place);
    savePlaceFlag.mockReset().mockResolvedValue(undefined);
    gatePost.mockReset().mockResolvedValue(null);
  });

  it("saves a flag that passed the gate, for an admin only", async () => {
    const flag = { kind: "closed", note: "Gate locked, board says closed for repairs" };
    const res = await post({ flag, pow, deviceKey });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "pending" });
    expect(savePlaceFlag).toHaveBeenCalledWith(place, flag, deviceKey);
  });

  it("asks for a note only when the kind is 'other'", async () => {
    expect((await post({ flag: { kind: "duplicate", note: "" }, pow, deviceKey })).status).toBe(
      201,
    );
    expect((await post({ flag: { kind: "other", note: " " }, pow, deviceKey })).status).toBe(400);
  });

  it("stops at the gate and never saves a bad or misplaced flag", async () => {
    const flag = { kind: "wrong_location", note: "" };
    gatePost.mockResolvedValue(Response.json({ error: "x" }, { status: 429 }));
    expect((await post({ flag, pow, deviceKey })).status).toBe(429);
    gatePost.mockResolvedValue(null);
    expect((await post({ flag: { kind: "spam", note: "" }, pow, deviceKey })).status).toBe(400);
    expect((await post({ flag, deviceKey })).status).toBe(400);
    expect((await post({ flag, pow, deviceKey: "short" })).status).toBe(400);
    placeBySlug.mockResolvedValue(null);
    expect((await post({ flag, pow, deviceKey })).status).toBe(404);
    expect(savePlaceFlag).not.toHaveBeenCalled();
  });

  it("says so when saving fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    savePlaceFlag.mockRejectedValue(new Error("db down"));
    const res = await post({ flag: { kind: "closed", note: "" }, pow, deviceKey });
    expect(res.status).toBe(500);
  });
});
