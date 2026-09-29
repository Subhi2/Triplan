"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import type { LngLat } from "@/lib/geo";
import type { RouteOption } from "@/lib/trip";

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const path = (r: RouteOption) =>
  (r.geometry.coordinates as LngLat[]).map(([lng, lat]) => ({ lng, lat }));

/** All route options: the selected one thick, the others thin and dashed (and clickable). */
export function GoogleRoutes({ routes, selectedId, onSelect }: Props) {
  const map = useMap();
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!map) return;
    const lines: google.maps.Polyline[] = [];
    for (const r of routes) {
      if (r.id === selectedId) {
        // A white casing under the teal line, as on the MapLibre map.
        lines.push(
          new google.maps.Polyline({
            map,
            path: path(r),
            strokeColor: "#ffffff",
            strokeWeight: 9,
            strokeOpacity: 1,
            zIndex: 20,
            clickable: false,
          }),
          new google.maps.Polyline({
            map,
            path: path(r),
            strokeColor: "#0f766e",
            strokeWeight: 5,
            strokeOpacity: 1,
            zIndex: 21,
            clickable: false,
          }),
        );
      } else {
        // Dashes are repeated symbols on an invisible line (Polylines have no dash style).
        const line = new google.maps.Polyline({
          map,
          path: path(r),
          strokeOpacity: 0,
          strokeWeight: 12, // the invisible line is the click target
          zIndex: 10,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#64748b", scale: 3 },
              offset: "0",
              repeat: "12px",
            },
          ],
        });
        line.addListener("click", () => onSelectRef.current(r.id));
        lines.push(line);
      }
    }
    return () => {
      for (const l of lines) {
        google.maps.event.clearInstanceListeners(l);
        l.setMap(null);
      }
    };
  }, [map, routes, selectedId]);

  return null;
}
