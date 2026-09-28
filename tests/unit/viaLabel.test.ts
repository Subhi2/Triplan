import { describe, expect, it } from "vitest";
import { viaLabels, type TownOnRoute } from "@/server/services/viaLabel";

const town = (name: string, kmFromStart: number): TownOnRoute => ({
  name,
  kmFromStart,
  location: [0, 0],
});

// Towns along the two OSRM routes for Bengaluru → Kalasa (start and end removed).
const viaChikkamagaluru = {
  distanceKm: 337.6,
  towns: [town("Chikkamagaluru", 250), town("Mudigere", 280), town("Kottigehara", 296)],
};
const viaSakleshpur = {
  distanceKm: 312.3,
  towns: [
    town("Kunigal", 71),
    town("Hassan", 182),
    town("Sakleshpur", 220),
    town("Mudigere", 257),
    town("Kottigehara", 271),
  ],
};

describe("viaLabels", () => {
  it("names alternatives by their last towns that no other route passes", () => {
    expect(viaLabels([viaChikkamagaluru, viaSakleshpur], [])).toEqual([
      "via Chikkamagaluru",
      "via Hassan, Sakleshpur",
    ]);
  });

  it("uses the user's via stops when there are any", () => {
    expect(viaLabels([viaSakleshpur], ["Sakleshpur"])).toEqual(["via Sakleshpur"]);
    expect(viaLabels([viaSakleshpur], ["Belur", "Chikkamagaluru", "Balehonnur"])).toEqual([
      "via Belur, Chikkamagaluru +1",
    ]);
  });

  it("uses the most central town for a lone route", () => {
    expect(viaLabels([viaSakleshpur], [])).toEqual(["via Hassan"]);
  });

  it("falls back when no towns are known", () => {
    expect(viaLabels([{ distanceKm: 10, towns: [] }], [])).toEqual(["Direct route"]);
    expect(
      viaLabels(
        [
          { distanceKm: 10, towns: [] },
          { distanceKm: 12, towns: [] },
        ],
        [],
      ),
    ).toEqual(["Route 1", "Route 2"]);
  });
});
