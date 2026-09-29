import { afterEach, describe, expect, it, vi } from "vitest";
import type { LngLat } from "@/lib/geo";
import { sketchRoute } from "@/lib/routeSketch";
import { siteUrl, tripHeadline, whatsAppUrl } from "@/lib/site";
import { routeFixture } from "../helpers/fixtures";

const BENGALURU: LngLat = [77.5946, 12.9716];
const SAKLESHPUR: LngLat = [75.785, 12.943];
const KALASA: LngLat = [75.356, 13.234];

describe("siteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers NEXT_PUBLIC_SITE_URL, then Vercel's production domain, then localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://rideguide.in/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "triplan-blue.vercel.app");
    expect(siteUrl()).toBe("https://rideguide.in");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl()).toBe("https://triplan-blue.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("tripHeadline", () => {
  it("names start and destination, and the via stop when there is one", () => {
    expect(tripHeadline(["Bengaluru", "Kalasa"])).toBe("Bengaluru → Kalasa");
    expect(tripHeadline(["Bengaluru, Karnataka", "Sakleshpur", "Kalasa, Karnataka"])).toBe(
      "Bengaluru → Kalasa via Sakleshpur",
    );
    expect(tripHeadline(["Bengaluru", "Hassan", "Belur", "Kalasa"])).toBe(
      "Bengaluru → Kalasa via 2 stops",
    );
    expect(tripHeadline(["Bengaluru"])).toBe("Bengaluru");
  });
});

describe("whatsAppUrl", () => {
  it("puts the text and the link into one encoded message", () => {
    const url = whatsAppUrl("Bengaluru → Kalasa", "https://x.app/trips/1?a=1&b=2");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(new URL(url).searchParams.get("text")).toBe(
      "Bengaluru → Kalasa https://x.app/trips/1?a=1&b=2",
    );
  });
});

describe("sketchRoute", () => {
  const line = routeFixture("bengaluru-sakleshpur-kalasa")[0]!.geometry.coordinates as LngLat[];

  it("fits the route and stops inside the padded box, north up", () => {
    const { path, stops } = sketchRoute(line, [BENGALURU, SAKLESHPUR, KALASA], 400, 300, 20);
    expect(path.startsWith("M")).toBe(true);
    const points = path
      .split(/[ML]/)
      .filter(Boolean)
      .map((p) => p.trim().split(" ").map(Number) as [number, number]);
    for (const [x, y] of [...points, ...stops.map((s) => [s.x, s.y] as [number, number])]) {
      expect(x).toBeGreaterThanOrEqual(20);
      expect(x).toBeLessThanOrEqual(380);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(280);
    }
    const [b, s, k] = stops;
    expect(b!.x).toBeGreaterThan(k!.x); // Bengaluru is east of Kalasa
    expect(k!.y).toBeLessThan(s!.y); // Kalasa is north of Sakleshpur
  });

  it("handles a single point and no input", () => {
    expect(sketchRoute([], [BENGALURU], 100, 100).stops).toEqual([{ x: 50, y: 50 }]);
    expect(sketchRoute([], [], 100, 100)).toEqual({ path: "", stops: [] });
  });
});
