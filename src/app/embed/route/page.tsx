import type { Metadata } from "next";
import { EmbedCard } from "@/components/embed/EmbedCard";
import { formatDuration, formatKm } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import { placeRank } from "@/lib/places";
import { spreadStops } from "@/lib/roadBook";
import { siteUrl } from "@/lib/site";
import { parseTripUrl, serializeTripUrl } from "@/lib/tripUrl";
import { placesAlong, toPlaceAlong } from "@/server/services/corridorService";
import { getRouteResult } from "@/server/services/routeService";

// A planned trip as a card other sites can frame (G12, C8): /embed/route?<trip>&route=<id>.

export const metadata: Metadata = { robots: { index: false, follow: false } };

const STOPS = 5;

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function EmbedRoutePage({ searchParams }: { searchParams: Search }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const value of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, value);
  }
  const trip = parseTripUrl(params);
  const planner = `${siteUrl()}/?${serializeTripUrl(trip)}`;
  const route = await getRouteResult(params.get("route") ?? "").catch(() => null);
  if (!route || !trip.from || !trip.to) {
    return (
      <main className="flex min-h-screen flex-col gap-3 p-4">
        <p>This trip&apos;s route is no longer kept.</p>
        <a href={planner} target="_blank" rel="noopener" className="font-bold underline">
          Open it in the planner
        </a>
      </main>
    );
  }
  const totalKm = route.distanceM / 1000;
  const places = await placesAlong(route.geometry, 2_000, null).catch(() => []);
  const stops = spreadStops(places, totalKm, (p) => placeRank(toPlaceAlong(p)), STOPS);
  return (
    <EmbedCard
      title={`${trip.from.label} → ${trip.to.label}`}
      facts={[formatKm(route.distanceM), formatDuration(route.durationS / 60)]}
      line={route.geometry.coordinates as LngLat[]}
      stops={stops.map((p) => ({ name: p.name, kmFromStart: p.kmFromStart }))}
      href={planner}
    />
  );
}
