"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mayHaveRider } from "@/components/community/riderSession";
import { hasBike, myBikeSchema, NO_BIKE, type MyBike } from "@/lib/myBike";
import type { Vehicle } from "@/lib/trip";

/** Where the bike is kept: with the rider's account, or only in this trip's link. */
export type BikeKept = "account" | "link";

/** Waits this long after the last change before saving to the account (30 writes an hour). */
const SAVE_AFTER_MS = 1_500;

// Where the ride check and trip cost kept these before "My bike" (browser storage).
const LEGACY_KEYS = (v: Vehicle) => ({
  range: `ride-check-range-${v}`,
  mileage: `trip-cost-mileage-${v}`,
  price: `trip-cost-price-${v}`,
});

// What takeLegacy found, per vehicle, for the life of the page: the keys are gone after the
// first read (React runs effects twice in development, and the second read must not lose them).
const legacyTaken = new Map<Vehicle, MyBike | null>();

/** Values a rider typed before "My bike", read once and removed: storage is not kept for this. */
function takeLegacy(vehicle: Vehicle): MyBike | null {
  if (legacyTaken.has(vehicle)) return legacyTaken.get(vehicle)!;
  const found = readLegacy(vehicle);
  legacyTaken.set(vehicle, found);
  return found;
}

function readLegacy(vehicle: Vehicle): MyBike | null {
  try {
    const keys = LEGACY_KEYS(vehicle);
    const num = (key: string) => {
      const raw = localStorage.getItem(key);
      localStorage.removeItem(key);
      return raw && raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
    };
    const parsed = myBikeSchema.safeParse({
      rangeKm: num(keys.range),
      kmPerLitre: num(keys.mileage),
      fuelPrice: num(keys.price),
    });
    return parsed.success && hasBike(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

async function saveToAccount(vehicle: Vehicle, bike: MyBike): Promise<void> {
  await fetch("/api/me/vehicle", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicle, bike }),
    // Still sent when the page is closing (see the flush on unmount).
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * "My bike" for the ride check and trip cost (docs/02, "My bike"). A trip link or saved trip
 * that carries a bike wins for its own vehicle; otherwise the rider's account has it, else the
 * defaults. Changes go to the trip link (the caller writes `bike` into it) and, for a rider with
 * an account, to the account.
 */
export function useMyBike(vehicle: Vehicle, linked: MyBike | null) {
  const [bike, setBikeState] = useState<MyBike>(linked ?? NO_BIKE);
  const [kept, setKept] = useState<BikeKept>("link");
  // The link's bike belongs to the vehicle the trip was opened with.
  const linkedFor = useRef<Vehicle | null>(linked ? vehicle : null);
  const hasAccount = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  // A change waiting to be saved, with the vehicle it belongs to.
  const pending = useRef<{ vehicle: Vehicle; bike: MyBike } | null>(null);

  useEffect(() => {
    let live = true;
    const fromLink = linkedFor.current === vehicle;
    if (!fromLink) setBikeState(NO_BIKE);
    (async () => {
      const legacy = takeLegacy(vehicle);
      let account: MyBike | null = null;
      if (mayHaveRider()) {
        const data = (await fetch("/api/me/vehicle", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) as { rider: boolean; bikes: Partial<Record<Vehicle, MyBike>> } | null;
        hasAccount.current = data?.rider ?? false;
        account = data?.bikes[vehicle] ?? null;
      }
      if (!live) return;
      setKept(hasAccount.current ? "account" : "link");
      if (fromLink) return;
      if (hasBike(account)) setBikeState(account);
      else if (legacy) {
        setBikeState(legacy);
        if (hasAccount.current) void saveToAccount(vehicle, legacy);
      }
    })();
    return () => {
      live = false;
    };
  }, [vehicle]);

  // Leaving the planner with a change not yet saved: save it now rather than lose it.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current) void saveToAccount(pending.current.vehicle, pending.current.bike);
    },
    [],
  );

  const setBike = useCallback(
    (next: MyBike) => {
      setBikeState(next);
      if (!hasAccount.current) return;
      // A switch of vehicle meanwhile does not matter: the change keeps its own vehicle.
      pending.current = { vehicle, bike: next };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const job = pending.current;
        pending.current = null;
        if (job) void saveToAccount(job.vehicle, job.bike);
      }, SAVE_AFTER_MS);
    },
    [vehicle],
  );

  return { bike, setBike, kept };
}
