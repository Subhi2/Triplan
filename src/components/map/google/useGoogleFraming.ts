"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import type { LngLat } from "@/lib/geo";
import { bounds, frameKey, framePoints, INDIA_BOUNDS, type MapViewProps } from "../types";

const PADDING = 48;
/** Framing a route never zooms in closer than this. */
const MAX_FRAME_ZOOM = 12;

/** What the camera was last asked to show: a box, or one point at zoom 10. */
type Framing = { box: [LngLat, LngLat]; padding: number } | { point: LngLat };

/**
 * Frames the routes (or the given frame, or stops) when they change, and brings the active place
 * into view. When the map's box changes size (the phone layout grows the map from a strip under
 * the form to the whole screen behind the sheet), the framing is applied again, until the rider
 * touches the map.
 */
export function useGoogleFraming(props: MapViewProps) {
  const map = useMap();
  // With reduced motion, the camera jumps instead of panning (docs/08, "Motion").
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const moveTo = (at: google.maps.LatLngLiteral) =>
    reduceMotion ? map?.setCenter(at) : map?.panTo(at);
  const { routes, stops, places, activePlaceId, topInset = 0 } = props;
  // The map starts on India (the Map's defaultBounds).
  const framing = useRef<Framing>({ box: INDIA_BOUNDS, padding: 16 });
  const touched = useRef(false);
  const topInsetRef = useRef(topInset);
  topInsetRef.current = topInset;

  function apply(f: Framing, animate: boolean) {
    if (!map) return;
    if ("point" in f) {
      const at = { lng: f.point[0], lat: f.point[1] };
      if (animate) moveTo(at);
      else map.setCenter(at);
      map.setZoom(10);
      return;
    }
    const [[west, south], [east, north]] = f.box;
    map.fitBounds(
      { west, south, east, north },
      { top: f.padding + topInsetRef.current, left: f.padding, right: f.padding, bottom: f.padding },
    );
    google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > MAX_FRAME_ZOOM) map.setZoom(MAX_FRAME_ZOOM);
    });
  }

  const frame = frameKey(routes, stops, props.frame);
  useEffect(() => {
    if (!map) return;
    const points = framePoints(routes, stops, props.frame);
    const b = bounds(points);
    if (!b) return;
    framing.current = points.length === 1 ? { point: points[0]! } : { box: b, padding: PADDING };
    touched.current = false;
    apply(framing.current, true);
    // frame captures the inputs; re-running on every render would fight the user's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, frame]);

  // Frame again when the map's box changes size, unless the rider has moved the map since.
  useEffect(() => {
    if (!map) return;
    const div = map.getDiv();
    const onTouch = () => {
      touched.current = true;
    };
    div.addEventListener("pointerdown", onTouch);
    div.addEventListener("wheel", onTouch, { passive: true });
    let size = `${div.clientWidth}x${div.clientHeight}`;
    let pending = 0;
    const observer = new ResizeObserver(() => {
      const next = `${div.clientWidth}x${div.clientHeight}`;
      if (next === size || div.clientWidth === 0 || div.clientHeight === 0) return;
      size = next;
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        if (!touched.current) apply(framing.current, false);
      });
    });
    observer.observe(div);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending);
      div.removeEventListener("pointerdown", onTouch);
      div.removeEventListener("wheel", onTouch);
    };
    // apply reads its inputs from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Pan to the active place if it is off screen (e.g. picked from the list).
  useEffect(() => {
    const place = places.find((p) => p.id === activePlaceId);
    if (!map || !place) return;
    const at = { lng: place.location[0], lat: place.location[1] };
    if (!map.getBounds()?.contains(at)) {
      moveTo(at);
      if ((map.getZoom() ?? 0) < 10) map.setZoom(10);
    }
    // Only when the active place changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activePlaceId]);
}
