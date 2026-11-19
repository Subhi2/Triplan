"use client";

import { useEffect, useState } from "react";
import { MAP_COLORS, MAP_COLORS_DARK, type MapPalette } from "./mapColors";

/**
 * The colours for lines and pins on the Google map, which turns dark with the site (data-theme on
 * <html>). The MapLibre map keeps its light style in both themes and so keeps MAP_COLORS. Only
 * used where the browser renders the map, so the page's theme is known on the first render.
 */
export function useMapColors(): MapPalette {
  const read = () =>
    document.documentElement.dataset.theme === "dark" ? MAP_COLORS_DARK : MAP_COLORS;
  const [colors, setColors] = useState<MapPalette>(read);
  useEffect(() => {
    const watch = new MutationObserver(() => setColors(read()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  return colors;
}
