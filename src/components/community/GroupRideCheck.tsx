"use client";

import { useEffect, useState } from "react";
import { useRouteAlerts } from "@/components/route/useRouteAlerts";
import { useRouteRules } from "@/components/route/useRouteRules";
import { RideCheck } from "@/components/trip/RideCheck";
import { useMyBike } from "@/components/trip/useMyBike";
import { formatRideTime } from "@/lib/community/shareText";
import { toDateTimeLocal } from "@/lib/rideCheck";
import type { SavedTrip } from "@/lib/savedTrip";
import type { RouteOption } from "@/lib/trip";

type Loaded =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; trip: SavedTrip; route: RouteOption };

/**
 * The ride check for a hosted ride (G6): its trip's route at the ride's own start time, so every
 * rider sees the night bans, official alerts, sunset and fuel gaps for that day without planning
 * it again. The trip is public by its link, as on the ride page; nothing here needs a seat.
 */
export function GroupRideCheck({ tripId, startsAt }: { tripId: string; startsAt: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const tripRes = await fetch(`/api/trips/${tripId}`, { signal: ctrl.signal });
      if (!tripRes.ok) throw new Error(`HTTP ${tripRes.status}`);
      const { trip } = (await tripRes.json()) as { trip: SavedTrip };
      const stops = trip.stops.map((s) => ({ label: s.label, location: s.location }));
      const routeRes = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stops, vehicle: trip.vehicle }),
        signal: ctrl.signal,
      });
      if (!routeRes.ok) throw new Error(`HTTP ${routeRes.status}`);
      const { routes } = (await routeRes.json()) as { routes: RouteOption[] };
      // The road the host picked when saving the trip, else the first one offered.
      const route =
        routes.find((r) => r.id === trip.routeId) ??
        routes.find((r) => trip.viaLabel !== null && r.viaLabel === trip.viaLabel) ??
        routes[0];
      if (!route) throw new Error("No route");
      setLoaded({ status: "ok", trip, route });
    })().catch(() => {
      if (!ctrl.signal.aborted) setLoaded({ status: "error" });
    });
    return () => ctrl.abort();
  }, [tripId]);

  const route = loaded.status === "ok" ? loaded.route : null;
  const alerts = useRouteAlerts(route);
  const rules = useRouteRules(route);
  // The rider's own bike (their account), for the trip's vehicle; no link to keep it in here.
  const { bike, setBike, kept } = useMyBike(
    loaded.status === "ok" ? loaded.trip.vehicle : "bike",
    null,
  );

  if (loaded.status === "loading") {
    return <div aria-hidden className="shimmer h-14 rounded-2xl" />;
  }
  if (loaded.status === "error") {
    return (
      <p className="text-sm text-stone-600 dark:text-stone-400">
        The ride check could not be loaded. The planner link above shows the same road.
      </p>
    );
  }

  const from = loaded.trip.stops[0]!;
  const to = loaded.trip.stops.at(-1)!;
  const departure = toDateTimeLocal(new Date(startsAt));
  return (
    <RideCheck
      route={loaded.route}
      vehicle={loaded.trip.vehicle}
      from={{ label: from.label, location: from.location }}
      to={{ label: to.label, location: to.location }}
      departure={departure}
      onDepartureChange={() => {}}
      fixedDeparture={`${formatRideTime(startsAt)} (the ride's start)`}
      myBike={bike}
      onMyBikeChange={setBike}
      myBikeKept={kept}
      alerts={alerts}
      rules={rules}
    />
  );
}
