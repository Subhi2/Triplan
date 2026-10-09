import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

/** The foot of the content pages: the data credits and the about page. */
export function SiteFooter() {
  return (
    <footer className="mt-6 flex flex-col gap-2 border-t border-stone-200 pt-4 text-xs text-stone-600 dark:border-stone-800 dark:text-stone-400">
      <p>
        Map data ©{" "}
        <a className="underline" href="https://www.openstreetmap.org/copyright">
          OpenStreetMap contributors
        </a>{" "}
        (ODbL) · photos from Wikimedia Commons, credited on each place · weather from MET Norway ·
        terrain © USGS and NOAA.
      </p>
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        <Link href="/about" className="inline-flex min-h-11 items-center underline md:min-h-0">
          About {SITE_NAME}
        </Link>
      </p>
    </footer>
  );
}
