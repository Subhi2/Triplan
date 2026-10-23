import { beforeEach, describe, expect, it, vi } from "vitest";

const placeBySlug = vi.fn();
const saveReview = vi.fn();
const deleteReview = vi.fn();
vi.mock("@/server/services/riderPostService", () => ({ placeBySlug, saveReview, deleteReview }));
const gatePost = vi.fn();
vi.mock("@/server/services/postGate", () => ({ gatePost }));
vi.mock("@/server/services/writeLimit", () => ({ allowWrite: async () => true }));

const { POST, DELETE } = await import("@/app/api/places/[slug]/reviews/route");

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
const review = {
  rating: 5,
  body: "Worth the climb.",
  nickname: "Asha",
  visitedMonth: 7,
  visitedYear: 2026,
  vehicleUsed: "bike",
};
const params = Promise.resolve({ slug: "manjarabad-fort" });
const call = (method: "POST" | "DELETE", body: unknown) =>
  (method === "POST" ? POST : DELETE)(
    new Request("http://localhost/api/places/manjarabad-fort/reviews", {
      method,
      body: JSON.stringify(body),
    }),
    { params },
  );

describe("/api/places/[slug]/reviews", () => {
  beforeEach(() => {
    placeBySlug.mockReset().mockResolvedValue(place);
    saveReview.mockReset().mockResolvedValue({ moderation: null });
    deleteReview.mockReset().mockResolvedValue(true);
    gatePost.mockReset().mockResolvedValue(null);
  });

  it("saves a review that passed the gate as waiting for an admin", async () => {
    const res = await call("POST", { review, pow, deviceKey });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "pending" });
    expect(saveReview).toHaveBeenCalledWith(place, review, deviceKey);
  });

  it("stops at the gate, and never saves a bad or misplaced review", async () => {
    gatePost.mockResolvedValue(Response.json({ error: "x" }, { status: 403 }));
    expect((await call("POST", { review, pow, deviceKey })).status).toBe(403);
    gatePost.mockResolvedValue(null);
    expect((await call("POST", { review: { ...review, rating: 9 }, pow, deviceKey })).status).toBe(
      400,
    );
    expect((await call("POST", { review, pow, deviceKey: "short" })).status).toBe(400);
    expect((await call("POST", { review, deviceKey })).status).toBe(400);
    placeBySlug.mockResolvedValue(null);
    expect((await call("POST", { review, pow, deviceKey })).status).toBe(404);
    expect(saveReview).not.toHaveBeenCalled();
  });

  it("deletes only this device's review", async () => {
    expect((await call("DELETE", { deviceKey })).status).toBe(200);
    expect(deleteReview).toHaveBeenCalledWith(place, deviceKey);
    deleteReview.mockResolvedValue(false);
    expect((await call("DELETE", { deviceKey })).status).toBe(404);
    expect((await call("DELETE", {})).status).toBe(400);
  });
});
