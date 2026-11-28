import { describe, expect, it, vi } from "vitest";
import { createAnthropicAskProvider, NOT_IN_DATA } from "@/server/providers/llm/askRoute";
import { checkAnswer, routeContext, type RouteFacts } from "@/server/services/askRouteService";

const facts: RouteFacts = {
  distanceM: 330_000,
  durationS: 6 * 3600,
  places: [
    {
      id: "p-fort",
      slug: "manjarabad-fort",
      name: "Manjarabad Fort",
      category: "fort",
      location: [75.7581, 12.9173],
      kmFromStart: 221.4,
      detourM: 300,
      ratingAvg: null,
      ratingCount: 0,
      bestMonths: [],
      thumbUrl: null,
      trendingScore: 0,
      notable: true,
    },
  ],
  rules: [
    {
      slug: "bandipur-night",
      kind: "night_ban" as never,
      title: "Bandipur night ban",
      kmFrom: 100,
      kmTo: 120,
      closedFrom: "21:00",
      closedTo: "06:00",
      vehicles: [],
      months: [],
      link: "https://example.org/rule",
      source: null,
      checkedOn: "2026-10-01",
      note: null,
    },
  ],
  services: [],
};

describe("Ask this route (G12)", () => {
  it("gives the model the route's own places and rules with their ids", () => {
    const ctx = routeContext(facts);
    expect(ctx).toContain("p-fort | Manjarabad Fort | fort | km 221 | 0.3");
    expect(ctx).toContain(
      "bandipur-night | Bandipur night ban | km 100-km 120 | closed 21:00-06:00",
    );
  });

  it("keeps only places and rules that are in the data", () => {
    const checked = checkAnswer(
      {
        answer: "Stop at Manjarabad Fort, km 221.",
        placeIds: ["p-fort", "invented-place", "p-fort"],
        ruleSlugs: ["bandipur-night", "made-up-rule"],
      },
      facts,
    );
    expect(checked.places).toEqual([
      { slug: "manjarabad-fort", name: "Manjarabad Fort", kmFromStart: 221 },
    ]);
    expect(checked.rules.map((r) => r.slug)).toEqual(["bandipur-night"]);
    expect(checkAnswer({ answer: " ", placeIds: [], ruleSlugs: [] }, facts).answer).toBe(
      NOT_IN_DATA,
    );
  });

  it("asks Claude with the route as data and the question apart, and handles a refusal", async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { answer: "Yes.", placeIds: [], ruleSlugs: [] },
    });
    const provider = createAnthropicAskProvider("k", "m", { messages: { parse } } as never);
    expect(await provider.answer("CTX", "Any forts?")).toEqual({
      answer: "Yes.",
      placeIds: [],
      ruleSlugs: [],
    });
    const call = parse.mock.calls[0]![0];
    expect(call.messages[0].content).toBe(
      "<route>\nCTX\n</route>\n<question>Any forts?</question>",
    );
    expect(call).not.toHaveProperty("temperature");
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    expect(await provider.answer("CTX", "x")).toBeNull();
  });
});
