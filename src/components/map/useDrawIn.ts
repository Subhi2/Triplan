"use client";

import { useEffect, useState } from "react";
import type { LngLat } from "@/lib/geo";

/** How long the selected route takes to draw itself along the road. */
const DRAW_MS = 1200;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * 0 → 1 over DRAW_MS each time `key` changes, so a newly picked route draws itself in
 * (docs/08-design.md). Straight to 1 when the rider asked for reduced motion.
 */
export function useDrawIn(key: string): number {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (!key || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DRAW_MS);
      setProgress(easeOut(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setProgress(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key]);

  return progress;
}

/** The first `progress` share of a line (by point count; at least two points). */
export function linePart(coords: LngLat[], progress: number): LngLat[] {
  if (progress >= 1 || coords.length < 3) return coords;
  return coords.slice(0, Math.max(2, Math.ceil(coords.length * progress)));
}
