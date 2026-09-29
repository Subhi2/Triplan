import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";
import type { RouteResult } from "@/server/providers/routing";
import { ghatSections, roadClass, roadMix } from "@/server/services/roadMix";
import { routeFixture } from "../helpers/fixtures";

const M_PER_DEG_LAT = 111_195;

/** A straight road north from 12°N, 76°E. */
function straight(km: number): LineString {
  const coordinates = Array.from({ length: km * 10 + 1 }, (_, i) => [
    76,
    12 + (i * 100) / M_PER_DEG_LAT,
  ]);
  return { type: "LineString", coordinates };
}

/** Straight for `beforeKm`, then hairpins (200 m across, 20 m apart) for about `ghatKm`. */
function withHairpins(beforeKm: number, ghatKm: number): LineString {
  const coords = straight(beforeKm).coordinates as [number, number][];
  let [lng, lat] = coords.at(-1)!;
  const across = 200 / (M_PER_DEG_LAT * Math.cos((12 * Math.PI) / 180));
  const up = 20 / M_PER_DEG_LAT;
  for (let i = 0; i < Math.round((ghatKm * 1000) / 220); i++) {
    lng += i % 2 === 0 ? across : -across;
    coords.push([lng, lat]);
    lat += up;
    coords.push([lng, lat]);
  }
  return { type: "LineString", coordinates: coords };
}

describe("roadClass", () => {
  it("reads national and state highways from road numbers", () => {
    for (const ref of ["NH75", "NH 48; AH47", "NH-48", "NE4", "NH548H"]) {
      expect(roadClass(ref), ref).toBe("national");
    }
    for (const ref of ["SH 57", "SH-07", "SH130; 135", "SH106"]) {
      expect(roadClass(ref), ref).toBe("state");
    }
    for (const ref of ["MDR34", "ODR 12", null]) expect(roadClass(ref), String(ref)).toBe("other");
  });
});

describe("ghatSections", () => {
  it("finds none on a straight road", () => {
    expect(ghatSections(straight(20))).toEqual([]);
  });

  it("finds a stretch of hairpins", () => {
    const sections = ghatSections(withHairpins(10, 6));
    expect(sections).toHaveLength(1);
    const [from, to] = sections[0]!;
    expect(from).toBeGreaterThan(0.5); // after the straight 10 km
    expect(to).toBeGreaterThan(0.95);
  });

  it("finds the Nilgiris climb on the way to Ooty and nothing on the plains", () => {
    const [route] = routeFixture("bengaluru-ooty");
    const km = route!.distanceM / 1000;
    const sections = ghatSections(route!.geometry).map(([a, b]) => [a * km, b * km]);
    const total = sections.reduce((s, [a, b]) => s + (b! - a!), 0);
    expect(total / km).toBeGreaterThan(0.12);
    expect(total / km).toBeLessThan(0.25);
    expect(sections.every(([a]) => a! > 200)).toBe(true); // Bengaluru–Mysuru–Gundlupet is flat
    expect(sections.some(([a, b]) => a! < 260 && b! > 280)).toBe(true); // Gudalur–Naduvattam
  });

  it("finds Khambatki ghat on NH48 between Pune and Satara", () => {
    const nh48 = routeFixture("pune-goa")[1]!;
    const km = nh48.distanceM / 1000;
    const sections = ghatSections(nh48.geometry).map(([a, b]) => [a * km, b * km]);
    expect(sections.some(([a, b]) => a! < 68 && b! > 66)).toBe(true);
  });
});

describe("roadMix", () => {
  const route = (geometry: LineString, roads: RouteResult["roads"], distanceM: number) => ({
    geometry,
    distanceM,
    durationS: 0,
    legs: [],
    roads,
  });

  it("splits the distance by road number, with ghats taking priority", () => {
    const geometry = withHairpins(10, 6);
    const mix = roadMix(
      route(
        geometry,
        [
          { distanceM: 5_000, ref: "NH75" },
          { distanceM: 5_000, ref: "SH 57" },
          { distanceM: 6_000, ref: "SH 57" },
        ],
        16_000,
      ),
    )!;
    expect(mix.nationalM).toBeCloseTo(5_000, -2);
    expect(mix.ghatM).toBeGreaterThan(4_000);
    expect(mix.otherM).toBe(0);
    expect(mix.nationalM + mix.stateM + mix.ghatM + mix.otherM).toBeCloseTo(16_000, 3);
  });

  it("is null when the engine reports no road stretches", () => {
    expect(roadMix(route(straight(5), undefined, 5_000))).toBeNull();
    expect(roadMix(route(straight(5), [], 5_000))).toBeNull();
  });

  it("matches the roads of a real route", () => {
    const [viaChikkamagaluru] = routeFixture("bengaluru-samse");
    const mix = roadMix(viaChikkamagaluru!)!;
    const share = (m: number) => m / viaChikkamagaluru!.distanceM;
    expect(share(mix.nationalM)).toBeGreaterThan(0.6); // NH48, NH73 most of the way
    expect(share(mix.ghatM)).toBeGreaterThan(0.12); // Mudigere–Kottigehara–Samse
  });
});
