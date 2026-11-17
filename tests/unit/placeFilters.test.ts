import { describe, expect, it } from "vitest";
import { splitCategories } from "@/components/place/PlaceFilters";

describe("splitCategories", () => {
  // Bengaluru → Kalasa's mix: hundreds of temples, a few sights.
  const counts: [string, number][] = [
    ["attraction", 35],
    ["coffee", 39],
    ["fort", 3],
    ["heritage", 21],
    ["lake", 35],
    ["temple", 491],
    ["viewpoint", 5],
    ["waterfall", 1],
    ["wildlife", 3],
  ];

  it("leads with the 4 most worthwhile categories, not the most numerous", () => {
    const { leading, rest } = splitCategories(counts, []);
    expect(leading.map(([c]) => c)).toEqual(["heritage", "viewpoint", "wildlife", "waterfall"]);
    expect(rest.map(([c]) => c)).toEqual(["attraction", "coffee", "fort", "lake", "temple"]);
  });

  it("keeps a picked category in view", () => {
    const { leading, rest } = splitCategories(counts, ["temple"]);
    expect(leading.map(([c]) => c)).toContain("temple");
    expect(rest.map(([c]) => c)).not.toContain("temple");
  });

  it("shows every category when there are few", () => {
    const few: [string, number][] = [
      ["temple", 3],
      ["lake", 1],
    ];
    expect(splitCategories(few, []).rest).toEqual([]);
  });
});
