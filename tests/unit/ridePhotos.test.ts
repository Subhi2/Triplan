import { describe, expect, it } from "vitest";
import {
  captionOf,
  eligible,
  GALLERY_MAX,
  licenceAllowed,
  pickGallery,
  type PhotoCandidate,
} from "@/lib/ridePhotos";

const cand = (
  title: string,
  kmAlong: number,
  o: { w?: number; h?: number; license?: string; distM?: number } = {},
): PhotoCandidate => ({
  kmAlong,
  distM: o.distM ?? 500,
  image: {
    file: `File:${title}.jpg`,
    url: `https://example.org/${title}.jpg`,
    thumbUrl: `https://example.org/t/${title}.jpg`,
    pageUrl: `https://commons.example.org/${title}`,
    author: "A. Rider",
    license: o.license ?? "CC BY-SA 4.0",
    width: o.w ?? 960,
    height: o.h ?? 640,
  },
});

describe("licenceAllowed", () => {
  it("takes licences that allow showing with credit and leaves out NC and ND", () => {
    for (const l of ["CC BY-SA 4.0", "CC BY 3.0", "CC0", "Public domain", "PD-old"]) {
      expect(licenceAllowed(l)).toBe(true);
    }
    for (const l of ["CC BY-NC 4.0", "CC BY-ND 2.0", "All rights reserved", ""]) {
      expect(licenceAllowed(l)).toBe(false);
    }
  });
});

describe("eligible", () => {
  it("wants wide landscape photos named for a view", () => {
    expect(eligible(cand("Baralacha Pass in summer", 10))).toBe(true);
    expect(eligible(cand("Baralacha Pass in summer", 10, { w: 640, h: 960 }))).toBe(false);
    expect(eligible(cand("Baralacha Pass in summer", 10, { w: 600, h: 400 }))).toBe(false);
    expect(eligible(cand("Baralacha Pass", 10, { license: "CC BY-NC 2.0" }))).toBe(false);
  });

  it("leaves out maps, signs, ceremonies, people and bare camera numbers", () => {
    for (const t of [
      "Route map of the ride",
      "Death ceremony at the village",
      "Local tea seller",
      "Welcome signboard at the pass",
      "ISS061-E-112244 - View of Earth",
      "DSC 1234",
    ]) {
      expect(eligible(cand(t, 10))).toBe(false);
    }
  });
});

describe("pickGallery", () => {
  it("spreads photos along the road, in order, at most eight", () => {
    const names = "abcdefghijklmnopqrstuvwxyz";
    const all = Array.from({ length: 40 }, (_, i) =>
      cand(
        `Waterfall view ${names[i % 26]}${names[(i * 7) % 26]}${names[(i * 3) % 26]}${i}`,
        i * 10,
      ),
    );
    const picks = pickGallery(all, 400);
    expect(picks.length).toBe(GALLERY_MAX);
    const km = picks.map((p) => p.kmAlong);
    expect([...km].sort((a, b) => a - b)).toEqual(km);
    expect(km[0]!).toBeLessThan(60);
    expect(km.at(-1)!).toBeGreaterThan(340);
  });

  it("uses photos not named for a view only to reach four", () => {
    const scenic = [cand("Mountain pass view", 5), cand("Valley and river", 100)];
    const plain = [cand("Roadside afternoon one", 50), cand("Roadside afternoon two", 150)];
    // "Roadside afternoon" has no scenic word, so only two fill the gap up to four.
    const picks = pickGallery([...scenic, ...plain, cand("Roadside evening three", 200)], 300);
    expect(picks.length).toBe(4);
    expect(pickGallery(scenic, 300).length).toBe(2);
  });

  it("never takes two photos of one title, and prefers the one near the road", () => {
    const picks = pickGallery(
      [
        cand("Rohtang pass view 1", 10, { distM: 4000 }),
        cand("Rohtang pass view 2", 12, { distM: 100 }),
      ],
      100,
    );
    expect(picks.length).toBe(1);
    expect(picks[0]!.distM).toBe(100);
  });
});

describe("captionOf", () => {
  it("turns a file title into words", () => {
    expect(captionOf("File:Jog_Falls_at_Shimoga_(2).jpg")).toBe("Jog Falls at Shimoga");
  });
});
