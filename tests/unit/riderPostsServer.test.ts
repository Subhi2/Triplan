import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminEmails, isAdminEmail } from "@/server/auth/admin";
import {
  createAnthropicModerationProvider,
  MODERATION_SYSTEM_PROMPT,
} from "@/server/providers/llm/moderation";

describe("admins", () => {
  it("come only from ADMIN_EMAILS, in any case", () => {
    expect(adminEmails(" Admin@Example.com, ,other@x.in ")).toEqual([
      "admin@example.com",
      "other@x.in",
    ]);
    expect(isAdminEmail("ADMIN@example.com", "admin@example.com")).toBe(true);
    expect(isAdminEmail("someone@example.com", "admin@example.com")).toBe(false);
    expect(isAdminEmail("admin@example.com", "")).toBe(false);
    expect(isAdminEmail(null, "admin@example.com")).toBe(false);
  });
});

describe("the pre-screen", () => {
  function client(response: unknown) {
    const parse = vi.fn().mockResolvedValue(response);
    return { client: { messages: { parse } } as unknown as Anthropic, parse };
  }

  it("sends the post as data with its place, and returns the verdict with the model", async () => {
    const { client: c, parse } = client({
      stop_reason: "end_turn",
      parsed_output: { verdict: "spam", reason: "Sells bike parts. ".repeat(40) },
    });
    const provider = createAnthropicModerationProvider("key", "claude-haiku-4-5", c);
    const result = await provider.screen("review", "Manjarabad Fort", "Buy cheap tyres at…");
    expect(result).toMatchObject({ verdict: "spam", model: "claude-haiku-4-5" });
    expect(result!.reason.length).toBeLessThanOrEqual(300);
    const call = parse.mock.calls[0]![0];
    expect(call.system).toBe(MODERATION_SYSTEM_PROMPT);
    expect(call.messages[0].content).toContain("<place>Manjarabad Fort</place>");
    expect(call.messages[0].content).toContain("<post>Buy cheap tyres at…</post>");
  });

  it("gives no verdict when the model refuses", async () => {
    const { client: c } = client({ stop_reason: "refusal", parsed_output: null });
    const provider = createAnthropicModerationProvider("key", "claude-haiku-4-5", c);
    expect(await provider.screen("road_report", "a road", "x")).toBeNull();
  });
});

// The gate every post passes: open, under the hourly limit, a fresh proof of work.
const allowWrite = vi.fn();
vi.mock("@/server/services/writeLimit", () => ({ allowWrite }));
const spendProofOfWork = vi.fn();
vi.mock("@/server/services/proofOfWork", async (original) => ({
  ...(await original<typeof import("@/server/services/proofOfWork")>()),
  spendProofOfWork,
}));

describe("gatePost", async () => {
  const { gatePost } = await import("@/server/services/postGate");
  const req = new Request("http://localhost/api/road-reports", { method: "POST" });
  const pow = {} as Parameters<typeof gatePost>[1];

  beforeEach(() => {
    vi.stubEnv("ALTCHA_HMAC_KEY", "k");
    allowWrite.mockReset().mockResolvedValue(true);
    spendProofOfWork.mockReset().mockResolvedValue("ok");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("lets a post through once its proof of work is spent", async () => {
    expect(await gatePost(req, pow)).toBeNull();
    expect(spendProofOfWork).toHaveBeenCalledTimes(1);
  });

  it("is closed without a key, and refuses over the limit or a bad proof", async () => {
    allowWrite.mockResolvedValue(false);
    expect((await gatePost(req, pow))!.status).toBe(429);
    expect(spendProofOfWork).not.toHaveBeenCalled();
    allowWrite.mockResolvedValue(true);
    for (const check of ["invalid", "used", "expired"]) {
      spendProofOfWork.mockResolvedValue(check);
      expect((await gatePost(req, pow))!.status).toBe(403);
    }
    vi.stubEnv("ALTCHA_HMAC_KEY", "");
    expect((await gatePost(req, pow))!.status).toBe(503);
  });
});
