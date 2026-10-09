import { afterEach, describe, expect, it, vi } from "vitest";
import { createOsmApiProvider, type OsmCurrent } from "@/server/providers/osm/osmApi";
import { closeLimit, planClosures, type CloseCandidate } from "@/server/services/osmClose";

const place = (osmId: string, name: string, category = "fort"): CloseCandidate => ({
  id: `id-${osmId}`,
  osmId,
  name,
  category,
  location: [75.846, 26.953],
});

const current = (...entries: OsmCurrent[]) => new Map(entries.map((e) => [e.id, e]));

describe("planClosures", () => {
  const amber = place("way/1", "Amber Fort");
  const jaigarh = place("way/2", "Jaigarh Fort");
  const plaque = place("node/3", "Old Memorial", "heritage");
  const nahargarh = place("node/4", "Nahargarh Fort");

  it("closes deleted and retagged places, keeps the ones still in OpenStreetMap", () => {
    const plan = planClosures(
      [amber, jaigarh, plaque, nahargarh],
      current(
        { id: "way/1", gone: true },
        {
          id: "way/2",
          gone: false,
          tags: { historic: "fort", name: "Jaigarh Fort" },
          location: null,
        },
        // Retagged: a plain memorial without a Wikidata link is no longer imported.
        {
          id: "node/3",
          gone: false,
          tags: { historic: "memorial", name: "Old Memorial" },
          location: [75.8, 26.9],
        },
      ),
      1000,
    );
    expect(plan.close.map((c) => [c.place.name, c.reason])).toEqual([
      ["Amber Fort", "deleted"],
      ["Old Memorial", "retagged"],
    ]);
    expect(plan.stillThere.map((p) => p.name)).toEqual(["Jaigarh Fort"]);
    expect(plan.unchecked.map((p) => p.name)).toEqual(["Nahargarh Fort"]);
    expect(plan.refused).toBe(false);
  });

  it("refuses to close more than 3% of a state without force", () => {
    const many = Array.from({ length: 40 }, (_, i) => place(`node/${100 + i}`, `Fort ${i}`));
    const gone = current(...many.map((p) => ({ id: p.osmId, gone: true as const })));
    expect(planClosures(many, gone, 1000)).toMatchObject({ limit: 30, refused: true });
    expect(planClosures(many, gone, 1000, { force: true }).refused).toBe(false);
    expect(planClosures(many, gone, 2000).refused).toBe(false);
  });

  it("lets a small state close a few places", () => {
    expect(closeLimit(50)).toBe(10);
    expect(closeLimit(10_000)).toBe(300);
  });
});

describe("OSM API provider", () => {
  afterEach(() => vi.unstubAllGlobals());
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("multi-fetches by type and reads deleted elements as gone", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/nodes.json")
        ? json(200, {
            elements: [
              { type: "node", id: 1, lat: 12.9, lon: 75.7, tags: { historic: "fort", name: "A" } },
              { type: "node", id: 2, visible: false },
            ],
          })
        : json(200, { elements: [{ type: "way", id: 9, tags: { natural: "beach", name: "B" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const found = await createOsmApiProvider("test", "https://osm.test/api/0.6", 0).fetchCurrent([
      "node/1",
      "node/2",
      "way/9",
    ]);
    expect(found.get("node/1")).toEqual({
      id: "node/1",
      gone: false,
      tags: { historic: "fort", name: "A" },
      location: [75.7, 12.9],
    });
    expect(found.get("node/2")).toEqual({ id: "node/2", gone: true });
    expect(found.get("way/9")).toMatchObject({ gone: false, location: null });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://osm.test/api/0.6/nodes.json?nodes=1,2",
      "https://osm.test/api/0.6/ways.json?ways=9",
    ]);
  });

  it("splits a batch on 404 to find the id that never existed", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("nodes=1,2") || url.endsWith("nodes=2")
        ? json(404, {})
        : json(200, { elements: [{ type: "node", id: 1, lat: 1, lon: 2, tags: {} }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const found = await createOsmApiProvider("test", "https://osm.test", 0).fetchCurrent([
      "node/1",
      "node/2",
    ]);
    expect(found.get("node/1")).toMatchObject({ gone: false });
    expect(found.get("node/2")).toEqual({ id: "node/2", gone: true });
  });

  it("leaves ids out when the API fails, so their places stay open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(503, {})),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const found = await createOsmApiProvider("test", "https://osm.test", 0).fetchCurrent([
      "node/1",
    ]);
    expect(found.size).toBe(0);
  });
});
