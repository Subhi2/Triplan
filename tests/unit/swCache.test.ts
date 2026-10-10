import { describe, expect, it } from "vitest";
import { isNeverCached } from "@/lib/swCache";

const same = (path: string) => isNeverCached(new URL(path, "https://triplan.example"), true);
const cross = (href: string) => isNeverCached(new URL(href), false);

describe("isNeverCached", () => {
  it("never stores our API answers", () => {
    expect(same("/api/places/manjarabad-fort/google")).toBe(true);
    expect(same("/api/google/photo?name=places/x/photos/y&w=800")).toBe(true);
    expect(same("/api/places/near?lng=75.789&lat=12.944")).toBe(true);
    expect(same("/api/trips/abc")).toBe(true);
  });

  it("leaves pages and static assets to the default rules", () => {
    expect(same("/place/manjarabad-fort")).toBe(false);
    expect(same("/_next/static/chunks/main.js")).toBe(false);
    expect(same("/icons/icon-192.png")).toBe(false);
  });

  it("never stores Google content", () => {
    expect(cross("https://places.googleapis.com/v1/places/x/media")).toBe(true);
    expect(cross("https://lh3.googleusercontent.com/places/abc=w800")).toBe(true);
    expect(cross("https://maps.gstatic.com/mapfiles/marker.png")).toBe(true);
    expect(cross("https://maps.googleapis.com/maps/vt?pb=1")).toBe(true);
    expect(cross("https://www.google.com/maps/search/?api=1")).toBe(true);
  });

  it("lets open map tiles and Commons photos be cached", () => {
    expect(cross("https://tiles.openfreemap.org/planet/1/2/3.pbf")).toBe(false);
    expect(
      cross("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/320px-x.jpg"),
    ).toBe(false);
    expect(cross("https://notgoogle.com/x")).toBe(false);
  });
});
