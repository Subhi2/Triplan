"use client";

import { layers, namedFlavor } from "@protomaps/basemaps";
import maplibregl, { type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import { packGlyphKey, packTileKey } from "@/lib/offlinePack";

// The map of a saved pack: Protomaps' basemap style (BSD-3) over the tiles in the pack's cache,
// read through two MapLibre protocols, so nothing is fetched from the network. A tile or glyph
// that is not in any pack is drawn empty.

let registered = false;

async function fromPacks(key: string): Promise<ArrayBuffer> {
  const hit = await caches.match(key);
  return hit ? hit.arrayBuffer() : new ArrayBuffer(0);
}

/** pack://z/x/y and pack-glyphs://<fontstack>/<range>, once per page. */
export function registerPackProtocols(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol("pack", async (params) => {
    const m = /^pack:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) return { data: new ArrayBuffer(0) };
    return { data: await fromPacks(packTileKey(Number(m[1]), Number(m[2]), Number(m[3]))) };
  });
  maplibregl.addProtocol("pack-glyphs", async (params) => {
    const m = /^pack-glyphs:\/\/(.+)\/(\d+-\d+)(?:\.pbf)?$/.exec(params.url);
    if (!m) return { data: new ArrayBuffer(0) };
    return { data: await fromPacks(packGlyphKey(decodeURIComponent(m[1]!), m[2]!)) };
  });
}

/** Layers that are only icons (one-way arrows, road shields, the map's own points of interest). */
const ICON_LAYERS = new Set(["roads_oneway", "roads_shields", "pois"]);

/** A layer without its icon: town names keep their text, minus the dot (packs have no sprite). */
function withoutIcon(layer: LayerSpecification): LayerSpecification {
  if (layer.type !== "symbol" || !layer.layout) return layer;
  const layout = Object.fromEntries(
    Object.entries(layer.layout).filter(([k]) => !k.startsWith("icon-")),
  ) as typeof layer.layout;
  return { ...layer, layout };
}

/** The offline style for a pack whose tiles go up to `maxZoom`. Icons are left out (no sprite). */
export function offlineStyle(maxZoom: number): StyleSpecification {
  return {
    version: 8,
    glyphs: "pack-glyphs://{fontstack}/{range}",
    sources: {
      protomaps: {
        type: "vector",
        tiles: ["pack://{z}/{x}/{y}"],
        minzoom: 0,
        maxzoom: maxZoom,
        attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", namedFlavor("light"), { lang: "en" })
      .filter((l) => !ICON_LAYERS.has(l.id))
      .map(withoutIcon),
  };
}
