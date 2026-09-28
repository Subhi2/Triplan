import type { LineString } from "geojson";
import { customType } from "drizzle-orm/pg-core";

export type LngLat = [number, number];

// Values go to Postgres as EWKT text (geography accepts it as input) and come back as
// hex-encoded EWKB, which is how PostGIS outputs geography by default.

export function pointToEwkt([lng, lat]: LngLat): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

export function lineToEwkt(line: LineString): string {
  const coords = line.coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(",");
  return `SRID=4326;LINESTRING(${coords})`;
}

const WKB_POINT = 1;
const WKB_LINESTRING = 2;
const EWKB_Z = 0x80000000;
const EWKB_M = 0x40000000;
const EWKB_SRID = 0x20000000;

function readEwkb(hex: string): { type: number; coords: LngLat[] } {
  const buf = Buffer.from(hex, "hex");
  const le = buf.readUInt8(0) === 1;
  let offset = 1;
  const u32 = () => {
    const v = le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
    offset += 4;
    return v;
  };
  const f64 = () => {
    const v = le ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
    offset += 8;
    return v;
  };

  const rawType = u32();
  if (rawType & EWKB_SRID) u32();
  const extraDims = (rawType & EWKB_Z ? 1 : 0) + (rawType & EWKB_M ? 1 : 0);
  const type = rawType & 0x0fffffff;

  const readPoint = (): LngLat => {
    const lng = f64();
    const lat = f64();
    offset += extraDims * 8;
    return [lng, lat];
  };

  if (type === WKB_POINT) return { type, coords: [readPoint()] };
  if (type === WKB_LINESTRING) {
    const n = u32();
    return { type, coords: Array.from({ length: n }, readPoint) };
  }
  throw new Error(`Unsupported WKB geometry type ${type}`);
}

export function ewkbToPoint(hex: string): LngLat {
  const { type, coords } = readEwkb(hex);
  if (type !== WKB_POINT || !coords[0]) throw new Error("Expected a WKB point");
  return coords[0];
}

export function ewkbToLine(hex: string): LineString {
  const { type, coords } = readEwkb(hex);
  if (type !== WKB_LINESTRING) throw new Error("Expected a WKB linestring");
  return { type: "LineString", coordinates: coords };
}

export const geographyPoint = customType<{ data: LngLat; driverData: string }>({
  dataType: () => "geography(Point, 4326)",
  toDriver: pointToEwkt,
  fromDriver: ewkbToPoint,
});

export const geographyLine = customType<{ data: LineString; driverData: string }>({
  dataType: () => "geography(LineString, 4326)",
  toDriver: lineToEwkt,
  fromDriver: ewkbToLine,
});
