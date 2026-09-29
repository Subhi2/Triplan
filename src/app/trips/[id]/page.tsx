import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { Planner } from "@/components/trip/Planner";
import { tripIdSchema } from "@/lib/savedTrip";
import { getTrip } from "@/server/services/tripService";

// Anyone may update a trip, so always show the latest version.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const loadTrip = cache(async (id: string) =>
  tripIdSchema.safeParse(id).success ? getTrip(id) : null,
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const trip = await loadTrip((await params).id);
  return { title: `${trip?.title ?? "Trip not found"} · Bike Travelling Guide` };
}

/** A saved trip's own link: the planner, opened with the trip. */
export default async function TripPage({ params }: Props) {
  const trip = await loadTrip((await params).id);
  if (!trip) notFound();
  return (
    // useSearchParams in Planner needs a Suspense boundary.
    <Suspense>
      <Planner savedTrip={trip} />
    </Suspense>
  );
}
