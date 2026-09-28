"use client";

import type { FeatureCollection, LineString } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
import type { RouteOption } from "@/lib/trip";

export const ROUTE_LAYER_IDS = ["routes-alt", "routes-selected"];

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
}

/** All route options: the selected one thick, the others thin and dashed (and clickable). */
export function RouteLayer({ routes, selectedId }: Props) {
  const data: FeatureCollection<LineString, { id: string; selected: boolean }> = {
    type: "FeatureCollection",
    features: routes.map((r) => ({
      type: "Feature",
      geometry: r.geometry,
      properties: { id: r.id, selected: r.id === selectedId },
    })),
  };

  return (
    <Source id="routes" type="geojson" data={data}>
      <Layer
        id="routes-alt"
        type="line"
        filter={["==", ["get", "selected"], false]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#64748b", "line-width": 3, "line-dasharray": [2, 2] }}
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
