"use client";

import type { FeatureCollection, Point } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
import { SAFETY_STYLE } from "@/lib/safety";
import type { MapViewProps } from "./types";

/** Safety stops on the MapLibre map: small dots in their kind's colour, ringed in white. */
export function ServicePins({ pins }: { pins: NonNullable<MapViewProps["servicePins"]> }) {
  const data: FeatureCollection<Point, { color: string; name: string }> = {
    type: "FeatureCollection",
    features: pins.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: p.location },
      properties: { color: SAFETY_STYLE[p.kind].color, name: p.name ?? "" },
    })),
  };
  return (
    <Source id="service-pins" type="geojson" data={data}>
      <Layer
        id="service-pins"
        type="circle"
        paint={{
          "circle-color": ["get", "color"],
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        }}
      />
    </Source>
  );
}
