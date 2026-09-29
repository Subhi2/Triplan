import type { Metadata } from "next";
import Link from "next/link";
import { formatDuration, formatKm } from "@/lib/format";
import { listTrips } from "@/server/services/tripService";

// The list changes whenever anyone saves a trip.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Saved trips · Bike Travelling Guide" };

const updated = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default async function TripsPage() {
  const trips = await listTrips();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <nav className="text-sm">
        <Link href="/" className="text-brand font-bold">
          Bike Travelling Guide
        </Link>
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Saved trips</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Trips saved by everyone. Open one to see its route and places.
          </p>
        </div>
        <Link
          href="/"
          className="bg-brand hover:bg-brand-dark rounded-md px-3 py-1.5 text-sm font-medium text-white"
        >
          Plan a trip
        </Link>
      </header>
      {trips.length === 0 ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          No saved trips yet. Plan a trip and press Save trip.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800" aria-label="Saved trips">
          {trips.map((t) => (
            <li key={t.id}>
              <Link
                href={`/trips/${t.id}`}
                className="block rounded-md px-2 py-3 hover:bg-stone-100 dark:hover:bg-stone-900"
              >
                <span className="block font-semibold">{t.title}</span>
                <span className="block text-sm">
                  {t.from} → {t.to}
                  {t.viaCount > 0 && ` · ${t.viaCount} stop${t.viaCount > 1 ? "s" : ""}`}
                </span>
                <span className="block text-xs text-stone-600 dark:text-stone-400">
                  {[
                    t.viaLabel,
                    t.distanceKm !== null && formatKm(t.distanceKm * 1000),
                    t.durationMin !== null && formatDuration(t.durationMin),
                    t.vehicle === "bike" ? "Bike" : "Car",
                    `saved ${updated.format(new Date(t.updatedAt))}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
