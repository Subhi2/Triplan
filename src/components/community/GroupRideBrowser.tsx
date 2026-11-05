"use client";

import Link from "next/link";
import { useState } from "react";
import { MONTH_SHORT } from "@/lib/months";
import type { GroupRideSummary } from "@/lib/community/views";
import { GroupRideCard } from "./Cards";
import { communityFetch } from "./riderSession";
import { chip, chipOff, chipOn, errorText, muted, primaryButton } from "./ui";

const round3 = (n: number) => Math.round(n * 1000) / 1000;
type Vehicle = "bike" | "car" | null;

/** Upcoming public rides with filters: starting near me, month, bike or car. */
export function GroupRideBrowser({ initial }: { initial: GroupRideSummary[] }) {
  const [rides, setRides] = useState(initial);
  const [near, setNear] = useState<[number, number] | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(next: {
    near: [number, number] | null;
    month: number | null;
    vehicle: Vehicle;
  }) {
    setNear(next.near);
    setMonth(next.month);
    setVehicle(next.vehicle);
    setError(null);
    const params = new URLSearchParams();
    if (next.near) {
      params.set("lng", String(next.near[0]));
      params.set("lat", String(next.near[1]));
    }
    if (next.month) params.set("month", String(next.month));
    if (next.vehicle) params.set("vehicle", next.vehicle);
    try {
      setRides(
        (await communityFetch<{ rides: GroupRideSummary[] }>(`/api/group-rides?${params}`)).rides,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load rides");
    }
  }

  function toggleNear() {
    if (near) return void load({ near: null, month, vehicle });
    navigator.geolocation?.getCurrentPosition(
      (p) =>
        void load({
          near: [round3(p.coords.longitude), round3(p.coords.latitude)],
          month,
          vehicle,
        }),
      () => setError("Could not get your location."),
      { maximumAge: 600_000, timeout: 15_000 },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter rides">
        <button
          type="button"
          aria-pressed={near !== null}
          onClick={toggleNear}
          className={`${chip} ${near ? chipOn : chipOff}`}
        >
          Starting near me
        </button>
        {(["bike", "car"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={vehicle === v}
            onClick={() => void load({ near, month, vehicle: vehicle === v ? null : v })}
            className={`${chip} ${vehicle === v ? chipOn : chipOff}`}
          >
            {v === "bike" ? "Bikes" : "Cars"}
          </button>
        ))}
        <label className="inline-flex items-center gap-2 text-sm">
          <span className={muted}>In</span>
          <select
            value={month ?? ""}
            onChange={(e) =>
              void load({ near, month: e.target.value ? Number(e.target.value) : null, vehicle })
            }
            className="min-h-11 rounded-lg border border-stone-300 bg-(--surface) px-2 text-base md:min-h-9 md:text-sm dark:border-stone-700"
          >
            <option value="">any month</option>
            {MONTH_SHORT.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      {rides.length === 0 ? (
        <p className={muted}>No group rides coming up here yet. Host the first one.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Group rides">
          {rides.map((r) => (
            <li key={r.id}>
              <GroupRideCard ride={r} />
            </li>
          ))}
        </ul>
      )}
      <Link href="/group-rides/new" className={`${primaryButton} self-start`}>
        Host a group ride
      </Link>
    </div>
  );
}
