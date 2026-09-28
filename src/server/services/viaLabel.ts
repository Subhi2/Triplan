import type { LngLat } from "@/lib/geo";

export interface TownOnRoute {
  name: string;
  location: LngLat;
  kmFromStart: number;
}

export interface LabelInput {
  distanceKm: number;
  towns: TownOnRoute[]; // towns passed, in road order, start and end towns already removed
}

function joinVias(names: string[]): string {
  const shown = names.slice(0, 2).join(", ");
  return names.length > 2 ? `via ${shown} +${names.length - 2}` : `via ${shown}`;
}

/**
 * Route card labels ("via Hassan, Sakleshpur").
 * - With via stops, the user's stops name the route.
 * - With alternatives, each route is named after its last two towns that no other route passes.
 *   Routes out of a city often split somewhere unremarkable; riders name a route after the
 *   stretch near the destination (the ghat they climb), which is where the last unique towns are.
 * - A lone route uses its most central town.
 */
export function viaLabels(routes: LabelInput[], viaStops: string[]): string[] {
  if (viaStops.length > 0) return routes.map(() => joinVias(viaStops));

  return routes.map((route, i) => {
    const otherTowns = new Set(
      routes.flatMap((o, j) => (j === i ? [] : o.towns.map((t) => t.name))),
    );
    const unique = route.towns.filter((t) => !otherTowns.has(t.name));

    let picks: TownOnRoute[] = [];
    if (routes.length > 1 && unique.length > 0) {
      picks = unique.slice(-2);
    } else if (route.towns.length > 0) {
      const mid = route.distanceKm / 2;
      picks = [
        route.towns.reduce((best, t) =>
          Math.abs(t.kmFromStart - mid) < Math.abs(best.kmFromStart - mid) ? t : best,
        ),
      ];
    }
    if (picks.length > 0) return `via ${picks.map((t) => t.name).join(", ")}`;
    return routes.length > 1 ? `Route ${i + 1}` : "Direct route";
  });
}
