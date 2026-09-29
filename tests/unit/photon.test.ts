import { describe, expect, it } from "vitest";
import {
  buildPhotonSearchUrl,
  parsePhotonResponse,
  photonResponseSchema,
} from "@/server/providers/geocoding/photon";
import { jsonFixture } from "../helpers/fixtures";

const hits = (query: string) =>
  parsePhotonResponse(photonResponseSchema.parse(jsonFixture(`photon/${query}.json`)));

describe("Photon", () => {
  it("restricts to India, drops waterways, asks for English and biases to the map", () => {
    const url = new URL(
      buildPhotonSearchUrl("https://photon.test/api/", "samse", {
        limit: 8,
        near: [76.75, 15.05],
        zoom: 5.4,
      }),
    );
    expect(url.origin + url.pathname).toBe("https://photon.test/api");
    expect(url.searchParams.get("q")).toBe("samse");
    expect(url.searchParams.get("limit")).toBe("8");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.get("bbox")).toBe("68.1,6.5,97.5,35.7");
    expect(url.searchParams.getAll("osm_tag")).toEqual(["!waterway"]);
    expect(url.searchParams.get("lat")).toBe("15.05");
    expect(url.searchParams.get("lon")).toBe("76.75");
    expect(url.searchParams.get("zoom")).toBe("5");
  });

  it("finds a village by name: samse", () => {
    expect(hits("samse")[0]).toMatchObject({
      id: "node/903206643",
      name: "Samse",
      label: "Samse, Kalasa taluk, Karnataka",
      kind: "place/village",
    });
    expect(hits("samse").some((h) => h.kind.startsWith("waterway/"))).toBe(false);
  });

  it("puts the town first: kalasa", () => {
    expect(hits("kalasa")[0]).toMatchObject({
      id: "node/245619208",
      name: "Kalasa",
      kind: "place/town",
    });
  });

  it("knows the common name: ooty finds Udhagamandalam", () => {
    const [first, ...rest] = hits("ooty");
    expect(first).toMatchObject({ name: "Udhagamandalam", kind: "place/town" });
    expect(first!.location[1]).toBeCloseTo(11.41, 1);
    expect(rest.map((h) => h.name)).toContain("Ooty Lake");
  });

  it("tolerates a misspelling: sakleshpura finds Sakleshpur", () => {
    expect(hits("sakleshpura")[0]).toMatchObject({ name: "Sakleshpur", kind: "place/town" });
  });

  it("drops results outside India and without a name", () => {
    const body = photonResponseSchema.parse({
      features: [
        {
          geometry: { type: "Point", coordinates: [80, 7] },
          properties: { name: "Kandy", countrycode: "LK" },
        },
        { geometry: { type: "Point", coordinates: [76, 12] }, properties: { countrycode: "IN" } },
        {
          geometry: { type: "Point", coordinates: [76, 12] },
          properties: { name: "Somewhere", countrycode: "IN", state: "Karnataka" },
        },
      ],
    });
    expect(parsePhotonResponse(body)).toEqual([
      {
        id: "photon/76,12",
        name: "Somewhere",
        label: "Somewhere, Karnataka",
        location: [76, 12],
        kind: "unknown/unknown",
      },
    ]);
  });
});
