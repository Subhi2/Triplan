import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RideRoom } from "@/components/ride/RideRoom";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import { ROOM_ID_PATTERN } from "@/lib/rideRoom";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Ride together · ${SITE_NAME}`,
  // A group's own room: nothing here for search engines.
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ room: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** /ride/<room>?route=<route id>&title=…&follow=1: a ride-together room (docs/02). */
export default async function RidePage({ params, searchParams }: PageProps) {
  const { room } = await params;
  if (!ROOM_ID_PATTERN.test(room)) notFound();
  const q = await searchParams;
  const route = one(q.route);
  const title = one(q.title)?.trim().slice(0, 120) || null;
  return (
    <RideRoom
      room={room}
      routeId={route && ROUTE_ID_PATTERN.test(route) ? route : null}
      title={title}
      follow={one(q.follow) === "1"}
    />
  );
}
