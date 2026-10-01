"use client";

import dynamic from "next/dynamic";

/** The 3D ride preview, loaded only when opened: MapLibre and the terrain stay out of the page. */
export const DynamicRidePreview = dynamic(() => import("./RidePreview"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-50 bg-stone-900" aria-hidden />,
});
