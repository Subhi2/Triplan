import type { LngLat } from "@/lib/geo";

export interface TownOnRoute {
  name: string;
  location: LngLat;
  kmFromStart: number;
  population: number | null; // from OSM when tagged
  kind: "city" | "town" | "village";
}

export interface LabelInput {
  distanceKm: number;
  towns: TownOnRoute[]; // towns passed, in road order, start and end towns already removed
}

/** Population, or a rough stand-in from the OSM place type when it is not tagged. */
export function townSize(t: Pick<TownOnRoute, "population" | "kind">): number {
  return t.population ?? (t.kind === "city" ? 100_000 : t.kind === "village" ? 1_000 : 10_000);
}

function largest(towns: TownOnRoute[]): TownOnRoute {
  return towns.reduce((best, t) => (townSize(t) > townSize(best) ? t : best));
}

function joinVias(names: string[]): string {
  const shown = names.slice(0, 2).join(", ");
  return names.length > 2 ? `via ${shown} +${names.length - 2}` : `via ${shown}`;
}

/**
 * Route card labels ("via Hassan, Sakleshpur").
 * - With via stops, the user's stops name the route.
 * - With alternatives, each route is named after towns no other route passes: the largest one
 *   (docs/02 "Suggesting via towns") and the last one before the destination, which is usually
 *   the stretch (the ghat) riders name a route by. Shown in road order.
 * - A lone route is named after its largest town.
 */
export function viaLabels(routes: LabelInput[], viaStops: string[]): string[] {
  if (viaStops.length > 0) return routes.map(() => joinVias(viaStops));

  return routes.map((route, i) => {
    const otherTowns = new Set(
      routes.flatMap((o, j) => (j === i ? [] : o.towns.map((t) => t.name))),
    );
    // Well-known villages name a route only when it passes no real town: otherwise the village
    // just past the ghat town would take its place ("via Hassan, Donigal").
    const towns = route.towns.some((t) => t.kind !== "village")
      ? route.towns.filter((t) => t.kind !== "village")
      : route.towns;
    const unique = towns.filter((t) => !otherTowns.has(t.name));

    let picks: TownOnRoute[] = [];
    if (routes.length > 1 && unique.length > 0) {
      picks = [...new Set([largest(unique), unique[unique.length - 1]!])].sort(
        (a, b) => a.kmFromStart - b.kmFromStart,
      );
    } else if (towns.length > 0) {
      picks = [largest(towns)];
    }
    if (picks.length > 0) return `via ${picks.map((t) => t.name).join(", ")}`;
    return routes.length > 1 ? `Route ${i + 1}` : "Direct route";
  });
}

/** The largest `count` towns a route passes, in road order ("main towns" on route cards). */
export function mainTowns(towns: TownOnRoute[], count = 5): TownOnRoute[] {
  return [...towns]
    .sort((a, b) => townSize(b) - townSize(a))
    .slice(0, count)
    .sort((a, b) => a.kmFromStart - b.kmFromStart);
}
