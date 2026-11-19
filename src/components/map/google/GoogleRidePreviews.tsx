"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import type { MapRidePreview } from "../types";
import { MAP_COLORS_DARK } from "../mapColors";
import { useMapColors } from "../useMapColors";

/** Famous rides drawn faintly on the empty planner's map, as on the MapLibre map; a tap opens one. */
export function GoogleRidePreviews({
  rides,
  onSelect,
}: {
  rides: MapRidePreview[];
  onSelect: (slug: string) => void;
}) {
  const map = useMap();
  const colors = useMapColors();
  const dark = colors === MAP_COLORS_DARK;
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!map) return;
    const lines = rides.flatMap((r) => {
      const path = r.line.map(([lng, lat]) => ({ lng, lat }));
      // On the dark map a thin dark edge under the bright line makes it stand off the land.
      const edge = dark
        ? new google.maps.Polyline({
            map,
            path,
            strokeColor: MAP_COLORS_DARK.edge,
            strokeOpacity: 0.75,
            strokeWeight: 8,
            zIndex: 4,
            clickable: false,
          })
        : null;
      const line = new google.maps.Polyline({
        map,
        path,
        strokeColor: colors.brand,
        strokeOpacity: dark ? 1 : 0.85,
        strokeWeight: dark ? 4.5 : 4,
        zIndex: 5,
      });
      line.addListener("click", () => onSelectRef.current(r.slug));
      return edge ? [edge, line] : [line];
    });
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, rides, colors, dark]);

  return null;
}
