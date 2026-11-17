import { describe, expect, it } from "vitest";
import { shortPlace, viaLine } from "@/components/trip/PlannerHeader";
import { shortCredit } from "@/lib/media";

describe("planner header text", () => {
  it("names the via towns instead of counting stops", () => {
    expect(viaLine(["Sakleshpur, Hassan"])).toBe("via Sakleshpur");
    expect(viaLine(["Hassan", "Sakleshpur"])).toBe("via Hassan, Sakleshpur");
    expect(viaLine(["A", "B", "C"])).toBe("via 3 towns");
    expect(viaLine([])).toBe("");
  });

  it("drops the district and state from a place", () => {
    expect(shortPlace("Kalasa, Chikkamagaluru, Karnataka")).toBe("Kalasa");
    expect(shortPlace("Kalasa")).toBe("Kalasa");
  });
});

describe("shortCredit", () => {
  it("names the author and licence", () => {
    expect(
      shortCredit({ author: "Aravind K G", license: "CC BY-SA 3.0", source: "wikimedia" }),
    ).toBe("photo Aravind K G · CC BY-SA 3.0");
    expect(shortCredit({ author: null, license: "CC0", source: "wikimedia" })).toBe(
      "photo unknown · CC0",
    );
  });
});
