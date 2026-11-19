"use client";

import { useEffect, useState } from "react";
import { MAP_COLORS, MAP_COLORS_DARK, type MapPalette } from "./mapColors";

/**
 * The site's theme (data-theme on <html>), following the toggle. Only used where the browser
 * renders the map, so the page's theme is known on the first render.
 */
export function useMapTheme(): "light" | "dark" {
  const read = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [theme, setTheme] = useState<"light" | "dark">(read);
  useEffect(() => {
    const watch = new MutationObserver(() => setTheme(read()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  return theme;
}

/** The colours for lines and pins on the Google map, which turns dark with the site. */
export function useMapColors(): MapPalette {
  return useMapTheme() === "dark" ? MAP_COLORS_DARK : MAP_COLORS;
}
