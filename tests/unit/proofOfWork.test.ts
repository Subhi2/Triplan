import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/server/db", () => ({ getDb: () => ({ execute }) }));

const { newChallenge, powPayloadSchema, spendProofOfWork, POW_TTL_S } =
  await import("@/server/services/proofOfWork");

const KEY = "test-key-not-a-secret";

/** A challenge solved the way the browser does it. */
async function solved(now = Date.now()) {
  // A cheap challenge: the checks are the same, the solving is fast.
  const challenge = await newChallenge(KEY, now, 20);
  const solution = await solveChallenge({ challenge, deriveKey });
  if (!solution) throw new Error("not solved");
  return powPayloadSchema.parse({ challenge, solution });
}

describe("proof of work", { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.stubEnv("ALTCHA_HMAC_KEY", KEY);
    execute.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a solved challenge once and records it as spent", async () => {
    const payload = await solved();
    expect(await spendProofOfWork(payload)).toBe("ok");
    expect(execute).toHaveBeenCalledTimes(1);
    // The database already has it: the same answer cannot pay for a second post.
    execute.mockResolvedValue([]);
    expect(await spendProofOfWork(payload)).toBe("used");
  });

  it("refuses a changed challenge or a wrong answer", async () => {
    const payload = await solved();
    const cheaper = structuredClone(payload);
    cheaper.challenge.parameters.cost = 1;
    expect(await spendProofOfWork(cheaper)).toBe("invalid");
    // Only solving gives the derived key; it is checked against its signed hash.
    const wrong = structuredClone(payload);
    wrong.solution.derivedKey = wrong.solution.derivedKey.replace(/^./, (c) =>
      c === "0" ? "1" : "0",
    );
    expect(await spendProofOfWork(wrong)).toBe("invalid");
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses an expired challenge and one signed with another key", async () => {
    const old = await solved(Date.now() - (POW_TTL_S + 60) * 1000);
    expect(await spendProofOfWork(old)).toBe("expired");
    const payload = await solved();
    vi.stubEnv("ALTCHA_HMAC_KEY", "another-key");
    expect(await spendProofOfWork(payload)).toBe("invalid");
  });

  it("is closed without a key", async () => {
    const payload = await solved();
    vi.stubEnv("ALTCHA_HMAC_KEY", "");
    expect(await spendProofOfWork(payload)).toBe("closed");
  });

  it("takes only the challenge shape it hands out", () => {
    expect(
      powPayloadSchema.safeParse({
        challenge: { parameters: { algorithm: "SHA-1" }, signature: "x" },
        solution: { counter: 1, derivedKey: "00" },
      }).success,
    ).toBe(false);
  });
});
