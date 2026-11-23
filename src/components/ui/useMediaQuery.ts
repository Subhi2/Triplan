"use client";

import { useContext, useSyncExternalStore } from "react";
import { viewportKey } from "@/lib/viewport";
import { ViewportHintContext } from "./ViewportHint";

/**
 * Live result of a CSS media query. While the server renders and the page hydrates it answers
 * with the server's guess (ViewportHintProvider), so the first paint is already in the right
 * layout; without a guess, or for a query the guess does not cover, it answers false.
 */
export function useMediaQuery(query: string): boolean {
  const hint = useContext(ViewportHintContext);
  const key = viewportKey(query);
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => (hint && key ? hint[key] : false),
  );
}
