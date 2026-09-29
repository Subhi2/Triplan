import { describe, expect, it } from "vitest";
import { carryBySeason, monthRatings, type CarryEntry } from "@/lib/placeDetail";
import { feeText, httpUrl, wikipediaUrl } from "@/server/services/placeDetailService";

const item = (slug: string, months: number[]): CarryEntry => ({
  slug,
  name: slug,
  months,
  reason: null,
});

describe("carryBySeason", () => {
  const carry = [
    item("jacket", [11, 12, 1]),
    item("raincoat", [6, 7, 8, 9]),
    item("grip_shoes", []),
  ];

  it("lists what is needed this month first, all-year items included", () => {
    expect(carryBySeason(carry, 7).map((c) => [c.slug, c.inSeason])).toEqual([
      ["raincoat", true],
      ["grip_shoes", true],
      ["jacket", false],
    ]);
  });

  it("handles seasons that wrap around the new year", () => {
    expect(carryBySeason(carry, 1).map((c) => c.slug)).toEqual([
      "jacket",
      "grip_shoes",
      "raincoat",
    ]);
  });
});

describe("monthRatings", () => {
  it("marks each month best, ok, avoid or unknown", () => {
    const ratings = monthRatings({ bestMonths: [10, 11], okMonths: [9], avoidMonths: [6, 7] });
    expect(ratings[5]).toBe("avoid"); // June
    expect(ratings[8]).toBe("ok");
    expect(ratings[9]).toBe("best");
    expect(ratings[0]).toBeNull();
  });

  it("lets avoid win when a month is listed twice", () => {
    expect(monthRatings({ bestMonths: [7], okMonths: [], avoidMonths: [7] })[6]).toBe("avoid");
  });

  it("is all unknown without a guide", () => {
    expect(monthRatings(null)).toEqual(Array(12).fill(null));
  });
});

describe("OSM tags on the place page", () => {
  it("links the wikipedia tag", () => {
    expect(wikipediaUrl("en:Mysore Palace")).toBe("https://en.wikipedia.org/wiki/Mysore_Palace");
    expect(wikipediaUrl("kn:ಮೈಸೂರು ಅರಮನೆ")).toBe(
      `https://kn.wikipedia.org/wiki/${encodeURIComponent("ಮೈಸೂರು_ಅರಮನೆ")}`,
    );
    expect(wikipediaUrl("Mysore Palace")).toBeNull();
    expect(wikipediaUrl(undefined)).toBeNull();
  });

  it("puts the fee tag in words", () => {
    expect(feeText("yes")).toBe("Entry fee charged (amount not known)");
    expect(feeText("no")).toBe("Free");
    expect(feeText("₹25; foreigners ₹300")).toBe("₹25; foreigners ₹300");
    expect(feeText(" ")).toBeNull();
  });

  it("keeps only http(s) websites", () => {
    expect(httpUrl("http://www.mysorepalace.gov.in/")).toBe("http://www.mysorepalace.gov.in/");
    expect(httpUrl("javascript:alert(1)")).toBeNull();
    expect(httpUrl("www.example.com")).toBeNull();
  });
});
