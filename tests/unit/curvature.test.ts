import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";
import { routeCurvature, twistLabel } from "@/lib/curvature";
import type { LngLat } from "@/lib/geo";
import { routeFixture } from "../helpers/fixtures";

const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((12 * Math.PI) / 180);

const line = (coordinates: LngLat[]): LineString => ({ type: "LineString", coordinates });

/** Points every 10 m north from 12°N, 76°E. */
function straight(km: number, from: LngLat = [76, 12]): LngLat[] {
  return Array.from({ length: km * 100 + 1 }, (_, i) => [
    from[0],
    from[1] + (i * 10) / M_PER_DEG_LAT,
  ]);
}

/** Straight for 2 km, then a zigzag of `crossings` 200 m legs 20 m apart, then straight again. */
function zigzag(crossings: number): LngLat[] {
  const coords = straight(2);
  let [lng, lat] = coords.at(-1)!;
  for (let i = 0; i < crossings; i++) {
    lng += (i % 2 === 0 ? 200 : -200) / M_PER_DEG_LNG;
    coords.push([lng, lat]);
    lat += 20 / M_PER_DEG_LAT;
    coords.push([lng, lat]);
  }
  return [...coords, ...straight(2, [lng, lat]).slice(1)];
}

/** Straight north, a full circle of radius `r` m (a loop ramp), then straight north again. */
function loop(r: number): LngLat[] {
  const coords = straight(2);
  const [lng0, lat0] = coords.at(-1)!;
  const cx = lng0 + r / M_PER_DEG_LNG; // centre to the east: the road circles clockwise
  for (let deg = 5; deg <= 360; deg += 5) {
    const a = Math.PI - (deg * Math.PI) / 180;
    coords.push([cx + (r * Math.cos(a)) / M_PER_DEG_LNG, lat0 + (r * Math.sin(a)) / M_PER_DEG_LAT]);
  }
  return [...coords, ...straight(2, coords.at(-1)!).slice(1)];
}

describe("routeCurvature", () => {
  it("finds no bends on a straight road", () => {
    const c = routeCurvature(line(straight(20)));
    expect(c).toMatchObject({ curvatureM: 0, twistyKm: 0, hairpins: 0, label: "Straight" });
  });

  it("counts each turn back of a zigzag climb as a hairpin", () => {
    const c = routeCurvature(line(zigzag(12)));
    expect(c.hairpins).toBe(11); // 12 legs, 11 turns between them
    expect(c.hairpinKm[0]).toBeGreaterThan(2);
    expect(c.curvatureM).toBeGreaterThan(0);
  });

  it("does not count a loop ramp, which leaves in the direction it came", () => {
    expect(routeCurvature(line(loop(30))).hairpins).toBe(0);
  });

  it("does not count the router turning round at a stop", () => {
    const out = straight(5); // 5 km north to the stop
    const there = out.at(-1)!;
    const back = out.slice(-201, -1).reverse(); // 2 km back south
    const east = Array.from({ length: 301 }, (_, i): LngLat => [
      back.at(-1)![0] + (i * 10) / M_PER_DEG_LNG,
      back.at(-1)![1],
    ]);
    const geometry = line([...out, ...back, ...east.slice(1)]);
    expect(routeCurvature(geometry).hairpins).toBe(1);
    expect(routeCurvature(geometry, [there]).hairpins).toBe(0);
  });

  it("finds Valparai's 40 numbered hairpins above Aliyar", () => {
    const [route] = routeFixture("pollachi-valparai");
    const c = routeCurvature(route!.geometry);
    expect(c.hairpins).toBeGreaterThanOrEqual(36);
    expect(c.hairpins).toBeLessThanOrEqual(44);
    expect(c.hairpinKm.every((km) => km > 25)).toBe(true); // Pollachi to Aliyar is on the plains
    expect(c.label).toBe("Twisty");
  });

  it("puts the Kalasa route's hairpins in the hills past Sakleshpur, none on NH75", () => {
    const [route] = routeFixture("bengaluru-sakleshpur-kalasa");
    const c = routeCurvature(route!.geometry, [[75.785, 12.943]]);
    expect(c.hairpins).toBeGreaterThanOrEqual(15);
    expect(c.hairpins).toBeLessThanOrEqual(30);
    expect(c.hairpinKm.every((km) => km > 240)).toBe(true);
    expect(c.hairpinKm.filter((km) => km > 290).length).toBeGreaterThanOrEqual(15); // to Kalasa
  });

  it("finds the Nilgiris on the way to Ooty and nothing across the Mysuru plains", () => {
    const [route] = routeFixture("bengaluru-ooty");
    const c = routeCurvature(route!.geometry);
    expect(c.hairpinKm.every((km) => km > 200)).toBe(true);
    expect(c.hairpinKm.filter((km) => km > 245 && km < 285).length).toBeGreaterThanOrEqual(8);
  });
});

describe("twistLabel", () => {
  it("grades by the length of twisty road", () => {
    expect(twistLabel(0)).toBe("Straight");
    expect(twistLabel(5)).toBe("Some bends");
    expect(twistLabel(25)).toBe("Twisty");
    expect(twistLabel(60)).toBe("Very twisty");
  });
});
