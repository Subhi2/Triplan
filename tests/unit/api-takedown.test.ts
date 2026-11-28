import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentReportInputSchema, ownPath } from "@/lib/riderPosts";

const saveContentReport = vi.fn();
vi.mock("@/server/services/riderPostService", () => ({ saveContentReport }));
const gatePost = vi.fn();
vi.mock("@/server/services/postGate", () => ({ gatePost }));

const { POST } = await import("@/app/api/takedown/route");

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
const report = {
  path: "/place/manjarabad-fort",
  kind: "copyright",
  note: "The second photo is mine and was uploaded without asking.",
  contact: "",
};
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/takedown", { method: "POST", body: JSON.stringify(body) }),
  );

describe("ownPath", () => {
  const site = "https://example.org";
  it("keeps links to this site as their path", () => {
    expect(ownPath("https://example.org/place/x?y=1", site)).toBe("/place/x?y=1");
    expect(ownPath("/rides/a", site)).toBe("/rides/a");
  });
  it("refuses other sites and empty input", () => {
    expect(ownPath("https://elsewhere.example/place/x", site)).toBeNull();
    expect(ownPath("  ", site)).toBeNull();
  });
});

describe("contentReportInputSchema", () => {
  it("turns an empty contact into null", () => {
    expect(contentReportInputSchema.parse(report).contact).toBeNull();
  });
  it("needs a path on this site and a reason", () => {
    expect(contentReportInputSchema.safeParse({ ...report, path: "https://x.y/a" }).success).toBe(
      false,
    );
    expect(contentReportInputSchema.safeParse({ ...report, note: "bad" }).success).toBe(false);
  });
});

describe("POST /api/takedown", () => {
  beforeEach(() => {
    saveContentReport.mockReset().mockResolvedValue(undefined);
    gatePost.mockReset().mockResolvedValue(null);
  });

  it("saves a request that passed the gate", async () => {
    const res = await post({ report, pow, deviceKey });
    expect(res.status).toBe(201);
    expect(saveContentReport).toHaveBeenCalledWith({ ...report, contact: null }, deviceKey);
  });

  it("stops at the gate and refuses a bad request", async () => {
    gatePost.mockResolvedValue(Response.json({ error: "x" }, { status: 503 }));
    expect((await post({ report, pow, deviceKey })).status).toBe(503);
    gatePost.mockResolvedValue(null);
    expect((await post({ report: { ...report, kind: "spam" }, pow, deviceKey })).status).toBe(400);
    expect((await post({ report, deviceKey })).status).toBe(400);
    expect(saveContentReport).not.toHaveBeenCalled();
  });
});
