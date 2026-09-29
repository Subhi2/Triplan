"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { bounds, frameKey, framePoints, type MapViewProps } from "../types";

const PADDING = 48;
/** Framing a route never zooms in closer than this. */
const MAX_FRAME_ZOOM = 12;

/** Frames the routes (or stops) when they change, and brings the active place into view. */
export function useGoogleFraming(props: MapViewProps) {
  const map = useMap();
  const { routes, stops, places, activePlaceId } = props;

  const frame = frameKey(routes, stops);
  useEffect(() => {
    if (!map) return;
    const points = framePoints(routes, stops);
    const b = bounds(points);
    if (!b) return;
    if (points.length === 1) {
      map.panTo({ lng: points[0]![0], lat: points[0]![1] });
      map.setZoom(10);
      return;
    }
    const [[west, south], [east, north]] = b;
    map.fitBounds({ west, south, east, north }, PADDING);
    google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > MAX_FRAME_ZOOM) map.setZoom(MAX_FRAME_ZOOM);
    });
    // frame captures the inputs; re-running on every render would fight the user's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, frame]);

  // Pan to the active place if it is off screen (e.g. picked from the list).
  useEffect(() => {
    const place = places.find((p) => p.id === activePlaceId);
    if (!map || !place) return;
    const at = { lng: place.location[0], lat: place.location[1] };
    if (!map.getBounds()?.contains(at)) {
      map.panTo(at);
      if ((map.getZoom() ?? 0) < 10) map.setZoom(10);
    }
    // Only when the active place changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activePlaceId]);
}
