import { describe, expect, it } from "vitest";
import { buildPlacesQuery, parseOverpassResponse } from "@/server/providers/osm/overpass";
import { OsmTileTooBigError, type OsmElement } from "@/server/providers/osm";
import { ProviderError } from "@/server/providers/http";
import {
  classifyOsmElement,
  dedupeCandidates,
  osmSlug,
  type OsmPlaceCandidate,
} from "@/server/services/osmClassify";
import {
  OSM_REGIONS,
  padBBox,
  resolveRegionKeys,
  splitTile,
  tilesFor,
  type OsmRegion,
} from "@/server/services/osmRegions";
import { jsonFixture } from "../helpers/fixtures";

// A slice of a real Overpass response for Goa (tests/fixtures/overpass/goa-sample.json).
const elements = parseOverpassResponse(jsonFixture("overpass/goa-sample.json"));
const byId = new Map(elements.map((e) => [e.id, e]));
const classify = (id: string) => classifyOsmElement(byId.get(id)!);

describe("Overpass query and response", () => {
  it("queries each tag filter inside the state boundary and the tile", () => {
    const q = buildPlacesQuery({ areaIso: "IN-GA", bbox: [73.6, 14.8, 74.4, 15.8] });
    expect(q).toContain('area["ISO3166-2"="IN-GA"]["admin_level"="4"]->.region;');
    expect(q).toContain('nwr["amenity"="fuel"](area.region)(14.8,73.6,15.8,74.4);');
    expect(q).toContain('nwr["waterway"="waterfall"](area.region)');
    expect(q).toContain('node["place"~"^(town|city)$"](area.region)');
    expect(q).toContain("way.all;out tags bb qt;");
  });

  it("parses nodes and uses the bounding-box centre for ways, in [lng, lat] order", () => {
    const vasco = byId.get("node/1063577355")!;
    expect(vasco.extentM).toBe(0);
    expect(vasco.location[0]).toBeGreaterThan(73);
    expect(vasco.location[1]).toBeLessThan(16);

    const reservoir = byId.get("way/1396814037")!;
    expect(reservoir.extentM).toBeGreaterThan(150);
    expect(reservoir.location[0]).toBeGreaterThan(73);
  });

  it("turns Overpass runtime errors into typed errors", () => {
    expect(() =>
      parseOverpassResponse({
        elements: [],
        remark: 'runtime error: Query timed out in "query" at line 3 after 181 seconds.',
      }),
    ).toThrow(OsmTileTooBigError);
    expect(() =>
      parseOverpassResponse({ elements: [], remark: "runtime error: something else" }),
    ).toThrow(ProviderError);
    expect(() => parseOverpassResponse({ nope: true })).toThrow(ProviderError);
  });
});

