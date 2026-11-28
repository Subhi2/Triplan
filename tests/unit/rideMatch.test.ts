import { describe, expect, it } from "vitest";
import { simplifyLine } from "@/lib/geo";
import { MATCH_COVERAGE, matchFamousRide } from "@/lib/rideMatch";
import type { LngLat } from "@/lib/geo";
import { routeFixture } from "../helpers/fixtures";

// The Bengaluru → Kalasa fixture's two routes: via Chikkamagaluru and via Hassan, Sakleshpur.
const [first, second] = routeFixture("bengaluru-kalasa", "bike").map(
  (r) => r.geometry.coordinates as LngLat[],
);
const line = first!;
// A famous ride's line as the planner gets it: simplified by about 1.1 km.
const ride = (slug: string, coords: LngLat[]) => ({ slug, line: simplifyLine(coords, 1_100) });
const elsewhere = ride("elsewhere", [
  [76.9, 10.4],
  [77.0, 10.3],
  [77.1, 10.2],
]);

describe("matchFamousRide", () => {
  it("finds the ride a track follows, whichever way it was ridden", () => {
    const rides = [elsewhere, ride("bengaluru-kalasa", line)];
    expect(matchFamousRide(line, rides)?.slug).toBe("bengaluru-kalasa");
    expect(matchFamousRide([...line].reverse(), rides)?.slug).toBe("bengaluru-kalasa");
  });

  it("counts a longer ride that takes the famous one in", () => {
    const longer: LngLat[] = [[77.75, 13.05], [77.65, 13.0], ...line];
    expect(matchFamousRide(longer, [ride("bengaluru-kalasa", line)])?.slug).toBe(
      "bengaluru-kalasa",
    );
  });

  it("does not count a ride only partly covered", () => {
    // The first third of the road only.
    const part = line.slice(0, Math.floor(line.length / 3));
    expect(matchFamousRide(part, [ride("bengaluru-kalasa", line)])).toBeNull();
  });

  it("picks the route the track took, not the other road between the same towns", () => {
    const match = matchFamousRide(line, [ride("via-a", line), ride("via-b", second!)]);
    expect(match?.slug).toBe("via-a");
    expect(match!.coverage).toBeGreaterThanOrEqual(MATCH_COVERAGE);
  });

  it("finds nothing for a track far from every ride, or too short", () => {
    expect(matchFamousRide(line, [elsewhere])).toBeNull();
    expect(matchFamousRide([line[0]!], [ride("bengaluru-kalasa", line)])).toBeNull();
  });
});
