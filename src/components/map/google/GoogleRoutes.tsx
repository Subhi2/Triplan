"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import type { LngLat } from "@/lib/geo";
import type { RouteOption } from "@/lib/trip";
import { linePart, useDrawIn } from "../useDrawIn";

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const latLngs = (coords: LngLat[]) => coords.map(([lng, lat]) => ({ lng, lat }));
const path = (r: RouteOption) => latLngs(r.geometry.coordinates as LngLat[]);

/** All route options: the selected one thick, the others thin and dashed (and clickable). */
export function GoogleRoutes({ routes, selectedId, onSelect }: Props) {
  const map = useMap();
  const selectedLines = useRef<google.maps.Polyline[]>([]);
  const selected = routes.find((r) => r.id === selectedId) ?? null;
  // The picked route draws itself along the road.
  const progress = useDrawIn(selected?.id ?? "");
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
        const casing = new google.maps.Polyline({
          map,
          path: path(r),
          strokeColor: "#ffffff",
          strokeWeight: 9,
          strokeOpacity: 1,
          zIndex: 20,
          clickable: false,
        });
        const line = new google.maps.Polyline({
          map,
          path: path(r),
          strokeColor: "#0f766e",
          strokeWeight: 5,
          strokeOpacity: 1,
          zIndex: 21,
          clickable: false,
        });
        selectedLines.current = [casing, line];
        lines.push(casing, line);
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
      selectedLines.current = [];
      for (const l of lines) {
        google.maps.event.clearInstanceListeners(l);
        l.setMap(null);
      }
    };
  }, [map, routes, selectedId]);

  useEffect(() => {
    if (!selected) return;
    const part = latLngs(linePart(selected.geometry.coordinates as LngLat[], progress));
    for (const l of selectedLines.current) l.setPath(part);
  }, [selected, progress]);

  return null;
}
