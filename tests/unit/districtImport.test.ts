import { describe, expect, it } from "vitest";
import { buildOutlineLookupUrl, parseOutlineLookup } from "@/server/providers/osm/districtOutlines";
import { buildDistrictsQuery } from "@/server/providers/osm/overpass";
import {
  districtFromElement,
  districtNames,
  normalizeDistrictName,
} from "@/server/services/districtImportService";

// Tags as OSM has them on Chikkamagaluru's boundary (relation 2020603), 2026-10-14.
const chikkamagaluru = {
  id: "relation/2020603",
  location: [75.64, 13.41] as [number, number],
  extentM: 120_000,
  tags: {
    boundary: "administrative",
    admin_level: "5",
    name: "Chikkamagaluru",
    "name:kn": "ಚಿಕ್ಕಮಗಳೂರು",
    old_name: "Chikmagalur",
    "ref:LGD:district": "532",
    wikidata: "Q743077",
  },
};

describe("districts from OpenStreetMap", () => {
  it("keep the LGD code and every name a district goes by", () => {
    expect(districtFromElement(chikkamagaluru, "karnataka")).toEqual({
      relationId: 2020603,
      osmId: "relation/2020603",
      lgdCode: 532,
      name: "Chikkamagaluru",
      names: ["chikkamagaluru", "chikmagalur"],
      region: "karnataka",
    });
  });

  it("allow a district without a code, and skip what is not a district", () => {
    const tags = { ...chikkamagaluru.tags, "ref:LGD:district": "n/a" };
    expect(districtFromElement({ ...chikkamagaluru, tags }, "karnataka")!.lgdCode).toBeNull();
    const taluk = { ...chikkamagaluru.tags, admin_level: "6" };
    expect(districtFromElement({ ...chikkamagaluru, tags: taluk }, "karnataka")).toBeNull();
    expect(districtFromElement({ ...chikkamagaluru, id: "way/1" }, "karnataka")).toBeNull();
  });

  it("normalize names the way alerts write them", () => {
    expect(normalizeDistrictName("Chikmagalur District")).toBe("chikmagalur");
    expect(normalizeDistrictName("Purba Bardhaman")).toBe("purba bardhaman");
    expect(normalizeDistrictName("Sri Potti Sriramulu Nellore")).toBe(
      "sri potti sriramulu nellore",
    );
    expect(normalizeDistrictName("Thoothukkudi (Tuticorin)")).toBe("thoothukkudi tuticorin");
    expect(districtNames({ name: "Mysuru", alt_name: "Mysore;Mysore District" })).toEqual([
      "mysuru",
      "mysore",
    ]);
  });
});

describe("the district queries", () => {
  it("ask Overpass for a state's district boundaries, tags and bounds only", () => {
    const q = buildDistrictsQuery("IN-KA");
    expect(q).toContain('area["ISO3166-2"="IN-KA"]["admin_level"="4"]->.region;');
    expect(q).toContain('rel["boundary"="administrative"]["admin_level"="5"](area.region);');
    expect(q).toContain("out tags bb qt;");
  });

  it("ask Nominatim for simplified outlines, 50 relations at a time", () => {
    const url = new URL(buildOutlineLookupUrl("https://nominatim.example/", [2020603, 2020529]));
    expect(url.pathname).toBe("/lookup");
    expect(url.searchParams.get("osm_ids")).toBe("R2020603,R2020529");
    expect(url.searchParams.get("polygon_geojson")).toBe("1");
    expect(url.searchParams.get("polygon_threshold")).toBe("0.002");
  });

  it("read the outlines of relations only", () => {
    const ring: [number, number][] = [
      [75.1, 13.1],
      [75.9, 13.1],
      [75.9, 13.8],
      [75.1, 13.1],
    ];
    const outlines = parseOutlineLookup([
      { osm_type: "relation", osm_id: 1, geojson: { type: "Polygon", coordinates: [ring] } },
      {
        osm_type: "relation",
        osm_id: 2,
        geojson: { type: "MultiPolygon", coordinates: [[ring], [ring]] },
      },
      { osm_type: "relation", osm_id: 3, geojson: { type: "Point", coordinates: [75, 13] } },
      { osm_type: "way", osm_id: 4, geojson: { type: "Polygon", coordinates: [ring] } },
    ]);
    expect([...outlines.keys()]).toEqual([1, 2]);
    expect(outlines.get(2)).toHaveLength(2);
    expect(outlines.get(1)![0]![0]).toEqual(ring);
  });
});
