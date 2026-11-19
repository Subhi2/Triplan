import { describe, expect, it } from "vitest";
import { badgesFor, type BadgeRide } from "@/lib/badges";

const ride = (slug: string, region: string, tier: BadgeRide["tier"] = "classic"): BadgeRide => ({
  slug,
  region,
  tier,
});
const rides = [
  ride("a", "Karnataka"),
  ride("b", "Kerala"),
  ride("c", "Tamil Nadu"),
  ride("d", "Ladakh", "legend"),
  ride("e", "Himachal Pradesh", "legend"),
  ride("f", "Jammu and Kashmir and Ladakh", "legend"),
  ride("g", "Sikkim", "legend"),
];
const get = (list: ReturnType<typeof badgesFor>, id: string) => list.find((b) => b.id === id);

describe("badgesFor", () => {
  it("earns nothing without done rides, and every badge shows its progress", () => {
    const list = badgesFor(rides, []);
    expect(list.every((b) => !b.earned && b.have === 0)).toBe(true);
    expect(get(list, "rides-5")?.need).toBe(5);
  });

  it("earns count, legend and area badges from done rides", () => {
    const list = badgesFor(rides, ["a", "b", "c", "d"]);
    expect(get(list, "rides-1")?.earned).toBe(true);
    expect(get(list, "rides-5")).toMatchObject({ earned: false, have: 4 });
    expect(get(list, "legend-1")?.earned).toBe(true);
    expect(get(list, "area-south")?.earned).toBe(true);
    expect(get(list, "area-north-and-himalaya")).toMatchObject({ earned: false, have: 1 });
  });

  it("earns Every Legend only when all are done, and ignores rides we no longer have", () => {
    const some = badgesFor(rides, ["d", "e", "f", "gone"]);
    expect(get(some, "legend-all")).toMatchObject({ earned: false, have: 3, need: 4 });
    expect(get(some, "rides-5")?.have).toBe(3);
    expect(get(badgesFor(rides, ["d", "e", "f", "g"]), "legend-all")?.earned).toBe(true);
  });

  it("leaves out badges the catalogue is too small for", () => {
    const list = badgesFor([ride("a", "Karnataka")], ["a"]);
    expect(get(list, "legend-1")).toBeUndefined();
    expect(list.some((b) => b.id.startsWith("area-"))).toBe(false);
  });
});
