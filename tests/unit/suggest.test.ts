import { describe, expect, it, vi } from "vitest";
import type { GeocodeHit } from "@/server/providers/geocoding";
import type { LocalPlaceMatch } from "@/server/services/placeService";
import { suggestPlaces, type SuggestDeps } from "@/server/services/suggestService";

const local = (
  name: string,
  location: [number, number],
  osmId: string | null,
  fuzzy = false,
): LocalPlaceMatch => ({
  id: `place/${name.toLowerCase()}`,
  name,
  label: `${name}, Karnataka`,
  location,
  source: "local",
  osmId,
  fuzzy,
});
const hit = (name: string, location: [number, number], id: string): GeocodeHit => ({
  id,
  name,
  label: `${name}, Karnataka`,
  location,
  kind: "place/town",
});

function deps(localResults: LocalPlaceMatch[], photon: GeocodeHit[] | Error): SuggestDeps {
  return {
    local: vi.fn(async () => localResults),
    photon: {
      search: vi.fn(async () => {
        if (photon instanceof Error) throw photon;
        return photon;
      }),
    },
  };
}

describe("suggestPlaces", () => {
  it("lists our places first, then Photon's, without Photon's copies of ours", async () => {
    const d = deps(
      [
        local("Kalasa", [75.356, 13.234], "node/245619208"),
        local("Kalaseshwara Temple, Kalasa", [75.3635, 13.2323], "way/158192298"),
      ],
      [
        hit("Kalasa", [75.358, 13.232], "node/245619208"), // same OSM id as ours
        hit("Kalaseshwara Temple, Kalasa", [75.36, 13.23], "node/1"), // same name, 400 m away
        hit("Kalasa", [75.405, 15.098], "node/1269829485"), // another village called Kalasa
        hit("Kalasa taluk", [75.314, 13.224], "relation/14934566"),
      ],
    );
    const results = await suggestPlaces("kalasa", { near: [76.75, 15.05], zoom: 5 }, d);

    expect(results.map((r) => [r.name, r.source])).toEqual([
      ["Kalasa", "local"],
      ["Kalaseshwara Temple, Kalasa", "local"],
      ["Kalasa", "photon"],
      ["Kalasa taluk", "photon"],
    ]);
    expect(results[0]).not.toHaveProperty("osmId");
    expect(d.photon.search).toHaveBeenCalledWith("kalasa", {
      limit: 8,
      near: [76.75, 15.05],
      zoom: 5,
    });
  });

  it("puts Photon's exact name before a place of ours found only as a misspelling", async () => {
    const d = deps(
      [local("Samsi", [88.0, 25.3], "node/1", true)],
      [hit("Samse", [75.4, 13.2], "node/2"), hit("Samse Road", [75.5, 13.2], "way/3")],
    );
    const names = (await suggestPlaces("samse", {}, d)).map((r) => r.name);
    expect(names).toEqual(["Samse", "Samsi", "Samse Road"]);
  });

  it("returns at most 8 suggestions", async () => {
    const photon = Array.from({ length: 8 }, (_, i) =>
      hit(`Place ${i}`, [76 + i, 12], `node/${i}`),
    );
    const d = deps([local("Ours", [75, 13], null), local("Also ours", [75.1, 13], null)], photon);
    const results = await suggestPlaces("pl", {}, d);
    expect(results).toHaveLength(8);
    expect(results.slice(0, 2).every((r) => r.source === "local")).toBe(true);
  });

  it("still returns our places when Photon fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps([local("Sakleshpur", [75.785, 12.943], null)], new Error("Photon down"));
    expect((await suggestPlaces("sakleshpura", {}, d)).map((r) => r.name)).toEqual(["Sakleshpur"]);
  });
});
