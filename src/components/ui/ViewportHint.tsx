"use client";

import { createContext, useEffect } from "react";
import {
  serializeViewportHint,
  VIEWPORT_COOKIE,
  VIEWPORT_QUERIES,
  type ViewportHint,
  type ViewportKey,
} from "@/lib/viewport";

/** The server's guess at the screen (src/server/viewportHint.ts), read by useMediaQuery. */
export const ViewportHintContext = createContext<ViewportHint | null>(null);

const ONE_YEAR_S = 365 * 24 * 60 * 60;

function writeCookie() {
  const hint = Object.fromEntries(
    Object.entries(VIEWPORT_QUERIES).map(([k, q]) => [k, window.matchMedia(q).matches]),
  ) as ViewportHint;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${VIEWPORT_COOKIE}=${serializeViewportHint(hint)}; Path=/; Max-Age=${ONE_YEAR_S}; SameSite=Lax${secure}`;
}

/**
 * Hands the server's guess to the layout hooks for the first render, so the page hydrates in the
 * layout the server drew (no jump from the phone layout on laptops), and writes this browser's
 * real answer to the cookie for the next visit: now, and when the window crosses a breakpoint.
 * The cookie holds only which layout fits ("md.lg"); nothing else about the device.
 */
export function ViewportHintProvider({
  hint,
  children,
}: {
  hint: ViewportHint;
  children: React.ReactNode;
}) {
  useEffect(() => {
    writeCookie();
    const lists = (Object.keys(VIEWPORT_QUERIES) as ViewportKey[]).map((k) =>
      window.matchMedia(VIEWPORT_QUERIES[k]),
    );
    for (const l of lists) l.addEventListener("change", writeCookie);
    return () => {
      for (const l of lists) l.removeEventListener("change", writeCookie);
    };
  }, []);
  return <ViewportHintContext.Provider value={hint}>{children}</ViewportHintContext.Provider>;
}
