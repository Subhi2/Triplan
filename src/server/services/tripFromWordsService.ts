import { categoryStyle } from "@/lib/categories";
import type { LngLat } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/trip";
import type { TripUrlState, UrlStop } from "@/lib/tripUrl";
import type { TripIntent, TripIntentProvider, TripIntentResult } from "../providers/llm";
import { placesNearDb, type PlaceNearRow } from "./nearbyService";
import { suggestPlaces } from "./suggestService";

// Plan in plain words (docs/02-architecture.md): the model reads the sentence into a trip intent;
// this turns the intent into a planner trip with our own place search, and picks a destination
// from our places when the rider named only a start and the kind of trip.

/** Roads are about this much longer than the straight line. */
const ROAD_FACTOR = 1.3;
/** One way, when the rider gave no distance: a day's ride out, a little further for more days. */
const DEFAULT_ONE_WAY_KM = 150;
const KM_PER_EXTRA_DAY = 100;
/** A picked destination is at least this share of the range away, so the trip is a real ride. */
const MIN_SHARE = 0.4;

export type WordsOutcome =
  | {
      ok: true;
      trip: TripUrlState;
      summary: string;
      /** The destination we chose, when the rider did not name one. */
      picked: string | null;
      days: number | null;
      usage: { tokensIn: number; tokensOut: number };
    }
  | { ok: false; reason: "unreadable" | "no-start" | "no-destination"; message: string }
  | { ok: false; reason: "not-found"; message: string; name: string };

export interface WordsDeps {
  provider: TripIntentProvider;
  resolve(name: string, near?: LngLat): Promise<GeocodeResult | null>;
  placesNear(origin: LngLat, radiusM: number, categories: string[] | null): Promise<PlaceNearRow[]>;
}

export function defaultWordsDeps(provider: TripIntentProvider): WordsDeps {
  return {
    provider,
    resolve: async (name, near) =>
      (await suggestPlaces(name, near ? { near, zoom: 7 } : {}))[0] ?? null,
    placesNear: (origin, radiusM, categories) => placesNearDb(origin, radiusM, categories, 300),
  };
}

const stop = (g: GeocodeResult): UrlStop => ({ label: g.name, location: g.location });

/** How far out (km, one way) a trip may go. */
export function oneWayKm(intent: Pick<TripIntent, "maxOneWayKm" | "days">): number {
  if (intent.maxOneWayKm) return intent.maxOneWayKm;
  return DEFAULT_ONE_WAY_KM + Math.max(0, (intent.days ?? 1) - 1) * KM_PER_EXTRA_DAY;
}

/**
 * The best place to ride to: of the kinds asked for (or any), far enough to be a ride but within
 * range, in season when a month was named, the most worthwhile first.
 */
export function pickDestination(
  places: PlaceNearRow[],
  rangeKm: number,
  month: number | null,
): PlaceNearRow | null {
  const maxM = (rangeKm * 1000) / ROAD_FACTOR;
  const inSeason = (p: PlaceNearRow) =>
    month === null || p.bestMonths.length === 0 || p.bestMonths.includes(month);
  const score = (p: PlaceNearRow) =>
    p.priority + (p.ratingAvg ?? 0) / 5 + (inSeason(p) ? 1 : 0) + p.distanceM / maxM / 2;
  const candidates = places.filter((p) => p.distanceM <= maxM && inSeason(p));
  const far = candidates.filter((p) => p.distanceM >= maxM * MIN_SHARE);
  const pool = far.length > 0 ? far : candidates;
  return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export async function tripFromWords(
  text: string,
  near: LngLat | undefined,
  deps: WordsDeps,
): Promise<WordsOutcome> {
  const result: TripIntentResult | null = await deps.provider.parseTrip(text);
  if (!result) {
    return {
      ok: false,
      reason: "unreadable",
      message:
        "Couldn't read a trip from that. Try naming where you start and where you want to go.",
    };
  }
  const { intent } = result;
  if (!intent.from) {
    return { ok: false, reason: "no-start", message: 'Where do you start? Try "from Pune…".' };
  }
  const from = await deps.resolve(intent.from, near);
  if (!from) {
    return {
      ok: false,
      reason: "not-found",
      name: intent.from,
      message: `Couldn't find "${intent.from}" on the map.`,
    };
  }
  const via: UrlStop[] = [];
  for (const name of intent.via) {
    const hit = await deps.resolve(name, from.location);
    if (hit) via.push(stop(hit));
  }

  let to: UrlStop | null = null;
  let picked: string | null = null;
  if (intent.to) {
    const hit = await deps.resolve(intent.to, from.location);
    if (!hit) {
      return {
        ok: false,
        reason: "not-found",
        name: intent.to,
        message: `Couldn't find "${intent.to}" on the map.`,
      };
    }
    to = stop(hit);
  } else {
    const range = oneWayKm(intent);
    const places = await deps.placesNear(
      from.location,
      (range * 1000) / ROAD_FACTOR,
      intent.categories.length > 0 ? intent.categories : null,
    );
    const best = pickDestination(places, range, intent.month);
    if (!best) {
      return {
        ok: false,
        reason: "no-destination",
        message: "Couldn't find a place like that within reach. Try naming a destination.",
      };
    }
    to = { label: best.name, location: best.location };
    picked = `${best.name} (${categoryStyle(best.category).name.toLowerCase()})`;
  }

  const trip: TripUrlState = {
    from: stop(from),
    via,
    to,
    vehicle: intent.vehicle ?? "bike",
    corridorKm: 5,
    categories: intent.categories,
    maxDetourKm: null,
  };
  const kinds = intent.categories.map((c) => categoryStyle(c).name.toLowerCase()).join(", ");
  const summary = [
    `${trip.from!.label} → ${to.label}${via.length ? ` via ${via.map((v) => v.label).join(", ")}` : ""}`,
    trip.vehicle === "bike" ? "by bike" : "by car",
    intent.days ? `${intent.days} day${intent.days > 1 ? "s" : ""}` : null,
    kinds || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    ok: true,
    trip,
    summary,
    picked,
    days: intent.days,
    usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut },
  };
}
