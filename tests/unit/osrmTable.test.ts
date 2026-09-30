import { afterEach, describe, expect, it, vi } from "vitest";
import type { LngLat } from "@/lib/geo";
import { ProviderError } from "@/server/providers/http";
import { MAX_TABLE_DESTINATIONS } from "@/server/providers/routing";
import {
  buildOsrmTableUrl,
  createOsrmTableProvider,
  parseOsrmTableResponse,
} from "@/server/providers/routing/osrm";
import { jsonFixture } from "../helpers/fixtures";

// Recorded by scripts/record-route-fixtures.ts: Sakleshpur to Manjarabad Fort, Bisle viewpoint,
// Hassan, Belur and Kalasa.
const raw = () => jsonFixture("osrm/table-sakleshpur.json");
const SAKLESHPUR: LngLat = [75.785, 12.943];

afterEach(() => vi.unstubAllGlobals());

describe("buildOsrmTableUrl", () => {
  it("asks for one source to every destination, with durations and distances", () => {
    const url = buildOsrmTableUrl("https://router.example/", {
      origin: [75.7850001, 12.943],
      destinations: [[75.7581, 12.9173]],
      profile: "bike",
    });
    expect(url).toBe(
      "https://router.example/table/v1/driving/75.785,12.943;75.7581,12.9173" +
        "?sources=0&annotations=duration%2Cdistance",
    );
  });
});

describe("parseOsrmTableResponse", () => {
  it("returns one cell per destination, without the origin's own column", () => {
    const cells = parseOsrmTableResponse(raw(), 5, "car");
    expect(cells).toHaveLength(5);
    // Manjarabad Fort is a few km from Sakleshpur; Kalasa is about 90 km by road.
    expect(cells[0]!.distanceM / 1000).toBeCloseTo(5.1, 0);
    expect(cells[4]!.distanceM / 1000).toBeGreaterThan(80);
    expect(cells[4]!.durationS).toBeGreaterThan(cells[0]!.durationS);
  });

  it("scales times by 1.1 for bikes and keeps distances", () => {
    const car = parseOsrmTableResponse(raw(), 5, "car");
    const bike = parseOsrmTableResponse(raw(), 5, "bike");
    expect(bike[2]!.durationS).toBeCloseTo(car[2]!.durationS * 1.1);
    expect(bike[2]!.distanceM).toBe(car[2]!.distanceM);
  });

  it("marks destinations with no road as null", () => {
    const body = { code: "Ok", durations: [[0, 60, null]], distances: [[0, 900, null]] };
    expect(parseOsrmTableResponse(body, 2, "car")).toEqual([
      { distanceM: 900, durationS: 60 },
      null,
    ]);
  });

  it.each([
    ["an error code", { code: "TooBig", message: "Too many table coordinates" }],
    ["a malformed body", { code: "Ok", durations: "x" }],
    ["a row of the wrong size", { code: "Ok", durations: [[0, 1]], distances: [[0, 1]] }],
    ["missing distances", { code: "Ok", durations: [[0, 1, 2]] }],
  ])("throws ProviderError on %s", (_, body) => {
    expect(() => parseOsrmTableResponse(body, 2, "car")).toThrow(ProviderError);
  });
});

describe("createOsrmTableProvider", () => {
  it("refuses more destinations than the public server allows, without calling it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createOsrmTableProvider("https://router.example");
    const destinations = Array.from({ length: MAX_TABLE_DESTINATIONS + 1 }, (_, i): LngLat => [
      75 + i / 1000,
      13,
    ]);
    await expect(
      provider.table({ origin: SAKLESHPUR, destinations, profile: "car" }),
    ).rejects.toThrow(ProviderError);
    expect(await provider.table({ origin: SAKLESHPUR, destinations: [], profile: "car" })).toEqual(
      [],
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the table service once and parses the answer", async () => {
    const fetchMock = vi.fn(async () => Response.json(raw()));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createOsrmTableProvider("https://router.example");
    const cells = await provider.table({
      origin: SAKLESHPUR,
      destinations: [
        [75.7581, 12.9173],
        [75.6943, 12.7107],
        [76.0996, 13.0068],
        [75.865, 13.165],
        [75.356, 13.234],
      ],
      profile: "car",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("/table/v1/driving/");
    expect(cells).toHaveLength(5);
  });
});
