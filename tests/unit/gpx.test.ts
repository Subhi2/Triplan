import { describe, expect, it } from "vitest";
import { haversineM, type LngLat } from "@/lib/geo";
import { gpxFileName, sliceLine, tripGpx } from "@/lib/gpx";

describe("tripGpx", () => {
  const gpx = tripGpx({
    name: "Bengaluru → Kalasa via Sakleshpur",
    link: "https://example.app/trips/1?a=1&b=2",
    route: [
      [77.5946, 12.9716],
      [75.785, 12.943],
      [75.356, 13.234],
    ],
    stops: [
      {
        name: "Bengaluru",
        location: [77.5946, 12.9716],
        description: "Start",
        symbol: "Flag, Green",
      },
      { name: "Kalasa", location: [75.356, 13.234], description: "Destination" },
    ],
    places: [{ name: "Ganesha <& Sons> 'Temple'", location: [75.7581, 12.9173] }],
  });

  it("is a GPX 1.1 document with waypoints and one track", () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1"')).toBe(true);
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(gpx.match(/<wpt /g)).toHaveLength(3);
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx).toContain('<wpt lat="12.971600" lon="77.594600">');
    expect(gpx).toContain("<sym>Flag, Green</sym>");
    expect(gpx.trim().endsWith("</gpx>")).toBe(true);
  });

  it("escapes names and links", () => {
    expect(gpx).toContain("<name>Ganesha &lt;&amp; Sons&gt; &apos;Temple&apos;</name>");
    expect(gpx).toContain('<link href="https://example.app/trips/1?a=1&amp;b=2">');
  });

  it("has one track per day and the nights as lodging waypoints for a multi-day split", () => {
    const days = tripGpx({
      name: "Pune → Kochi",
      route: [
        [73.85, 18.52],
        [76.27, 9.93],
      ],
      stops: [],
      places: [],
      days: [
        {
          name: "Day 1: Pune → Hosapete",
          route: [
            [73.85, 18.52],
            [76.39, 15.27],
          ],
        },
        {
          name: "Day 2: Hosapete → Kochi",
          route: [
            [76.39, 15.27],
            [76.27, 9.93],
          ],
        },
      ],
      nights: [{ name: "Night 1: Hosapete", location: [76.39, 15.27], symbol: "Lodging" }],
    });
    expect(days.match(/<trk>/g)).toHaveLength(2);
    expect(days).toContain("<name>Day 2: Hosapete → Kochi</name>");
    expect(days).toContain("<sym>Lodging</sym>");
  });
});

describe("sliceLine", () => {
  // Due north along 76° E, about 111 km per degree.
  const line: LngLat[] = [
    [76, 12],
    [76, 13],
    [76, 14],
  ];
  const length = (l: LngLat[]) =>
    l.slice(1).reduce((n, p, i) => n + haversineM(l[i]!, p), 0) / 1000;

  it("cuts a line exactly at both km, keeping the points between", () => {
    const part = sliceLine(line, 50, 150);
    expect(length(part)).toBeCloseTo(100, 3);
    expect(part).toHaveLength(3);
    expect(part[1]).toEqual([76, 13]);
    expect(sliceLine(line, 0, 1_000)).toEqual(line);
  });
});

describe("gpxFileName", () => {
  it("makes a short, safe file name", () => {
    expect(gpxFileName("Bengaluru → Kalasa via Sakleshpur")).toBe(
      "bengaluru-to-kalasa-via-sakleshpur.gpx",
    );
    expect(gpxFileName("Coorg ride: Mysuru / Madikeri!")).toBe("coorg-ride-mysuru-madikeri.gpx");
    expect(gpxFileName("→")).toBe("to.gpx");
    expect(gpxFileName("")).toBe("trip.gpx");
  });
});