describe("classifyOsmElement", () => {
  it("imports towns with their English name, population and local-language names", () => {
    expect(classify("node/1063577355")).toMatchObject({
      category: "town",
      name: "Vasco da Gama",
      population: 94393,
    });
    const calangute = classify("node/1688110013")!;
    expect(calangute).toMatchObject({ category: "town", population: null, wikidataId: "Q861976" });
    expect(calangute.altNames).toEqual(expect.arrayContaining(["ಕಲಂಗುಟ್", "கலங்குட்"]));
  });

  it("maps tags to categories, most specific first", () => {
    expect(classify("node/11074780405")?.category).toBe("waterfall"); // waterway=waterfall
    expect(classify("way/1166324948")?.category).toBe("fort");
    expect(classify("way/156595303")?.category).toBe("fort"); // historic=fort + tourism=attraction
    expect(classify("node/1658757838")?.category).toBe("temple"); // religion=hindu
    expect(classify("way/1155600557")?.category).toBe("worship"); // religion=christian
    expect(classify("way/1396814037")?.category).toBe("lake"); // landuse=reservoir
    expect(classify("node/4288424613")?.category).toBe("museum");
    expect(classify("node/9417116298")?.category).toBe("peak");
    expect(classify("node/8410667979")?.category).toBe("cave");
    expect(classify("node/3951791157")?.category).toBe("stay"); // camp_site
    expect(classify("node/10242095781")?.category).toBe("viewpoint");
  });

  it("names fuel stations by brand when they have no usable name", () => {
    expect(classify("node/4281538990")?.name).toBe("Hp Petrol Pump - Om Shree Vetobaa");
    expect(classify("node/8179259958")?.name).toBe("Indian Oil");
    expect(classify("node/4294196690")?.name).toBe("Fuel station"); // name was "गैस स्टेशन"
  });

  it("skips unnamed places, plaques, minor memorials and tiny lakes", () => {
    expect(classify("node/8409186083")).toBeNull(); // unnamed viewpoint
    expect(classify("node/10819036170")).toBeNull(); // memorial=plaque
    expect(classify("node/2660025329")).toBeNull(); // statue with no Wikidata link
    expect(classify("way/1080221892")).toBeNull(); // "Umalo Well", 15 m across
  });

  it("skips private places", () => {
    const el: OsmElement = {
      id: "node/1",
      location: [74, 15],
      extentM: 0,
      tags: { tourism: "viewpoint", name: "Private deck", access: "private" },
    };
    expect(classifyOsmElement(el)).toBeNull();
  });

  it("keeps a stable slug and selected tags", () => {
    const fort = classify("way/1166324948")!;
    expect(fort.slug).toBe("mormugao-fort-w1166324948");
    expect(fort.osmTags).toMatchObject({ historic: "fort", wikidata: "Q10283625" });
    expect(osmSlug("ಕಾಬೊ ಡೆ ರಾಮ ಕೋಟೆ", "node/42", "fort")).toBe("fort-n42");
    const viewpoint = classify("node/10242095781")!;
    expect(viewpoint.osmTags.description!.length).toBeLessThanOrEqual(500);
  });
});

describe("dedupeCandidates", () => {
  const candidates = elements.map(classifyOsmElement).filter((c): c is OsmPlaceCandidate => !!c);

  it("merges a beach mapped as a node and an outline, keeping the outline", () => {
    const beaches = dedupeCandidates(candidates).filter((c) => c.name === "Colva Beach");
    expect(beaches.map((b) => b.osmId)).toEqual(["way/397058297"]);
  });

  it("keeps same-named places that are far apart", () => {
    const a = candidates.find((c) => c.category === "fuel")!;
    const far = {
      ...a,
      osmId: "node/999",
      location: [a.location[0] + 0.1, a.location[1]] as [number, number],
    };
    expect(dedupeCandidates([a, far])).toHaveLength(2);
  });
});

describe("tiles", () => {
  it("covers a region with 1° tiles, clipped at its edges", () => {
    const tiles = tilesFor([73.6, 14.8, 74.4, 15.9], 1);
    expect(tiles).toEqual([
      [73.6, 14.8, 74.4, 15.8],
      [73.6, 15.8, 74.4, 15.9],
    ]);
    expect(tilesFor([74, 11.5, 78.6, 18.5], 1)).toHaveLength(35);
  });

  it("splits a tile into quarters", () => {
    expect(splitTile([74, 12, 75, 13])).toEqual([
      [74, 12, 74.5, 12.5],
      [74.5, 12, 75, 12.5],
      [74, 12.5, 74.5, 13],
      [74.5, 12.5, 75, 13],
    ]);
  });
});

