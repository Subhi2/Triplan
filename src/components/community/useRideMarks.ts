"use client";

import { useCallback, useEffect, useState } from "react";
import type { RideMark, RideMarkInput } from "@/lib/community/schemas";
import { useRider } from "./RiderGate";
import { communityFetch } from "./riderSession";

/**
 * The signed-in rider's bucket list of famous rides, by ride slug. Empty until the rider has a
 * nickname (no account, no marks). Used by the ride page and the bucket-list page.
 */
export function useRideMarks() {
  const { me, loading: riderLoading } = useRider();
  const [marks, setMarks] = useState<Record<string, RideMark>>({});
  const [loading, setLoading] = useState(true);
  const riderId = me?.id ?? null;

  useEffect(() => {
    if (riderLoading) return;
    if (!riderId) {
      setMarks({});
      setLoading(false);
      return;
    }
    let live = true;
    communityFetch<{ marks: RideMark[] }>("/api/me/rides")
      .then((d) => live && setMarks(Object.fromEntries(d.marks.map((m) => [m.rideSlug, m]))))
      .catch(() => live && setMarks({}))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [riderId, riderLoading]);

  const save = useCallback(
    async (input: Partial<RideMarkInput> & Pick<RideMarkInput, "rideSlug" | "status">) => {
      const { mark } = await communityFetch<{ mark: RideMark }>("/api/me/rides", {
        method: "PUT",
        body: { doneOn: null, note: "", ...input },
      });
      setMarks((m) => ({ ...m, [mark.rideSlug]: mark }));
      return mark;
    },
    [],
  );

  const remove = useCallback(async (rideSlug: string) => {
    await communityFetch<{ removed: boolean }>("/api/me/rides", {
      method: "DELETE",
      body: { rideSlug },
    });
    setMarks((m) => {
      const next = { ...m };
      delete next[rideSlug];
      return next;
    });
  }, []);

  return { me, marks, loading: loading || riderLoading, save, remove };
}
