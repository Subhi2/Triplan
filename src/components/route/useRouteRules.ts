"use client";

import { useEffect, useState } from "react";
import type { Timeline } from "@/lib/multiDay";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { RouteRulesResponse, RuleOnRoute } from "@/lib/roadRules";
import type { RouteOption } from "@/lib/trip";

export type RulesState =
  | { status: "idle" | "loading" | "error" }
  | { status: "ok"; rules: RuleOnRoute[]; timeline: Timeline | null };

/**
 * The road rules on the selected route (docs/02, "Road rules and permits"): the small route id
 * first, the geometry if the server no longer has the route. The planner checks them against the
 * start time itself, so changing the time asks for nothing.
 */
export function useRouteRules(route: RouteOption | null): RulesState {
  const [state, setState] = useState<RulesState>({ status: "idle" });
  useEffect(() => {
    if (!route) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const post = (body: object) =>
      fetch("/api/route/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    setState({ status: "loading" });
    (async () => {
      let res = ROUTE_ID_PATTERN.test(route.id) ? await post({ routeId: route.id }) : null;
      if (!res || res.status === 404) res = await post({ geometry: route.geometry });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RouteRulesResponse;
      setState({ status: "ok", rules: data.rules, timeline: data.timeline });
    })().catch(() => {
      if (!ctrl.signal.aborted) setState({ status: "error" });
    });
    return () => ctrl.abort();
  }, [route]);
  return state;
}
