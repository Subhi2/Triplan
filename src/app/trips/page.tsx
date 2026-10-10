import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { DeviceTrips } from "@/components/trip/DeviceTrips";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Your trips · ${SITE_NAME}`,
  // Each device's own list: nothing here for search engines.
  robots: { index: false, follow: true },
};

/** The trips saved or opened on this device. Each trip's link opens it for anyone. */
export default function TripsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <SiteNav current="/trips" />
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Your trips
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Trips saved or opened on this device. Share a trip by its link.
          </p>
        </div>
        <Link
          href="/"
          className="bg-brand hover:bg-brand-dark inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-white md:min-h-0 md:py-1.5"
        >
          Plan a trip
        </Link>
      </header>
      <DeviceTrips />
      <SiteFooter />
    </main>
  );
}
