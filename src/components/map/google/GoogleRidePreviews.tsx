"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import type { MapRidePreview } from "../types";
import { MAP_COLORS } from "../mapColors";

/** Famous rides drawn faintly on the empty planner's map, as on the MapLibre map; a tap opens one. */
export function GoogleRidePreviews({
  rides,
  onSelect,
}: {
  rides: MapRidePreview[];
  onSelect: (slug: string) => void;
}) {
  const map = useMap();
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!map) return;
    const lines = rides.map((r) => {
      const line = new google.maps.Polyline({
        map,
        path: r.line.map(([lng, lat]) => ({ lng, lat })),
        strokeColor: MAP_COLORS.brand,
        strokeOpacity: 0.85,
        strokeWeight: 4,
        zIndex: 5,
      });
      line.addListener("click", () => onSelectRef.current(r.slug));
      return line;
    });
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, rides]);

  return null;
}
