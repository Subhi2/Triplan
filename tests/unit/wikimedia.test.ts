import { describe, expect, it } from "vitest";
import {
  cleanUrl,
  htmlToText,
  imageInfoSchema,
  parseImageInfo,
  parseItems,
  sparqlSchema,
} from "@/server/providers/wikimedia/commons";
import type { WikidataItem } from "@/server/providers/wikimedia";
import { wikidataFits } from "@/server/services/wikidataCheck";
import { jsonFixture } from "../helpers/fixtures";

// Fixtures recorded 2026-09-29 from query.wikidata.org and the Commons API.

describe("parseItems", () => {
  it("maps each Wikidata id to its main image's file title", () => {
    const items = parseItems(sparqlSchema.parse(jsonFixture("wikimedia/sparql-p18.json")));
    expect(items.get("Q672241")?.file).toBe("File:Jog Falls at Shimoga.jpg");
    expect(items.get("Q4855049")?.file).toBe("File:Old Bangalore Fort, Inside View.JPG");
    expect(items.has("Q85744926")).toBe(false); // Bahmani Tombs: no image on Wikidata
  });

  it("reads whether the item is a person, and its coordinates", () => {
    const items = parseItems({
      results: {
        bindings: [
          {
            item: { value: "http://www.wikidata.org/entity/Q1149" },
            human: { value: "true" },
            image: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Indira.jpg" },
          },
          {
            item: { value: "http://www.wikidata.org/entity/Q2" },
            human: { value: "false" },
            coord: { value: "Point(103.8483 1.2797)" },
          },
        ],
      },
    });
    expect(items.get("Q1149")).toMatchObject({
      file: "File:Indira.jpg",
      human: true,
      location: null,
    });
    expect(items.get("Q2")).toMatchObject({
      file: null,
      human: false,
      location: [103.8483, 1.2797],
    });
  });

  it("keeps the first image when an item has several", () => {
    const binding = (file: string) => ({
      item: { value: "http://www.wikidata.org/entity/Q1" },
      image: { value: `http://commons.wikimedia.org/wiki/Special:FilePath/${file}` },
    });
    const items = parseItems({ results: { bindings: [binding("A.jpg"), binding("B.jpg")] } });
    expect(items.get("Q1")?.file).toBe("File:A.jpg");
  });
});

describe("parseImageInfo", () => {
  const images = parseImageInfo(
    imageInfoSchema.parse(jsonFixture("wikimedia/commons-imageinfo.json")),
  );

  it("gives a 960 px image, a 330 px thumbnail, the file page, author and licence", () => {
    expect(images.get("File:Shakambari temple near Badami.JPG")).toEqual({
      file: "File:Shakambari temple near Badami.JPG",
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Shakambari_temple_near_Badami.JPG/960px-Shakambari_temple_near_Badami.JPG",
      thumbUrl:
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Shakambari_temple_near_Badami.JPG/330px-Shakambari_temple_near_Badami.JPG",
      pageUrl: "https://commons.wikimedia.org/wiki/File:Shakambari_temple_near_Badami.JPG",
      author: "Nvvchar",
      license: "CC BY-SA 3.0",
      width: 960,
      height: 1441,
    });
    expect(images.get("File:General view of the gateway of the fort, Belgaum.jpg")).toMatchObject({
      author: "Burgess, James",
      license: "Public domain",
    });
  });

  it("leaves out missing files", () => {
    expect(images.has("File:No such file here 123.jpg")).toBe(false);
    expect(images.size).toBe(5);
  });

  const page = (info: Record<string, unknown>) => ({
    query: {
      pages: [
        {
          title: "File:X.jpg",
          imageinfo: [
            {
              url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg",
              width: 800,
              height: 600,
              descriptionurl: "https://commons.wikimedia.org/wiki/File:X.jpg",
              mime: "image/jpeg",
              extmetadata: { LicenseShortName: { value: "CC BY 4.0" } },
              ...info,
            },
          ],
        },
      ],
    },
  });

  it("uses the original for both sizes when it is narrower than 960 px", () => {
    const small = parseImageInfo(page({})).get("File:X.jpg")!;
    expect(small.url).toBe("https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg");
    expect(small.thumbUrl).toBe(small.url);
    expect([small.width, small.height]).toEqual([800, 600]);
  });

  it("skips drawings and images without a stated licence", () => {
    expect(parseImageInfo(page({ mime: "image/svg+xml" })).size).toBe(0);
    expect(parseImageInfo(page({ extmetadata: {} })).size).toBe(0);
  });

  it("maps normalized titles back to the titles asked for", () => {
    const data = {
      ...page({}),
      query: { ...page({}).query, normalized: [{ from: "File:x.jpg", to: "File:X.jpg" }] },
    };
    expect([...parseImageInfo(data).keys()]).toEqual(["File:x.jpg"]);
  });
});

describe("htmlToText and cleanUrl", () => {
  it("keeps the author's text only", () => {
    expect(
      htmlToText(
        '<a href="//commons.wikimedia.org/wiki/User:A" title="User:A">A &amp; B</a>\n<span>(photo)</span>',
      ),
    ).toBe("A & B (photo)");
  });

  it("drops tracking parameters", () => {
    expect(
      cleanUrl(
        "https://upload.wikimedia.org/x/X.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo",
      ),
    ).toBe("https://upload.wikimedia.org/x/X.jpg");
  });
});

describe("wikidataFits", () => {
  const item = (extra: Partial<WikidataItem>): WikidataItem => ({
    file: "File:x.jpg",
    human: false,
    location: null,
    enwiki: null,
    description: null,
    ...extra,
  });
  const kushinagar = { location: [83.8875, 26.7398] as [number, number], category: "temple" };

  it("rejects a person: a memorial's wikidata tag often names who it remembers", () => {
    expect(
      wikidataFits({ location: [77.2496, 28.6545], category: "heritage" }, item({ human: true })),
    ).toBe(false);
  });

  it("rejects an item far from the place, allowing more room for big places", () => {
    expect(wikidataFits(kushinagar, item({ location: [103.8483, 1.2797] }))).toBe(false); // Singapore
    expect(wikidataFits(kushinagar, item({ location: [83.889, 26.741] }))).toBe(true);
    expect(wikidataFits(kushinagar, item({}))).toBe(true); // no coordinates: nothing to compare
    const park = { location: [76.6, 11.7] as [number, number], category: "wildlife" };
    expect(wikidataFits(park, item({ location: [76.75, 11.65] }))).toBe(true); // 17 km
  });
});