describe("regions", () => {
  const regions: OsmRegion[] = Object.values(OSM_REGIONS);

  it("covers all 36 Indian states and union territories once", () => {
    expect(regions).toHaveLength(36);
    expect(new Set(regions.map((r) => r.iso)).size).toBe(36);
    for (const r of regions) {
      expect(r.iso).toMatch(/^IN-[A-Z]{2}$/);
      const [west, south, east, north] = r.bbox;
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
      // Inside India's extent, [lng, lat] order.
      expect(west).toBeGreaterThan(68);
      expect(east).toBeLessThan(98);
      expect(south).toBeGreaterThan(6);
      expect(north).toBeLessThan(36);
    }
  });

  it("resolves 'all', lists and skips, and reports unknown keys", () => {
    expect(resolveRegionKeys("all").keys).toHaveLength(36);
    expect(resolveRegionKeys("all").keys[0]).toBe("karnataka");
    expect(resolveRegionKeys(" kerala , goa,kerala ").keys).toEqual(["kerala", "goa"]);
    const resumed = resolveRegionKeys("all", "karnataka,kerala,goa");
    expect(resumed.keys).toHaveLength(33);
    expect(resumed.keys).not.toContain("goa");
    expect(resolveRegionKeys("all", "karnataka kerala goa").keys).toEqual(resumed.keys);
    expect(resolveRegionKeys("kerala,atlantis").unknown).toEqual(["atlantis"]);
    expect(resolveRegionKeys("goa", "narnia").unknown).toEqual(["narnia"]);
    expect(resolveRegionKeys("").keys).toEqual([]);
  });

  it("pads bounds before tiling so edge places are not cut off", () => {
    expect(padBBox([76.7, 30.66, 76.85, 30.79], 0.02)).toEqual([76.68, 30.64, 76.87, 30.81]);
    // Scattered territories are fetched in one query.
    const py: OsmRegion = OSM_REGIONS.puducherry;
    expect(tilesFor(padBBox(py.bbox, 0.02), py.tileDeg ?? 1)).toHaveLength(1);
  });
});

describe("castles and junk names", () => {
  const castle = (name: string, extra: Record<string, string> = {}) =>
    classifyOsmElement({
      id: "way/1",
      location: [76.6, 12.3],
      extentM: 200,
      tags: { historic: "castle", name, ...extra },
    });

  it("files forts as forts and palaces as heritage", () => {
    expect(castle("Bekal Fort")?.category).toBe("fort");
    expect(castle("Uchchangidurga")?.category).toBe("fort");
    expect(castle("Channarayana Durga")?.category).toBe("fort");
    expect(castle("Mysore Palace", { wikidata: "Q456575" })?.category).toBe("heritage");
    expect(castle("Karthikapally kottaram")?.category).toBe("heritage");
    expect(castle("Cabo de Rama", { wikidata: "Q5015880" })?.category).toBe("fort");
    expect(castle("Gawilghur")?.category).toBe("fort");
    expect(castle("Shaniwar Wada")?.category).toBe("heritage");
    expect(castle("Bhor Rajwada")?.category).toBe("heritage");
  });

  it("trusts castle_type over the name", () => {
    expect(castle("Amba Vilas", { castle_type: "fortress" })?.category).toBe("fort");
    expect(castle("Old Fort Road House", { castle_type: "palace" })?.category).toBe("heritage");
  });

  it("drops houses and halls tagged as castles unless they are notable", () => {
    expect(castle("Kannan House")).toBeNull();
    expect(castle("Akhila Niwas, Nikhil's House")).toBeNull();
    expect(castle("Sri Devaraj Marriage Hall")).toBeNull();
    expect(castle("Patel Villa")).toBeNull();
    expect(castle("Juzar Manzil")).toBeNull();
    expect(castle("Thomas House", { wikidata: "Q1" })?.category).toBe("heritage");
  });

  it("keeps other castles: forts when notable, else heritage", () => {
    expect(castle("Makka Darawaja", { heritage: "2" })?.category).toBe("fort");
    expect(castle("Muranakeri")?.category).toBe("heritage");
  });

  it("drops names without letters", () => {
    const el = { id: "node/2", location: [76.7, 11.4] as [number, number], extentM: 0 };
    expect(
      classifyOsmElement({ ...el, tags: { tourism: "attraction", name: "15 | 36" } }),
    ).toBeNull();
    expect(
      classifyOsmElement({ ...el, tags: { tourism: "attraction", name: "ಜೋಗ ಜಲಪಾತ" } })?.name,
    ).toBe("ಜೋಗ ಜಲಪಾತ");
  });
});
