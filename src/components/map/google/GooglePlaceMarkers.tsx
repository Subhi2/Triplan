"use client";

import {
  MarkerClusterer,
  SuperClusterViewportAlgorithm,
  type Renderer,
} from "@googlemaps/markerclusterer";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import { categoryStyle } from "@/lib/categories";
import type { PlaceAlong } from "@/lib/places";

interface Props {
  places: PlaceAlong[];
  highlightIds: string[];
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/** Same as the MapLibre map: clusters up to zoom 9, about 36 px apart. */
const CLUSTER_MAX_ZOOM = 9;
const CLUSTER_RADIUS_PX = 60;

/**
 * A place dot: 14 px in its category colour, inside an invisible 40 px circle so a finger can
 * hit it. Centred on the place (Advanced Markers hang from their bottom centre by default).
 */
function dotElement(color: string, name: string): HTMLElement {
  const hit = document.createElement("div");
  hit.title = name;
  hit.style.cssText =
    "width:40px;height:40px;display:flex;align-items:center;justify-content:center;" +
    "transform:translateY(50%);cursor:pointer";
  const dot = document.createElement("div");
  dot.style.cssText = `width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #fff;box-sizing:content-box`;
  hit.appendChild(dot);
  return hit;
}

function setHighlighted(el: HTMLElement, on: boolean) {
  const dot = el.firstElementChild as HTMLElement | null;
  if (!dot) return;
  dot.style.width = dot.style.height = on ? "20px" : "14px";
  dot.style.border = on ? "3px solid #111827" : "2px solid #fff";
}

/** White with a teal ring: clusters stay readable without hiding the teal route. */
const renderer: Renderer = {
  render({ count, position }) {
    const size = count >= 50 ? 34 : count >= 10 ? 28 : 22;
    const el = document.createElement("div");
    el.textContent = String(count);
    el.style.cssText =
      `width:${size}px;height:${size}px;border-radius:9999px;background:rgba(255,255,255,.95);` +
      "border:2px solid #0f766e;color:#115e59;font:12px/1 sans-serif;display:flex;" +
      "align-items:center;justify-content:center;transform:translateY(50%);cursor:pointer";
    return new google.maps.marker.AdvancedMarkerElement({
      position,
      content: el,
      zIndex: 1000 + count,
    });
  },
};

/** Place markers coloured by category, clustered at low zoom, with a ring on hovered/active places. */
export function GooglePlaceMarkers({ places, highlightIds, onSelect, onHover }: Props) {
  const map = useMap();
  const markerLib = useMapsLibrary("marker");
  const elements = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef({ onSelect, onHover });
  useEffect(() => {
    callbacks.current = { onSelect, onHover };
  }, [onSelect, onHover]);

  useEffect(() => {
    // No places, no clusterer: its viewport algorithm fails on an empty list (it never builds its
    // index, then reads it).
    if (!map || !markerLib || places.length === 0) return;
    const els = elements.current;
    const markers = places.map((p) => {
      const content = dotElement(categoryStyle(p.category).color, p.name);
      content.addEventListener("mouseenter", () => callbacks.current.onHover(p.id));
      content.addEventListener("mouseleave", () => callbacks.current.onHover(null));
      els.set(p.id, content);
      const marker = new markerLib.AdvancedMarkerElement({
        position: { lng: p.location[0], lat: p.location[1] },
        content,
        title: p.name,
        gmpClickable: true,
      });
      marker.addEventListener("gmp-click", () => callbacks.current.onSelect(p.id));
      return marker;
    });
    // The viewport algorithm only places markers in view, so thousands stay cheap when zoomed in.
    let clusterer: MarkerClusterer | null = null;
    const start = () => {
      clusterer = new MarkerClusterer({
        map,
        markers,
        renderer,
        algorithm: new SuperClusterViewportAlgorithm({
          maxZoom: CLUSTER_MAX_ZOOM,
          radius: CLUSTER_RADIUS_PX,
          viewportPadding: 60,
        }),
      });
    };
    // A map started from bounds has no zoom until it first settles; clustering needs one.
    const waiting =
      map.getZoom() === undefined ? google.maps.event.addListenerOnce(map, "idle", start) : null;
    if (!waiting) start();
    return () => {
      waiting?.remove();
      clusterer?.clearMarkers();
      clusterer?.setMap(null);
      els.clear();
    };
  }, [map, markerLib, places]);

  const highlightKey = highlightIds.join();
  useEffect(() => {
    const els = elements.current;
    const on = new Set(highlightIds);
    for (const [id, el] of els) setHighlighted(el, on.has(id));
    // highlightKey stands for highlightIds; places re-creates the elements, so re-apply then too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey, places]);

  return null;
}
