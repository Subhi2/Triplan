"use client";

import type { FeatureCollection, LineString } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
import type { LngLat } from "@/lib/geo";
import type { RouteOption } from "@/lib/trip";
import { linePart, useDrawIn } from "./useDrawIn";

export const ROUTE_LAYER_IDS = ["routes-alt", "routes-selected"];

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
}

/** All route options: the selected one thick, the others thin and dashed (and clickable). */
export function RouteLayer({ routes, selectedId }: Props) {
  // The picked route draws itself along the road.
  const progress = useDrawIn(routes.some((r) => r.id === selectedId) ? (selectedId ?? "") : "");
  const data: FeatureCollection<LineString, { id: string; selected: boolean }> = {
    type: "FeatureCollection",
    features: routes.map((r) => {
      const selected = r.id === selectedId;
      const coordinates = selected
        ? linePart(r.geometry.coordinates as LngLat[], progress)
        : r.geometry.coordinates;
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { id: r.id, selected },
      };
    }),
  };

  return (
    <Source id="routes" type="geojson" data={data}>
      <Layer
        id="routes-alt"
        type="line"
        filter={["==", ["get", "selected"], false]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#8c877c", "line-width": 3, "line-dasharray": [2, 2] }}
      />
      <Layer
        id="routes-selected-casing"
        type="line"
        filter={["==", ["get", "selected"], true]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#ffffff", "line-width": 9 }}
      />
      <Layer
        id="routes-selected"
        type="line"
        filter={["==", ["get", "selected"], true]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#0f766e", "line-width": 5 }}
      />
    </Source>
  );
}
