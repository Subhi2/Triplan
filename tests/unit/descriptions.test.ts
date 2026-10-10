import { describe, expect, it } from "vitest";
import type { WikidataItem } from "@/server/providers/wikimedia";
import { cleanIntro, parseExtracts } from "@/server/providers/wikimedia/wikipedia";
import {
  articleTitle,
  pickDescription,
  type PlaceForText,
} from "@/server/services/descriptionImportService";

const JOG: PlaceForText = {
  id: "p1",
  wikidataId: "Q672241",
  wikipediaTag: null,
  location: [74.8124, 14.2293],
  category: "waterfall",
};
const item = (extra: Partial<WikidataItem> = {}): WikidataItem => ({
  file: null,
  human: false,
  location: [74.812, 14.229],
  enwiki: "Jog Falls",
  description: null,
  ...extra,
});
const INTRO = {
  text: "Jog Falls is a waterfall on the Sharavati river in Karnataka, India. It is the second-highest plunge waterfall in India.",
  url: "https://en.wikipedia.org/wiki/Jog_Falls",
};

describe("cleanIntro", () => {
  it("drops names in other scripts and pronunciations in brackets", () => {
    expect(
      cleanIntro("Jog Falls (Kannada: ಜೋಗ ಜಲಪಾತ) is a waterfall (pronounced jōga) in Karnataka."),
    ).toBe("Jog Falls is a waterfall in Karnataka.");
  });

  it("cuts long intros at a sentence", () => {
    const long = `${"A sentence about the fort and its walls. ".repeat(20)}`;
    const out = cleanIntro(long);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith(".")).toBe(true);
  });
});

describe("parseExtracts", () => {
  it("follows normalised titles and redirects back to the titles asked for", () => {
    const intros = parseExtracts(
      {
        query: {
          normalized: [{ from: "jog Falls", to: "Jog Falls" }],
          redirects: [{ from: "Jog Falls", to: "Jog Falls (waterfall)" }],
          pages: [
            { title: "Jog Falls (waterfall)", extract: INTRO.text },
            { title: "No such page", missing: true },
          ],
        },
      },
      ["jog Falls", "No such page"],
    );
    expect(intros.get("jog Falls")).toEqual({
      text: INTRO.text,
      url: "https://en.wikipedia.org/wiki/Jog_Falls_(waterfall)",
    });
    expect(intros.has("No such page")).toBe(false);
  });
});

describe("pickDescription", () => {
  it("takes the Wikipedia intro, credited, over Wikidata's short description", () => {
    expect(pickDescription(JOG, item({ description: "waterfall in Karnataka" }), INTRO)).toEqual({
      text: INTRO.text,
      source: "wikipedia",
      license: "CC BY-SA 4.0",
      url: INTRO.url,
    });
  });

  it("falls back to a Wikidata description that says more than the category", () => {
    const rich = item({
      description: "plunge waterfall on the Sharavati river in the Western Ghats",
    });
    expect(pickDescription(JOG, rich, undefined)).toEqual({
      text: "Plunge waterfall on the Sharavati river in the Western Ghats.",
      source: "wikidata",
      license: "CC0",
      url: "https://www.wikidata.org/wiki/Q672241",
    });
    expect(pickDescription(JOG, item({ description: "waterfall in India" }), undefined)).toBeNull();
  });

  it("takes no text from a person or a far-away item", () => {
    expect(pickDescription(JOG, item({ human: true }), INTRO)).toBeNull();
    expect(pickDescription(JOG, item({ location: [103.85, 1.28] }), INTRO)).toBeNull();
  });
});

describe("articleTitle", () => {
  it("prefers the OSM wikipedia tag, else the item's English article", () => {
    expect(articleTitle({ ...JOG, wikipediaTag: "en:Jog Falls" }, undefined)).toBe("Jog Falls");
    expect(articleTitle({ ...JOG, wikipediaTag: "kn:ಜೋಗ ಜಲಪಾತ" }, item())).toBe("Jog Falls");
    expect(articleTitle({ ...JOG, wikipediaTag: null }, undefined)).toBeNull();
  });
});
