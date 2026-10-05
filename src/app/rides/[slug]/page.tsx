import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RideActions } from "@/components/ride/RideActions";
import { RouteSketch } from "@/components/ride/RouteSketch";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { RoadMixBar } from "@/components/trip/RoadMixBar";
import { categoryStyle, PLACE_LIST_CATEGORIES } from "@/lib/categories";
import { formatDuration, formatKm, formatMetres } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import { bestAlongRoute, detourLabel } from "@/lib/places";
import { monthRange, ridePlannerUrl, type Ride } from "@/lib/rides";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { placesAlong, toPlaceAlong } from "@/server/services/corridorService";
import { getRide } from "@/server/services/rideService";

// Rides change only when seeded again, their places when OpenStreetMap is imported again.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

/** Places listed on the page; the rest are a tap away in the planner. */
const LISTED = 15;

const loadRide = cache(async (slug: string) =>
  /^[a-z0-9-]{3,100}$/.test(slug) ? getRide(slug).catch(() => null) : null,
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await loadRide((await params).slug);
  if (!found) return { title: `Ride not found · ${SITE_NAME}` };
  const { ride } = found;
  const hairpins = ride.hairpins > 0 ? `, ${ride.hairpins} hairpins` : "";
  const description = `${formatKm(ride.distanceKm * 1000)}${hairpins}. ${ride.blurb}`;
  return {
    title: `${ride.title} · ${SITE_NAME}`,
    description,
    alternates: { canonical: `/rides/${ride.slug}` },
    // The share image comes from opengraph-image.tsx next to this page.
    openGraph: { siteName: SITE_NAME, type: "article", title: ride.title, description },
    twitter: { card: "summary_large_image", title: ride.title, description },
  };
}

/** schema.org TouristTrip: the ride with its stops in order. */
function rideJsonLd(ride: Ride) {
  return {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: ride.title,
    description: ride.blurb,
    url: `${siteUrl()}/rides/${ride.slug}`,
    touristType: ride.vehicle === "bike" ? "Motorcycle riders" : "Road trippers",
    itinerary: {
      "@type": "ItemList",
      numberOfItems: ride.stops.length,
      itemListElement: ride.stops.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Place",
          name: s.label,
          geo: { "@type": "GeoCoordinates", latitude: s.location[1], longitude: s.location[0] },
        },
      })),
    },
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-(--surface) px-3 py-2 dark:border-stone-700">
      <dt className="text-xs text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="tabular font-mono text-lg font-semibold">{value}</dd>
    </div>
  );
}

export default async function RidePage({ params }: Props) {
  const found = await loadRide((await params).slug);
  if (!found) notFound();
  const { ride, geometry } = found;
  const places = await placesAlong(geometry, 5_000, PLACE_LIST_CATEGORIES)
    .then((rows) => bestAlongRoute(rows.map(toPlaceAlong)))
    .catch(() => []);
  const line = geometry.coordinates as LngLat[];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <script
        type="application/ld+json"
        // JSON-LD must be inline; "<" is escaped so a name cannot close the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(rideJsonLd(ride)).replace(/</g, "\\u003c"),
        }}
      />
      <SiteNav current="/rides" />
      <header className="flex flex-col gap-2">
        <Link
          href="/rides"
          className="text-brand-dark inline-flex min-h-11 items-center self-start text-sm font-bold hover:underline md:min-h-0 dark:text-teal-300"
        >
          ← Famous rides
        </Link>
        <h1 className="font-display text-3xl leading-tight font-extrabold tracking-tight md:text-4xl">
          {ride.title}
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {ride.region} · {ride.vehicle === "bike" ? "Bike" : "Car"} · best{" "}
          {monthRange(ride.bestMonths)}
        </p>
        <p className="text-base">{ride.blurb}</p>
      </header>

      <RouteSketch line={line} className="bg-brand-tint h-56 w-full rounded-2xl dark:bg-teal-950" />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="Distance" value={formatKm(ride.distanceKm * 1000)} />
        <Fact label="Ride time" value={formatDuration(ride.durationMin)} />
        {ride.ascentM !== null && <Fact label="Climb" value={formatMetres(ride.ascentM)} />}
        {ride.hairpins > 0 ? (
          <Fact label="Hairpins" value={String(ride.hairpins)} />
        ) : (
          ride.profile && <Fact label="Highest" value={formatMetres(ride.profile.highest.m)} />
        )}
      </dl>

      <RideActions
        plannerUrl={ridePlannerUrl(ride)}
        storyUrl={`/og/story?ride=${ride.slug}`}
        title={ride.title}
        geometry={geometry}
        ghats={ride.roadMix?.ghats ?? []}
        hairpinKm={ride.curvature?.hairpinKm ?? []}
        profile={ride.profile}
        places={places}
      />

      {ride.roadMix && (
        <section aria-labelledby="roads" className="flex flex-col gap-1">
          <h2 id="roads" className="font-display text-xl font-bold tracking-tight">
            The roads
          </h2>
          <RoadMixBar mix={ride.roadMix} />
        </section>
      )}

      {ride.notes && (
        <aside className="bg-marigold-tint rounded-xl px-4 py-3 text-sm text-stone-900">
          <strong>Before you go:</strong> {ride.notes}
        </aside>
      )}

      <section aria-labelledby="the-way" className="flex flex-col gap-2">
        <h2 id="the-way" className="font-display text-xl font-bold tracking-tight">
          The way
        </h2>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {ride.stops.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="text-stone-400">
                  →
                </span>
              )}
              <span className="font-bold">{s.label}</span>
            </li>
          ))}
        </ol>
      </section>

      {places.length > 0 && (
        <section aria-labelledby="worth-stopping" className="flex flex-col gap-2">
          <h2 id="worth-stopping" className="font-display text-xl font-bold tracking-tight">
            Worth stopping for
          </h2>
          <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
            {places.slice(0, LISTED).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/place/${p.slug}`}
                  className="flex min-h-12 items-center gap-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-900"
                >
                  <span className="tabular w-16 shrink-0 font-mono text-sm text-stone-600 dark:text-stone-400">
                    km {Math.round(p.kmFromStart)}
                  </span>
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: categoryStyle(p.category).color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{p.name}</span>
                    <span className="text-xs text-stone-600 dark:text-stone-400">
                      {categoryStyle(p.category).name} · {detourLabel(p.detourKm)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {places.length > LISTED && (
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {places.length - LISTED} more in the planner.
            </p>
          )}
        </section>
      )}
      <SiteFooter />
    </main>
  );
}
