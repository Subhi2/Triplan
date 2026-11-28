import { describe, expect, it } from "vitest";
import { rideSlugFromLink } from "@/server/services/ridePhotoAdmin";

describe("hiding a ride photo (G11)", () => {
  const site = "https://example.org";
  it("finds the ride from its link, its path or its slug", () => {
    expect(rideSlugFromLink("https://example.org/rides/pollachi-to-valparai", site)).toBe(
      "pollachi-to-valparai",
    );
    expect(rideSlugFromLink("/rides/pollachi-to-valparai/", site)).toBe("pollachi-to-valparai");
    expect(rideSlugFromLink(" pollachi-to-valparai ", site)).toBe("pollachi-to-valparai");
  });

  it("refuses anything that is not a ride's page", () => {
    expect(rideSlugFromLink("/place/manjarabad-fort", site)).toBeNull();
    expect(rideSlugFromLink("/rides/Bad Slug", site)).toBeNull();
    expect(rideSlugFromLink("https://elsewhere.example/x/rides", site)).toBeNull();
  });
});
