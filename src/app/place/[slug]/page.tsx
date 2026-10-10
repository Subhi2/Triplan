import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PlaceDetailView } from "@/components/place/PlaceDetailView";
import { ShareButtons } from "@/components/site/ShareButtons";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { categoryStyle } from "@/lib/categories";
import { PLACE_SLUG_PATTERN, type PlaceDetail } from "@/lib/placeDetail";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { encodeStop } from "@/lib/tripUrl";
import { getPlaceDetail } from "@/server/services/placeDetailService";

// Place pages are generated on first visit and refreshed at most hourly (docs/02, "Caching").
export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

const loadPlace = cache(async (slug: string) =>
  PLACE_SLUG_PATTERN.test(slug) && slug.length <= 200 ? getPlaceDetail(slug) : null,
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const place = await loadPlace((await params).slug);
  if (!place) return { title: `Place not found · ${SITE_NAME}` };
  const area = [place.district, place.state].filter(Boolean).join(", ");
  const title = area ? `${place.name}, ${area}` : place.name;
  const description = `${categoryStyle(place.category).name}${area ? ` in ${area}` : ""}: best time to visit, best vehicle, what to carry, timings and reviews.`;
  return {
    title: `${title} · ${SITE_NAME}`,
    description,
    alternates: { canonical: `/place/${place.slug}` },
    // The share image comes from opengraph-image.tsx next to this page.
    openGraph: { siteName: SITE_NAME, type: "website", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** schema.org data so search engines can show the place with its location and photo. */
function placeJsonLd(place: PlaceDetail) {
  const photo = place.media[0];
  return {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: place.name,
    url: `${siteUrl()}/place/${place.slug}`,
    ...(place.description && { description: place.description }),
    geo: { "@type": "GeoCoordinates", latitude: place.location[1], longitude: place.location[0] },
    ...((place.district || place.state) && {
      address: {
        "@type": "PostalAddress",
        ...(place.district && { addressLocality: place.district }),
        ...(place.state && { addressRegion: place.state }),
        addressCountry: "IN",
      },
    }),
    ...(photo && { image: photo.url }),
    ...(place.rating !== null &&
      place.ratingCount > 0 && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: place.rating,
          ratingCount: place.ratingCount,
        },
      }),
    ...(place.osm.wikipediaUrl && { sameAs: [place.osm.wikipediaUrl] }),
  };
}

const secondary =
  "text-brand-dark inline-flex min-h-11 items-center text-sm font-bold hover:underline md:min-h-0 dark:text-teal-300";

export default async function PlacePage({ params }: Props) {
  const place = await loadPlace((await params).slug);
  if (!place) notFound();

  const destination = encodeStop({ label: place.name, location: place.location });
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <script
        type="application/ld+json"
        // JSON-LD must be inline; "<" is escaped so a place name cannot close the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(placeJsonLd(place)).replace(/</g, "\\u003c"),
        }}
      />
      <SiteNav />
      <PlaceDetailView
        place={place}
        month={new Date().getMonth() + 1}
        headingLevel={1}
        actions={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/?${new URLSearchParams({ to: destination }).toString()}`}
              className="bg-brand hover:bg-brand-dark inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-white md:min-h-0 md:py-1.5"
            >
              Plan a ride here
            </Link>
            <Link
              href={`/nearby?${new URLSearchParams({ at: destination }).toString()}`}
              className={secondary}
            >
              What&apos;s near here
            </Link>
            <ShareButtons
              title={place.name}
              text={`${place.name}: when to go, how to get there, what to carry`}
              linkClassName={secondary}
            />
          </div>
        }
      />
      <SiteFooter />
    </main>
  );
}
