import { beforeEach, describe, expect, it, vi } from "vitest";
import { allowedLink, newPlaceSchema } from "@/lib/contribute";

const createPlace = vi.fn();
const similarPlaces = vi.fn();
vi.mock("@/server/services/contributeService", () => ({ createPlace, similarPlaces }));
const gatePost = vi.fn();
vi.mock("@/server/services/postGate", () => ({ gatePost }));

const { GET, POST } = await import("@/app/api/places/contribute/route");

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
const place = { name: "Hidden falls", category: "waterfall", location: [75.6, 13.2] };

describe("Add a place (G11)", () => {
  it("takes a pin in India, a name and a kind; months, a note and a link are optional", () => {
    expect(newPlaceSchema.parse({ ...place, bestMonths: [9, 8, 8] })).toMatchObject({
      bestMonths: [8, 9],
      note: "",
      link: "",
    });
    expect(newPlaceSchema.safeParse({ ...place, location: [2.35, 48.85] }).success).toBe(false);
    expect(newPlaceSchema.safeParse({ ...place, category: "town" }).success).toBe(false);
    expect(newPlaceSchema.safeParse({ ...place, name: "x" }).success).toBe(false);
  });

  it("keeps only YouTube and Instagram links", () => {
    expect(allowedLink("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(allowedLink("https://youtu.be/abc")).toBe(true);
    expect(allowedLink("https://www.instagram.com/p/abc/")).toBe(true);
    expect(allowedLink("https://example.com/video")).toBe(false);
    expect(allowedLink("http://youtube.com/watch?v=abc")).toBe(false);
  });
});

describe("/api/places/contribute", () => {
  beforeEach(() => {
    createPlace.mockReset().mockResolvedValue("hidden-falls-abc123");
    similarPlaces.mockReset().mockResolvedValue([]);
    gatePost.mockReset().mockResolvedValue(null);
  });

  const post = (body: unknown) =>
    POST(
      new Request("http://x/api/places/contribute", { method: "POST", body: JSON.stringify(body) }),
    );

  it("saves a place that passed the gate, to wait for an admin", async () => {
    const res = await post({ place, pow, deviceKey });
    expect(res.status).toBe(201);
    expect(createPlace).toHaveBeenCalledWith(expect.objectContaining({ name: "Hidden falls" }));
  });

  it("stops at the gate and refuses a bad place", async () => {
    gatePost.mockResolvedValue(Response.json({ error: "x" }, { status: 429 }));
    expect((await post({ place, pow, deviceKey })).status).toBe(429);
    gatePost.mockResolvedValue(null);
    expect(
      (await post({ place: { ...place, link: "https://evil.example" }, pow, deviceKey })).status,
    ).toBe(400);
    expect(createPlace).not.toHaveBeenCalled();
  });

  it("lists similar places near the pin", async () => {
    similarPlaces.mockResolvedValue([
      { slug: "a", name: "Hidden Falls", category: "waterfall", distanceM: 120 },
    ]);
    const res = await GET(
      new Request("http://x/api/places/contribute?name=Hidden%20falls&lng=75.6&lat=13.2"),
    );
    expect(await res.json()).toEqual({
      similar: [{ slug: "a", name: "Hidden Falls", category: "waterfall", distanceM: 120 }],
    });
    expect(similarPlaces).toHaveBeenCalledWith("Hidden falls", [75.6, 13.2]);
  });
});
