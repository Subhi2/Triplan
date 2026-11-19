"use client";

import type { FeatureCollection, LineString } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
import type { MapRidePreview } from "./types";
import { MAP_COLORS } from "./mapColors";

/** The wide, invisible line a tap lands on; the visible one is thin. */
export const RIDE_PREVIEW_HIT_LAYER = "ride-previews-hit";

/**
 * Famous rides drawn faintly on the empty planner's map, so the first screen shows where to go.
 * A tap on one opens it (MapView's click handler, by `slug`).
 */
export function RidePreviewLayer({ rides }: { rides: MapRidePreview[] }) {
  const data: FeatureCollection<LineString, { slug: string; state: string }> = {
    type: "FeatureCollection",
    features: rides.map((r) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: r.line },
      properties: { slug: r.slug, state: r.state ?? "plain" },
    })),
  };
  return (
    <Source id="ride-previews" type="geojson" data={data}>
      <Layer
        id="ride-previews"
        type="line"
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          "line-color": [
            "match",
            ["get", "state"],
            "pending",
            MAP_COLORS.pending,
            "none",
            MAP_COLORS.altRoute,
            MAP_COLORS.brand,
          ],
          "line-width": ["match", ["get", "state"], "done", 5, "none", 3.5, 4],
          "line-opacity": ["match", ["get", "state"], "none", 0.8, "plain", 0.85, 1],
        }}
      />
      <Layer
        id={RIDE_PREVIEW_HIT_LAYER}
        type="line"
        paint={{ "line-color": MAP_COLORS.brand, "line-width": 16, "line-opacity": 0 }}
      />
    </Source>
  );
}
