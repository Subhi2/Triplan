"use client";

import dynamic from "next/dynamic";
import { googleEnabled } from "@/lib/google";

// Both maps need the browser. The Google map when its key is set (Google photos and reviews may
// only be shown with it), else MapLibre (docs/02, "Google Maps Platform").
export const DynamicMapView = dynamic(
  () =>
    googleEnabled
      ? import("@/components/map/google/GoogleMapView").then((m) => m.GoogleMapView)
      : import("@/components/map/MapView").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-stone-200 dark:bg-stone-800" />,
  },
);
