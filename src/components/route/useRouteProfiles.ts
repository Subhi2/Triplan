"use client";

import { useEffect, useState } from "react";
import { elevationProfileSchema, type ElevationProfile } from "@/lib/elevation";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { RouteOption } from "@/lib/trip";

export type ProfileState =
  | { status: "loading" }
  | { status: "ok"; profile: ElevationProfile }
  | { status: "none" } // the terrain could not be read
  | { status: "error" };

async function loadProfile(route: RouteOption, signal: AbortSignal): Promise<ProfileState> {
  const post = (body: object) =>
    fetch("/api/route/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  let res = ROUTE_ID_PATTERN.test(route.id) ? await post({ routeId: route.id }) : null;
  if (!res || res.status === 404) res = await post({ geometry: route.geometry });
  if (!res.ok) return { status: "error" };
  const data = (await res.json()) as { profile?: unknown };
  if (data.profile === null) return { status: "none" };
  const parsed = elevationProfileSchema.safeParse(data.profile);
  return parsed.success ? { status: "ok", profile: parsed.data } : { status: "error" };
}

/**
 * The elevation profile of each route option, loaded after the routes show (the selected one
 * first). Sends the small route id first and falls back to the geometry if it has expired.
 */
export function useRouteProfiles(
  routes: RouteOption[],
  selectedId: string | null,
): Record<string, ProfileState> {
  const [profiles, setProfiles] = useState<Record<string, ProfileState>>({});
  const key = routes.map((r) => r.id).join();

  useEffect(() => {
    if (routes.length === 0) {
      setProfiles({});
      return;
    }
    const ctrl = new AbortController();
    setProfiles(Object.fromEntries(routes.map((r) => [r.id, { status: "loading" }])));
    const ordered = [...routes].sort(
      (a, b) => Number(b.id === selectedId) - Number(a.id === selectedId),
    );
    (async () => {
      for (const route of ordered) {
        const state = await loadProfile(route, ctrl.signal).catch((): ProfileState | null =>
          ctrl.signal.aborted ? null : { status: "error" },
        );
        if (!state || ctrl.signal.aborted) return;
        setProfiles((prev) => ({ ...prev, [route.id]: state }));
      }
    })();
    return () => ctrl.abort();
    // key stands for routes; the selected route only orders the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return profiles;
}
