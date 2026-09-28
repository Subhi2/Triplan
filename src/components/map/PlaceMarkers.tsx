"use client";

import type { FeatureCollection, Point } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
import { categoryStyle } from "@/lib/categories";
import type { PlaceAlong } from "@/lib/places";

export const PLACE_POINTS_LAYER = "place-points";
export const PLACE_CLUSTERS_LAYER = "place-clusters";
export const PLACES_SOURCE = "places";

type Props = { places: PlaceAlong[]; highlightIds: string[] };
type PlaceProps = { id: string; name: string; color: string };

function toFeatures(places: PlaceAlong[]): FeatureCollection<Point, PlaceProps> {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: p.location },
      properties: { id: p.id, name: p.name, color: categoryStyle(p.category).color },
    })),
  };
}

/** Place markers coloured by category, clustered at low zoom, plus a ring on hovered/active places. */
export function PlaceMarkers({ places, highlightIds }: Props) {
  const highlighted = places.filter((p) => highlightIds.includes(p.id));

  return (
    <>
      <Source
        id={PLACES_SOURCE}
        type="geojson"
        data={toFeatures(places)}
        cluster
        clusterMaxZoom={9}
        clusterRadius={36}
      >
        <Layer
          id={PLACE_CLUSTERS_LAYER}
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": "#0f766e",
            "circle-opacity": 0.9,
            "circle-radius": ["step", ["get", "point_count"], 13, 10, 17, 50, 22],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          }}
        />
        <Layer
          id="place-cluster-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-allow-overlap": true,
          }}
          paint={{ "text-color": "#ffffff" }}
        />
        <Layer
          id={PLACE_POINTS_LAYER}
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": ["get", "color"],
            "circle-radius": 7,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          }}
        />
      </Source>
      <Source id="place-highlight" type="geojson" data={toFeatures(highlighted)}>
        <Layer
          id="place-highlight"
          type="circle"
          paint={{
            "circle-color": ["get", "color"],
            "circle-radius": 10,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#111827",
          }}
        />
      </Source>
    </>
  );
}
