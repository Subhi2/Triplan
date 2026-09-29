import { describe, expect, it } from "vitest";
import { mainTowns, viaLabels, type TownOnRoute } from "@/server/services/viaLabel";

const town = (
  name: string,
  kmFromStart: number,
  population: number | null = null,
  kind: "city" | "town" = "town",
): TownOnRoute => ({ name, kmFromStart, population, kind, location: [0, 0] });

// Towns along the two OSRM routes for Bengaluru → Kalasa (start and end removed).
const viaChikkamagaluru = {
  distanceKm: 337.6,
  towns: [
    town("Tumakuru", 70, 302_143, "city"),
    town("Chikkamagaluru", 250, 118_496, "city"),
    town("Mudigere", 280, 8_962),
    town("Kottigehara", 296),
  ],
};
const viaSakleshpur = {
  distanceKm: 312.3,
  towns: [
    town("Kunigal", 71, 34_155),
    town("Hassan", 182, 155_006, "city"),
    town("Sakleshpur", 220, 23_352),
    town("Mudigere", 257, 8_962),
    town("Kottigehara", 271),
  ],
};

describe("viaLabels", () => {
  it("names alternatives by their largest and last unique towns, in road order", () => {
    expect(viaLabels([viaChikkamagaluru, viaSakleshpur], [])).toEqual([
      "via Tumakuru, Chikkamagaluru",
      "via Hassan, Sakleshpur",
    ]);
  });

  it("shows one town when the largest unique town is also the last", () => {
    const shortRoute = {
      distanceKm: 300,
      towns: [town("Kunigal", 71, 34_155), town("Hassan", 182, 155_006, "city")],
    };
    expect(viaLabels([viaChikkamagaluru, shortRoute], [])[1]).toBe("via Hassan");
  });

  it("ranks cities above towns when population is not tagged", () => {
    const route = { distanceKm: 100, towns: [town("Big", 10, null, "city"), town("Small", 50)] };
    const other = { distanceKm: 100, towns: [] };
    expect(viaLabels([route, other], [])[0]).toBe("via Big, Small");
  });

  it("uses the user's via stops when there are any", () => {
    expect(viaLabels([viaSakleshpur], ["Sakleshpur"])).toEqual(["via Sakleshpur"]);
    expect(viaLabels([viaSakleshpur], ["Belur", "Chikkamagaluru", "Balehonnur"])).toEqual([
      "via Belur, Chikkamagaluru +1",
    ]);
  });

  it("names a lone route after its largest town", () => {
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

describe("mainTowns", () => {
  it("keeps the largest towns, in road order", () => {
    const towns = [
      town("Nelamangala", 25, 37_000),
      town("Dabaspete", 50, 5_000),
      town("Tumakuru", 70, 302_143, "city"),
      town("Gubbi", 90, 20_000),
      town("Tipaturu", 140, 59_000),
      town("Kaduru", 190, 32_000),
      town("Chikkamagaluru", 250, 118_496, "city"),
    ];
    expect(mainTowns(towns, 4).map((t) => t.name)).toEqual([
      "Nelamangala",
      "Tumakuru",
      "Tipaturu",
      "Chikkamagaluru",
    ]);
  });
});
