import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/providers/llm", () => ({ getTripIntentProvider: vi.fn() }));
vi.mock("@/server/services/writeLimit", () => ({ allowRequest: vi.fn() }));
vi.mock("@/server/services/usage", () => ({ takeDailyBudget: vi.fn(), countLater: vi.fn() }));
vi.mock("@/server/services/tripFromWordsService", () => ({
  tripFromWords: vi.fn(),
  defaultWordsDeps: vi.fn(() => ({})),
}));

const { getTripIntentProvider } = await import("@/server/providers/llm");
const { allowRequest } = await import("@/server/services/writeLimit");
const { takeDailyBudget, countLater } = await import("@/server/services/usage");
const { tripFromWords } = await import("@/server/services/tripFromWordsService");
const { POST } = await import("@/app/api/trip-from-words/route");

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/trip-from-words", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

const trip = {
  from: { label: "Pune", location: [73.85, 18.52] },
  via: [],
  to: { label: "Kolad", location: [73.22, 18.39] },
  vehicle: "bike",
  corridorKm: 5,
  categories: ["waterfall"],
  maxDetourKm: null,
};

describe("POST /api/trip-from-words", () => {
  beforeEach(() => {
    vi.mocked(getTripIntentProvider).mockReturnValue({ parseTrip: vi.fn() });
    vi.mocked(allowRequest).mockReset().mockResolvedValue(true);
    vi.mocked(takeDailyBudget).mockReset().mockResolvedValue(true);
    vi.mocked(countLater).mockReset();
    vi.mocked(tripFromWords).mockReset();
  });

  it("is off without the AI key, and makes no call", async () => {
    vi.mocked(getTripIntentProvider).mockReturnValue(null);
    expect((await post({ text: "Pune to Kolad" })).status).toBe(404);
    expect(tripFromWords).not.toHaveBeenCalled();
  });

  it("returns the trip as a planner query and counts the tokens", async () => {
    vi.mocked(tripFromWords).mockResolvedValue({
      ok: true,
      trip: trip as never,
      summary: "Pune → Kolad",
      picked: null,
      days: null,
      usage: { tokensIn: 700, tokensOut: 60 },
    });
    const res = await post({ text: "Pune to Kolad by bike", near: [73.8, 18.5] });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { query: string; summary: string };
    expect(decodeURIComponent(data.query)).toContain("from=Pune@73.85,18.52&to=Kolad@73.22,18.39");
    expect(data.summary).toBe("Pune → Kolad");
    expect(countLater).toHaveBeenCalledWith("ai_tokens_in", 700);
    expect(allowRequest).toHaveBeenCalledWith(expect.any(Request), {
      scope: "ai",
      limit: 6,
      windowS: 3600,
    });
  });

  it("refuses too many requests from one visitor, and once the day's budget is spent", async () => {
    vi.mocked(allowRequest).mockResolvedValue(false);
    expect((await post({ text: "Pune to Kolad" })).status).toBe(429);
    vi.mocked(allowRequest).mockResolvedValue(true);
    vi.mocked(takeDailyBudget).mockResolvedValue(false);
    expect((await post({ text: "Pune to Kolad" })).status).toBe(503);
    expect(tripFromWords).not.toHaveBeenCalled();
  });

  it("rejects empty or very long text before any call", async () => {
    expect((await post({ text: "a" })).status).toBe(400);
    expect((await post({ text: "x".repeat(301) })).status).toBe(400);
    expect(allowRequest).not.toHaveBeenCalled();
  });

  it("explains a sentence it could not turn into a trip", async () => {
    vi.mocked(tripFromWords).mockResolvedValue({
      ok: false,
      reason: "no-start",
      message: "Where do you start?",
    });
    const res = await post({ text: "waterfalls please" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "Where do you start?" });
  });
});
