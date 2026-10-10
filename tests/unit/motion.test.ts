import { describe, expect, it } from "vitest";
import { countAt, easeOutCubic } from "@/lib/countUp";
import { crownStyle, type CrownConfig } from "@/lib/crown";
import { listTurn } from "@/lib/listTurn";

describe("count up", () => {
  it("eases out and lands on the exact value", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeOutCubic(2)).toBe(1);
    expect(countAt(0, 337.6, 0)).toBe(0);
    expect(countAt(0, 337.6, 600)).toBeGreaterThan(250);
    expect(countAt(0, 337.6, 1200)).toBe(337.6);
    expect(countAt(0, 337.6, 5000)).toBe(337.6);
    // Counting down to a new value works the same way.
    expect(countAt(1662, 900, 1200)).toBe(900);
  });
});

describe("pointer proximity", () => {
  const row = { left: 0, top: 100, width: 300, height: 40 }; // centre (150, 120)
  const column: CrownConfig = { axis: "y", radius: 80, lift: 10, shift: 5, glow: 0.2, rail: 3 };

  it("moves rows near the pointer most, and leaves rows out of reach alone", () => {
    const under = crownStyle(row, 150, 120, column)!;
    expect(under.x).toBeCloseTo(5);
    expect(under.y).toBeCloseTo(0);
    expect(under.rail).toBeCloseTo(3);
    expect(under.glow).toBeCloseTo(0.2);
    const near = crownStyle(row, 150, 150, column)!;
    expect(near.x).toBeGreaterThan(0);
    expect(near.x).toBeLessThan(under.x);
    // A row above the pointer moves up, away from it.
    expect(near.y).toBeLessThan(0);
    expect(crownStyle(row, 150, 220, column)).toBeNull();
  });

  it("leans grid cards towards the pointer and grows them", () => {
    const card = { left: 0, top: 0, width: 200, height: 200 }; // centre (100, 100)
    const grid: CrownConfig = {
      axis: "xy",
      radius: 260,
      lift: 12,
      shift: 12,
      grow: 0.04,
      toward: true,
    };
    const s = crownStyle(card, 200, 100, grid)!;
    expect(s.x).toBeGreaterThan(0); // towards the pointer on the right
    expect(s.y).toBeCloseTo(0);
    expect(s.scale).toBeGreaterThan(1);
    expect(s.scale).toBeLessThan(1.04);
    expect(crownStyle(card, 100, 100, grid)!.x).toBeCloseTo(0); // right under it: no lean
  });
});

describe("list turn", () => {
  const view = { routeIndex: 0, filterKey: "", filterRank: 0 };

  it("turns forward for a later route or a narrower filter, back otherwise", () => {
    expect(listTurn(view, view)).toBeNull();
    expect(listTurn(view, { ...view, routeIndex: 1 })).toBe("next");
    expect(listTurn({ ...view, routeIndex: 2 }, view)).toBe("prev");
    expect(listTurn(view, { ...view, filterKey: "temple", filterRank: 1 })).toBe("next");
    expect(listTurn({ ...view, filterKey: "temple", filterRank: 1 }, view)).toBe("prev");
  });
});
