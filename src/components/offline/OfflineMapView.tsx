"use client";

import { useMemo } from "react";
import { MapView } from "@/components/map/MapView";
import type { MapViewProps } from "@/components/map/types";
import { offlineStyle, registerPackProtocols } from "./offlineStyle";

/** The map of a saved pack: MapLibre over the pack's tiles and glyphs, nothing from the network. */
export function OfflineMapView({ maxZoom, ...props }: MapViewProps & { maxZoom: number }) {
  registerPackProtocols();
  const style = useMemo(() => offlineStyle(maxZoom), [maxZoom]);
  return <MapView {...props} mapStyle={style} />;
}
