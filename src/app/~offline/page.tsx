import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site/SiteNav";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Offline · ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

/**
 * Shown by the service worker for a page it cannot load without a connection (src/app/sw.ts):
 * often on a ghat with no signal.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <SiteNav />
      <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
        No connection here
      </h1>
      <p className="text-stone-700 dark:text-stone-300">
        This page needs the internet, and there is none right now. Pages you opened before may still
        work. Routes, places along them and the weather come back once you have signal.
      </p>
      <p className="text-stone-700 dark:text-stone-300">
        Riding into an area with no signal? Before you go, download the trip as a GPX file or open
        it in Google Maps, which keep working offline.
      </p>
      <Link
        href="/"
        className="bg-brand hover:bg-brand-dark inline-flex min-h-11 w-fit items-center rounded-md px-3 text-sm font-medium text-white md:min-h-0 md:py-1.5"
      >
        Try again
      </Link>
    </main>
  );
}
