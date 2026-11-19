"use client";

import { createContext, useContext } from "react";
import { MAP_COLORS, type MapPalette } from "./mapColors";

/**
 * The colours the MapLibre layers draw with: the light set on the light style, the dark set on the
 * dark style. MapView provides it; a map with its own style (a saved pack) keeps the light set.
 */
export const MapPaletteContext = createContext<MapPalette>(MAP_COLORS);

export const useMapPalette = () => useContext(MapPaletteContext);
