import type { LineString } from "geojson";
import { formatDuration } from "@/lib/format";
import { placeRank } from "@/lib/places";
import { spreadStops } from "@/lib/roadBook";
import type { RuleOnRoute } from "@/lib/roadRules";
import { NOT_IN_DATA, type RouteAnswer } from "../providers/llm/askRoute";
import { placesAlong, toPlaceAlong, type PlaceAlongRow } from "./corridorService";
import { rulesAlongRoute } from "./roadRuleService";
import { servicesAlong, type ServiceAlongRow } from "./servicePointService";

// "Ask this route" (G12, C10): the route's own data as the only context, and an answer whose
// places and rules are checked against it. The question is never stored or logged.

/** Places given to the model: the best spread along the road. */
const CONTEXT_PLACES = 40;

export interface RouteFacts {
  distanceM: number;
  durationS: number;
  places: PlaceAlongRow[];
  rules: RuleOnRoute[];
  services: ServiceAlongRow[];
}

export async function routeFacts(
  geometry: LineString,
  distanceM: number,
  durationS: number,
): Promise<RouteFacts> {
  const [all, rules, services] = await Promise.all([
    placesAlong(geometry, 5_000, null),
    rulesAlongRoute(geometry).catch(() => []),
    servicesAlong(geometry, 3_000, [
      "hospital",
      "police",
      "atm",
      "tyre",
      "repair",
      "charging",
    ]).catch(() => []),
  ]);
  const fuel = await placesAlong(geometry, 2_000, ["fuel"]).catch(() => []);
  const places = spreadStops(
    all,
    distanceM / 1000,
    (p) => placeRank(toPlaceAlong(p)),
    CONTEXT_PLACES,
  );
  return { distanceM, durationS, places: [...places, ...fuel.slice(0, 40)], rules, services };
}

const km = (n: number) => `km ${Math.round(n)}`;

/** The facts as compact lines for the model. */
export function routeContext(f: RouteFacts): string {
  const lines = [
    `Route: ${Math.round(f.distanceM / 1000)} km, about ${formatDuration(f.durationS / 60)} riding.`,
    "Places (id | name | kind | km from start | detour km):",
    ...f.places.map(
      (p) =>
        `${p.id} | ${p.name} | ${p.category} | ${km(p.kmFromStart)} | ${(p.detourM / 1000).toFixed(1)}`,
    ),
    "Road rules (slug | rule | where | hours):",
    ...(f.rules.length
      ? f.rules.map(
          (r) =>
            `${r.slug} | ${r.title} | ${km(r.kmFrom)}-${km(r.kmTo)} | ${
              r.closedFrom && r.closedTo ? `closed ${r.closedFrom}-${r.closedTo}` : "see rule"
            }`,
        )
      : ["none on this route"]),
    "Safety stops and charging points (kind | name | km from start):",
    ...f.services
      .slice(0, 60)
      .map((s) => `${s.kind} | ${s.name ?? "unnamed"} | ${km(s.kmFromStart)}`),
  ];
  return lines.join("\n");
}

export interface CheckedAnswer {
  answer: string;
  places: { slug: string; name: string; kmFromStart: number }[];
  rules: { slug: string; title: string; link: string }[];
}

/** Keeps only the places and rules that are in the route's data; an answer naming none is kept. */
export function checkAnswer(a: RouteAnswer, f: RouteFacts): CheckedAnswer {
  const places = [...new Set(a.placeIds)]
    .map((id) => f.places.find((p) => p.id === id))
    .filter((p): p is PlaceAlongRow => Boolean(p && p.slug))
    .map((p) => ({ slug: p.slug, name: p.name, kmFromStart: Math.round(p.kmFromStart) }));
  const rules = [...new Set(a.ruleSlugs)]
    .map((slug) => f.rules.find((r) => r.slug === slug))
    .filter((r): r is RuleOnRoute => Boolean(r))
    .map((r) => ({ slug: r.slug, title: r.title, link: r.link }));
  const answer = a.answer.trim().slice(0, 800) || NOT_IN_DATA;
  return { answer, places, rules };
}
