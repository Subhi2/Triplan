import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LngLat } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/trip";
import { ProviderError } from "@/server/providers/http";
import { createAnthropicTripProvider, TRIP_SYSTEM_PROMPT } from "@/server/providers/llm/anthropic";
import { cleanIntent, type TripIntent, type TripIntentProvider } from "@/server/providers/llm";
import type { PlaceNearRow } from "@/server/services/nearbyService";
import {
  oneWayKm,
  pickDestination,
  tripFromWords,
  type WordsDeps,
} from "@/server/services/tripFromWordsService";

const intent = (over: Partial<TripIntent> = {}): TripIntent => ({
  from: "Pune",
  to: null,
  via: [],
  vehicle: "bike",
  categories: ["waterfall"],
  days: null,
  maxOneWayKm: 120,
  month: 7,
  ...over,
});

describe("Anthropic trip provider", () => {
  function client(response: unknown) {
    const parse = vi.fn(async () => response);
    return { client: { messages: { parse } } as unknown as Anthropic, parse };
  }

  it("asks for the trip schema and cleans the answer", async () => {
    const { client: c, parse } = client({
      stop_reason: "end_turn",
      parsed_output: intent({ via: ["  Mulshi ", ""], days: 40, month: 13, maxOneWayKm: 99999 }),
      usage: { input_tokens: 700, output_tokens: 60 },
    });
    const provider = createAnthropicTripProvider("key", "claude-haiku-4-5", c);
    const result = await provider.parseTrip("monsoon waterfalls from Pune");
    expect(result!.intent).toMatchObject({
      via: ["Mulshi"],
      days: 14,
      month: 12,
      maxOneWayKm: 3000,
    });
    expect(result!.tokensIn).toBe(700);
    const request = (parse.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(request.model).toBe("claude-haiku-4-5");
    expect(request.system).toBe(TRIP_SYSTEM_PROMPT);
    expect(JSON.stringify(request.messages)).toContain(
      "<request>monsoon waterfalls from Pune</request>",
    );
    expect(request.output_config).toBeDefined();
  });

  it("gives null when the model refuses or returns nothing usable", async () => {
    const refused = createAnthropicTripProvider(
      "key",
      undefined,
      client({ stop_reason: "refusal", parsed_output: null, usage: {} }).client,
    );
    expect(await refused.parseTrip("x")).toBeNull();
  });

  it("turns API failures into provider errors", async () => {
    const parse = vi.fn(async () => {
      throw new Anthropic.RateLimitError(429, undefined, "slow down", new Headers());
    });
    const provider = createAnthropicTripProvider("key", undefined, {
      messages: { parse },
    } as unknown as Anthropic);
    await expect(provider.parseTrip("x")).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("cleanIntent", () => {
  it("drops empty names and keeps at most three vias", () => {
    const c = cleanIntent(intent({ from: "  ", via: ["a", "b", "c", "d"] }));
    expect(c.from).toBeNull();
    expect(c.via).toEqual(["a", "b", "c"]);
  });
});

const place = (name: string, km: number, over: Partial<PlaceNearRow> = {}): PlaceNearRow => ({
  id: name,
  slug: name.toLowerCase(),
  name,
  category: "waterfall",
  location: [73.5, 18.4],
  distanceM: km * 1000,
  ratingAvg: null,
  ratingCount: 0,
  bestMonths: [],
  thumbUrl: null,
  trendingScore: 0,
  notable: false,
  priority: 1,
  ...over,
});

describe("pickDestination", () => {
  it("prefers a worthwhile place far enough to be a ride, within range and in season", () => {
    const places = [
      place("Too near", 5, { priority: 3 }),
      place("Out of season", 60, { priority: 3, bestMonths: [11, 12] }),
      place("Too far", 200, { priority: 3 }),
      place("Good", 60, { priority: 2, bestMonths: [7, 8] }),
      place("Fine", 55, { priority: 1 }),
    ];
    expect(pickDestination(places, 120, 7)?.name).toBe("Good");
  });

  it("settles for a nearer place when nothing is far enough", () => {
    expect(pickDestination([place("Near", 10)], 120, null)?.name).toBe("Near");
    expect(pickDestination([], 120, null)).toBeNull();
  });

  it("goes further for longer trips", () => {
    expect(oneWayKm({ maxOneWayKm: null, days: null })).toBe(150);
    expect(oneWayKm({ maxOneWayKm: null, days: 3 })).toBe(350);
    expect(oneWayKm({ maxOneWayKm: 90, days: 3 })).toBe(90);
  });
});

describe("tripFromWords", () => {
  const PUNE: GeocodeResult = {
    id: "p",
    name: "Pune",
    label: "Pune",
    location: [73.85, 18.52],
    source: "local",
  };
  const KOLAD: GeocodeResult = {
    id: "k",
    name: "Kolad",
    label: "Kolad",
    location: [73.22, 18.39],
    source: "local",
  };
  let deps: WordsDeps;
  const provider = (i: TripIntent | null): TripIntentProvider => ({
    parseTrip: async () => (i ? { intent: i, tokensIn: 1, tokensOut: 1 } : null),
  });

  beforeEach(() => {
    deps = {
      provider: provider(intent()),
      resolve: vi.fn(async (name: string) => ({ Pune: PUNE, Kolad: KOLAD })[name] ?? null),
      placesNear: vi.fn(async () => [
        place("Devkund Waterfall", 70, { location: [73.38, 18.38] as LngLat, bestMonths: [7] }),
      ]),
    };
  });

  it("names the trip from the sentence and picks a destination of the kind asked for", async () => {
    const out = await tripFromWords("monsoon waterfalls from Pune under 120 km", undefined, deps);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.trip.from?.label).toBe("Pune");
    expect(out.trip.to?.label).toBe("Devkund Waterfall");
    expect(out.trip.categories).toEqual(["waterfall"]);
    expect(out.picked).toBe("Devkund Waterfall (waterfall)");
    expect(out.summary).toBe("Pune → Devkund Waterfall · by bike · waterfall");
    expect(deps.placesNear).toHaveBeenCalledWith(PUNE.location, (120 * 1000) / 1.3, ["waterfall"]);
  });

  it("uses a named destination", async () => {
    deps.provider = provider(intent({ to: "Kolad" }));
    const out = await tripFromWords("Pune to Kolad", undefined, deps);
    expect(out.ok && out.trip.to?.label).toBe("Kolad");
    expect(deps.placesNear).not.toHaveBeenCalled();
  });

  it("explains what is missing", async () => {
    deps.provider = provider(null);
    expect(await tripFromWords("hmm", undefined, deps)).toMatchObject({
      ok: false,
      reason: "unreadable",
    });
    deps.provider = provider(intent({ from: null }));
    expect(await tripFromWords("waterfalls", undefined, deps)).toMatchObject({
      ok: false,
      reason: "no-start",
    });
    deps.provider = provider(intent({ from: "Atlantis" }));
    expect(await tripFromWords("from Atlantis", undefined, deps)).toMatchObject({
      ok: false,
      reason: "not-found",
      name: "Atlantis",
    });
  });
});
