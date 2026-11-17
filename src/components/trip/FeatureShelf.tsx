"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { communityEnabled } from "@/lib/community/enabled";
import { deviceTripIds } from "@/lib/tripTokens";
import type { RouteOption, Vehicle } from "@/lib/trip";
import { OpenRideFile } from "./OpenRideFile";
import { SHELF_TILE } from "./shelfTile";

interface Props {
  vehicle: Vehicle;
  onRideOpened: (route: RouteOption, name: string | null) => void;
}

/**
 * The landing page's other ways in, under the trip form: every main part of the app is one tap
 * from the first screen instead of only in the Menu.
 */
export function FeatureShelf({ vehicle, onRideOpened }: Props) {
  // The trips saved on this phone, counted after load (localStorage is not on the server).
  const [tripCount, setTripCount] = useState(0);
  useEffect(() => setTripCount(deviceTripIds().length), []);

  return (
    <section aria-labelledby="shelf-heading" className="flex flex-col gap-2">
      <h2 id="shelf-heading" className="font-display text-[17px] font-bold tracking-tight">
        Or start another way
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        <li>
          <Link href={`/nearby?v=${vehicle}`} className={SHELF_TILE}>
            <span className="font-bold">Near me</span>
            <span className="text-xs text-stone-600 dark:text-stone-400">
              Places worth a ride from where you are
            </span>
          </Link>
        </li>
        <li>
          <Link href="/rides" className={SHELF_TILE}>
            <span className="font-bold">Famous rides</span>
            <span className="text-xs text-stone-600 dark:text-stone-400">
              Well-known roads, ready to plan
            </span>
          </Link>
        </li>
        {communityEnabled && (
          <li>
            <Link href="/group-rides" className={SHELF_TILE}>
              <span className="font-bold">Ride with a group</span>
              <span className="text-xs text-stone-600 dark:text-stone-400">
                Join a group ride or a club
              </span>
            </Link>
          </li>
        )}
        <li>
          <OpenRideFile onOpened={onRideOpened} variant="tile" />
        </li>
      </ul>
      {tripCount > 0 && (
        <Link
          href="/trips"
          className="text-brand-dark inline-flex min-h-11 items-center self-start text-sm font-bold hover:underline dark:text-teal-300"
        >
          Your trips ({tripCount}) <span aria-hidden>&nbsp;›</span>
        </Link>
      )}
    </section>
  );
}
