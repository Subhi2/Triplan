import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PlaceDetailView } from "@/components/place/PlaceDetailView";
import { categoryStyle } from "@/lib/categories";
import { PLACE_SLUG_PATTERN } from "@/lib/placeDetail";
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
  if (!place) return { title: "Place not found · Bike Travelling Guide" };
  const area = [place.district, place.state].filter(Boolean).join(", ");
  return {
    title: `${place.name} · Bike Travelling Guide`,
    description: `${categoryStyle(place.category).name}${area ? ` in ${area}` : ""}: best time to visit, best vehicle, what to carry, timings and reviews.`,
  };
}

export default async function PlacePage({ params }: Props) {
  const place = await loadPlace((await params).slug);
  if (!place) notFound();

  const destination = encodeStop({ label: place.name, location: place.location });
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <nav className="flex items-center justify-between gap-2 text-sm">
        <Link href="/" className="text-brand font-bold">
          Bike Travelling Guide
        </Link>
        <Link href="/trips" className="text-brand font-medium hover:underline">
          Saved trips
        </Link>
      </nav>
      <PlaceDetailView
        place={place}
        month={new Date().getMonth() + 1}
        headingLevel={1}
        actions={
          <Link
            href={`/?${new URLSearchParams({ to: destination }).toString()}`}
            className="bg-brand hover:bg-brand-dark rounded-md px-3 py-1.5 text-sm font-medium text-white"
          >
            Plan a ride here
          </Link>
        }
      />
    </main>
  );
}
