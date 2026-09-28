import { describe, expect, it } from "vitest";
import { ewkbToLine, ewkbToPoint, lineToEwkt, pointToEwkt } from "@/server/db/postgis";

// Hex EWKB as returned by PostGIS, e.g. SELECT 'SRID=4326;POINT(75.734 12.918)'::geography;
function ewkbPoint(lng: number, lat: number): string {
  const buf = Buffer.alloc(1 + 4 + 4 + 16);
  buf.writeUInt8(1, 0);
  buf.writeUInt32LE(0x20000001, 1);
  buf.writeUInt32LE(4326, 5);
  buf.writeDoubleLE(lng, 9);
  buf.writeDoubleLE(lat, 17);
  return buf.toString("hex");
}

function ewkbLine(coords: [number, number][]): string {
  const buf = Buffer.alloc(1 + 4 + 4 + 4 + coords.length * 16);
  buf.writeUInt8(1, 0);
  buf.writeUInt32LE(0x20000002, 1);
  buf.writeUInt32LE(4326, 5);
  buf.writeUInt32LE(coords.length, 9);
  coords.forEach(([x, y], i) => {
    buf.writeDoubleLE(x, 13 + i * 16);
    buf.writeDoubleLE(y, 21 + i * 16);
  });
  return buf.toString("hex");
}

describe("postgis codec", () => {
  it("writes points and lines as EWKT in [lng, lat] order", () => {
    expect(pointToEwkt([75.734, 12.918])).toBe("SRID=4326;POINT(75.734 12.918)");
    expect(
      lineToEwkt({
        type: "LineString",
        coordinates: [
          [77.5946, 12.9716],
          [75.356, 13.234],
        ],
      }),
    ).toBe("SRID=4326;LINESTRING(77.5946 12.9716,75.356 13.234)");
  });

  it("reads EWKB points", () => {
    expect(ewkbToPoint(ewkbPoint(75.734, 12.918))).toEqual([75.734, 12.918]);
  });

  it("reads EWKB linestrings", () => {
    const coords: [number, number][] = [
      [77.5946, 12.9716],
      [75.785, 12.943],
      [75.356, 13.234],
    ];
    expect(ewkbToLine(ewkbLine(coords))).toEqual({ type: "LineString", coordinates: coords });
  });

  it("rejects the wrong geometry type", () => {
    expect(() => ewkbToLine(ewkbPoint(1, 2))).toThrow();
  });
});
