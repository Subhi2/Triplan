import { describe, expect, it } from "vitest";
import { parseBoxItems } from "@/server/providers/wikimedia/commons";
import {
  matchItems,
  nameSimilarity,
  tileBox,
  tileKey,
  type PlaceToLink,
} from "@/server/services/wikidataLinkService";

const place = (id: string, name: string, location: [number, number], category = "fort") =>
  ({ id, name, category, location }) as PlaceToLink;
const item = (id: string, label: string, location: [number, number]) => ({ id, label, location });

describe("nameSimilarity", () => {
  it("scores near-identical names high and different ones low", () => {
    expect(nameSimilarity("Manjarabad Fort", "Manjarabad fort")).toBe(1);
    expect(nameSimilarity("Gira Waterfalls", "Gira Waterfall")).toBeGreaterThan(0.6);
    expect(nameSimilarity("Jog Falls", "Jog")).toBeLessThan(0.6);
    expect(nameSimilarity("Belur", "Chennakeshava Temple, Belur")).toBeLessThan(0.6);
  });
});

describe("matchItems", () => {
  const fort = place("p1", "Manjarabad Fort", [75.7581, 12.9173]);

  it("links a place to the item with a similar name close by", () => {
    const m = matchItems([fort], [item("Q1", "Manjarabad Fort", [75.759, 12.918])]);
    expect(m.get("p1")).toBe("Q1");
  });

  it("does not link far items, other names, or items already on another place", () => {
    expect(matchItems([fort], [item("Q1", "Manjarabad Fort", [75.9, 12.9])]).size).toBe(0);
    expect(matchItems([fort], [item("Q2", "Sakleshpur", [75.758, 12.917])]).size).toBe(0);
    expect(
      matchItems([fort], [item("Q1", "Manjarabad Fort", [75.759, 12.918])], new Set(["Q1"])).size,
    ).toBe(0);
  });

  it("leaves a place unlinked when two items match about as well", () => {
    const m = matchItems(
      [fort],
      [
        item("Q1", "Manjarabad Fort", [75.758, 12.917]),
        item("Q2", "Manjarabad Fort", [75.759, 12.918]),
      ],
    );
    expect(m.size).toBe(0);
  });

  it("gives an item to one place only, the closest", () => {
    const m = matchItems(
      [fort, place("p2", "Manjarabad Fort", [75.765, 12.92])],
      [item("Q1", "Manjarabad Fort", [75.7582, 12.9174])],
    );
    expect([...m]).toEqual([["p1", "Q1"]]);
  });

  it("never gives a lake or beach the village it is named after", () => {
    const lake = place("p4", "Kadinamkulam Lake", [76.81, 8.6], "lake");
    expect(matchItems([lake], [item("Q5", "Kadinamkulam", [76.812, 8.601])]).size).toBe(0);
    expect(matchItems([lake], [item("Q6", "Kadinamkulam lake", [76.812, 8.601])]).get("p4")).toBe(
      "Q6",
    );
  });

  it("allows big places a wider distance", () => {
    const park = place("p3", "Bandipur National Park", [76.6, 11.7], "wildlife");
    expect(
      matchItems([park], [item("Q4", "Bandipur National Park", [76.55, 11.66])]).get("p3"),
    ).toBe("Q4");
  });
});

describe("tiles", () => {
  it("snaps points to half-degree tiles", () => {
    expect(tileKey([75.7581, 12.9173])).toBe("75.5,12.5");
    expect(tileBox("75.5,12.5")).toEqual([75.5, 12.5, 76, 13]);
  });
});

describe("parseBoxItems", () => {
  it("keeps one item per id with its coordinates", () => {
    const items = parseBoxItems({
      results: {
        bindings: [
          {
            item: { value: "http://www.wikidata.org/entity/Q1" },
            label: { value: "Manjarabad Fort" },
            loc: { value: "Point(75.759 12.918)" },
          },
          {
            item: { value: "http://www.wikidata.org/entity/Q1" },
            label: { value: "Manjarabad Fort" },
            loc: { value: "Point(75.8 12.9)" },
          },
        ],
      },
    });
    expect(items).toEqual([{ id: "Q1", label: "Manjarabad Fort", location: [75.759, 12.918] }]);
  });
});
