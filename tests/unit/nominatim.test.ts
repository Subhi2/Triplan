import { describe, expect, it } from "vitest";
import {
  buildNominatimSearchUrl,
  nominatimResponseSchema,
  parseNominatimResponse,
} from "@/server/providers/geocoding/nominatim";
import { jsonFixture } from "../helpers/fixtures";

describe("Nominatim", () => {
  it("parses a recorded search response into [lng, lat] hits", () => {
    const body = nominatimResponseSchema.parse(jsonFixture("nominatim/manjarabad-fort.json"));
    expect(parseNominatimResponse(body)).toEqual([
      {
        id: "relation/5419632",
        name: "Manjarabad Fort",
        label:
          "Manjarabad Fort, SH27, Kesaganahalli, Kyanahalli, Sakaleshapura taluk, Hassan, Karnataka, 573134, India",
        location: [75.7580573, 12.9173302],
        kind: "tourism/attraction",
      },
    ]);
  });

  it("falls back to the first part of display_name when name is empty", () => {
    const body = nominatimResponseSchema.parse([
      {
        place_id: 1,
        lat: "13.1",
        lon: "75.5",
        display_name: "Kottigehara, Mudigere taluk",
        name: "",
      },
    ]);
    expect(parseNominatimResponse(body)[0]).toMatchObject({ id: "place/1", name: "Kottigehara" });
  });

  it("rejects responses that are not a result array", () => {
    expect(nominatimResponseSchema.safeParse({ error: "Unable to geocode" }).success).toBe(false);
  });

  it("biases to India and bounds results when a viewbox is given", () => {
    const url = new URL(
      buildNominatimSearchUrl("https://nominatim.test/", "Belur temple", {
        limit: 3,
        viewbox: [75.8, 13.1, 75.9, 13.2],
      }),
    );
    expect(url.pathname).toBe("/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "Belur temple",
      format: "jsonv2",
      countrycodes: "in",
      limit: "3",
      "accept-language": "en",
      viewbox: "75.8,13.1,75.9,13.2",
      bounded: "1",
    });
  });
});
