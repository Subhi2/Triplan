import type { LineString } from "geojson";
import { PLACE_LIST_CATEGORIES } from "@/lib/categories";
import { routeCurvature } from "@/lib/curvature";
import type { ElevationProfile } from "@/lib/elevation";
import { formatDuration, formatKm, formatMetres } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import { tripHeadline } from "@/lib/site";
import { storyStops, thinLine } from "@/lib/story";
import type { UrlStop } from "@/lib/tripUrl";
import type { Vehicle } from "@/lib/trip";
import { placesAlong, toPlaceAlong } from "./corridorService";
import { routeProfile } from "./elevationService";
import { roadMix } from "./roadMix";
import { getRide } from "./rideService";
import { getRouteResult } from "./routeService";
import { getTrip, getTripLine } from "./tripService";

/** Everything a ride story poster shows. */
export interface StoryData {
  headline: string;
  vehicle: Vehicle;
  facts: { label: string; value: string }[];
  line: LngLat[];
  stops: LngLat[];
  ghats: [number, number][];
  profile: ElevationProfile | null;
  topStops: { km: number; name: string; category: string }[];
}

/** Places within this corridor count for the poster's top stops. */
const STORY_CORRIDOR_M = 5_000;
const LINE_POINTS = 1_500;

async function build(
  geometry: LineString,
  routeId: string | null,
  stops: UrlStop[],
  vehicle: Vehicle,
  distanceKm: number,
  durationMin: number | null,
  ghats: [number, number][],
  knownProfile?: ElevationProfile | null,
  /** A famous ride's stored count, so the poster matches its page. */
  knownHairpins?: number,
): Promise<StoryData> {
  const coords = geometry.coordinates as LngLat[];
  const [profile, places] = await Promise.all([
    knownProfile !== undefined
      ? Promise.resolve(knownProfile)
      : routeProfile(geometry, routeId).catch(() => null),
    placesAlong(geometry, STORY_CORRIDOR_M, PLACE_LIST_CATEGORIES)
      .then((rows) => rows.map(toPlaceAlong))
      .catch(() => []),
  ]);
  const hairpins =
    knownHairpins ??
    routeCurvature(
      geometry,
      stops.map((s) => s.location),
    ).hairpins;
  const facts = [
    { label: "Distance", value: formatKm(distanceKm * 1000) },
    durationMin !== null && { label: "Ride time", value: formatDuration(durationMin) },
    profile && { label: "Climb", value: formatMetres(profile.ascentM) },
    hairpins > 0
      ? { label: "Hairpins", value: String(hairpins) }
      : profile && { label: "Highest", value: formatMetres(profile.highest.m) },
  ].filter((f): f is { label: string; value: string } => Boolean(f));
  return {
    headline: tripHeadline(stops.map((s) => s.label)),
    vehicle,
    facts,
    line: thinLine(coords, LINE_POINTS),
    stops: stops.map((s) => s.location),
    ghats,
    profile,
    topStops: storyStops(places, distanceKm).map((p) => ({
      km: Math.round(p.kmFromStart),
      name: p.name,
      category: p.category,
    })),
  };
}

/** A story for a planner route still in route_cache; null once it has expired. */
export async function storyForRoute(
  routeId: string,
  stops: UrlStop[],
  vehicle: Vehicle,
): Promise<StoryData | null> {
  const route = await getRouteResult(routeId);
  if (!route || stops.length < 2) return null;
  return build(
    route.geometry,
    routeId,
    stops,
    vehicle,
    route.distanceM / 1000,
    Math.round(route.durationS / 60),
    roadMix(route)?.ghats ?? [],
  );
}

/** A story for a saved trip: its stored route, or the cached routing result when still there. */
export async function storyForTrip(id: string): Promise<StoryData | null> {
  const trip = await getTrip(id);
  if (!trip || trip.stops.length < 2) return null;
  const cached = trip.routeId ? await getRouteResult(trip.routeId) : null;
  const geometry: LineString = cached?.geometry ?? {
    type: "LineString",
    coordinates: await getTripLine(id),
  };
  if (geometry.coordinates.length < 2) return null;
  return build(
    geometry,
    cached ? trip.routeId : null,
    trip.stops,
    trip.vehicle,
    trip.distanceKm ?? (cached ? cached.distanceM / 1000 : 0),
    trip.durationMin,
    cached ? (roadMix(cached)?.ghats ?? []) : [],
  );
}

/** A story for a famous ride, from what was stored when it was seeded. */
export async function storyForRide(slug: string): Promise<StoryData | null> {
  const found = await getRide(slug);
  if (!found) return null;
  const { ride, geometry } = found;
  const story = await build(
    geometry,
    null,
    ride.stops,
    ride.vehicle,
    ride.distanceKm,
    ride.durationMin,
    ride.roadMix?.ghats ?? [],
    ride.profile,
    ride.hairpins,
  );
  return { ...story, headline: ride.title };
}
