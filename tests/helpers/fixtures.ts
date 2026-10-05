import { readFileSync } from "node:fs";
import { parseOsrmResponse } from "@/server/providers/routing/osrm";
import type { RouteResult, RoutingProfile } from "@/server/providers/routing";

export type RouteFixture =
  | "bengaluru-kalasa"
  | "bengaluru-sakleshpur-kalasa"
  | "bengaluru-belur-chikkamagaluru-balehonnur-kalasa"
  | "bengaluru-samse"
  | "bengaluru-belur-samse"
  | "bengaluru-ooty"
  | "pune-goa"
  | "pollachi-valparai";

/** Raw OSRM response recorded by scripts/record-route-fixtures.ts. */
export function rawRouteFixture(name: RouteFixture): unknown {
  return JSON.parse(readFileSync(`tests/fixtures/osrm/${name}.json`, "utf8"));
}

export function routeFixture(name: RouteFixture, profile: RoutingProfile = "car"): RouteResult[] {
  return parseOsrmResponse(rawRouteFixture(name), profile);
}

export function jsonFixture(path: string): unknown {
  return JSON.parse(readFileSync(`tests/fixtures/${path}`, "utf8"));
}
