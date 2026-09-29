import { describe, expect, it } from "vitest";
import {
  cleanUrl,
  htmlToText,
  imageInfoSchema,
  parseImageFiles,
  parseImageInfo,
  sparqlSchema,
} from "@/server/providers/wikimedia/commons";
import { jsonFixture } from "../helpers/fixtures";

// Fixtures recorded 2026-09-29 from query.wikidata.org and the Commons API.

describe("parseImageFiles", () => {
  it("maps each Wikidata id to its main image's file title", () => {
    const files = parseImageFiles(sparqlSchema.parse(jsonFixture("wikimedia/sparql-p18.json")));
    expect(files.get("Q672241")).toBe("File:Jog Falls at Shimoga.jpg");
    expect(files.get("Q4855049")).toBe("File:Old Bangalore Fort, Inside View.JPG");
    expect(files.has("Q85744926")).toBe(false); // Bahmani Tombs: no image on Wikidata
  });

  it("keeps the first image when an item has several", () => {
    const binding = (file: string) => ({
      item: { value: "http://www.wikidata.org/entity/Q1" },
      image: { value: `http://commons.wikimedia.org/wiki/Special:FilePath/${file}` },
    });
    const files = parseImageFiles({ results: { bindings: [binding("A.jpg"), binding("B.jpg")] } });
    expect(files.get("Q1")).toBe("File:A.jpg");
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
