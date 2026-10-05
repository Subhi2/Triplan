import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { getStats } from "@/server/services/statsService";

// The numbers are refreshed at most hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: `About · ${SITE_NAME}`,
  description: `${SITE_NAME}: how it finds every place worth stopping for on your exact road, what it is built with, and where its data comes from.`,
  alternates: { canonical: "/about" },
};

const SOURCES: { what: string; who: string; href: string; licence: string }[] = [
  {
    what: "Places, towns, fuel stations, hospitals and other services",
    who: "OpenStreetMap contributors",
    href: "https://www.openstreetmap.org/copyright",
    licence: "ODbL 1.0",
  },
  {
    what: "Map tiles",
    who: "OpenFreeMap, OpenMapTiles, OpenStreetMap",
    href: "https://openfreemap.org",
    licence: "credited on the map",
  },
  {
    what: "Routes",
    who: "OSRM on OpenStreetMap data",
    href: "https://project-osrm.org",
    licence: "BSD-2 (software), ODbL (data)",
  },
  {
    what: "Place search",
    who: "Photon (komoot) and Nominatim",
    href: "https://photon.komoot.io",
    licence: "ODbL data",
  },
  {
    what: "Photos",
    who: "Wikimedia Commons",
    href: "https://commons.wikimedia.org",
    licence: "each photo's own licence and author, shown with it",
  },
  {
    what: "Weather on the ride",
    who: "MET Norway Locationforecast",
    href: "https://api.met.no",
    licence: "CC BY 4.0",
  },
  {
    what: "Heights, climbs and 3D terrain",
    who: "AWS Terrain Tiles: SRTM and GMTED2010 (USGS), ETOPO1 (NOAA)",
    href: "https://registry.opendata.aws/terrain-tiles/",
    licence: "open data, credited",
  },
  {
    what: "Google photos and reviews where we have none (when switched on)",
    who: "Google Maps Platform",
    href: "https://cloud.google.com/maps-platform/terms",
    licence: "Google's terms; never stored",
  },
];

function Stat({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="flex flex-col-reverse rounded-xl border border-stone-200 bg-(--surface) px-4 py-3 dark:border-stone-700">
      <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-display text-3xl font-extrabold">
        {value === null ? "–" : value.toLocaleString("en-IN")}
      </dd>
    </div>
  );
}

export default async function AboutPage() {
  const stats = await getStats().catch(() => null);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6">
      <SiteNav current="/about" />
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          About {SITE_NAME}
        </h1>
        <p className="text-lg">{SITE_TAGLINE}</p>
        <p>
          Map apps get you there. They do not tell you that the road to Kalasa passes a
          sixteenth-century star fort, that its ghat has twenty hairpins, that it will rain there at
          four, or that there is no fuel for the next 80 km. {SITE_NAME} does: pick a start, a
          destination and any stops, and it lists everything worth stopping for along that exact
          road, in kilometre order, with what you need to ride it.
        </p>
      </header>

      <section aria-labelledby="numbers">
        <h2 id="numbers" className="sr-only">
          In numbers
        </h2>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-stats>
          <Stat value={stats?.places ?? null} label="places along India's roads" />
          <Stat value={stats?.routesPlanned ?? null} label="rides planned" />
          <Stat value={stats?.tripsSaved ?? null} label="trips saved" />
        </dl>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-3">
        <h2 id="how" className="font-display text-2xl font-bold tracking-tight">
          How it works
        </h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>
            <strong>Routes.</strong> OSRM finds up to three ways; each is named by the towns it
            passes (&ldquo;via Sakleshpur&rdquo;) and split into national highway, state highway,
            ghat and other roads. Ghats and hairpins are worked out from the road&apos;s shape.
          </li>
          <li>
            <strong>Places on the road.</strong> A PostGIS corridor search over 40,000+ places from
            OpenStreetMap finds what lies within a few km of the route, how far along it is and how
            far off it, in one query.
          </li>
          <li>
            <strong>Ride check.</strong> The longest stretch without fuel against the tank&apos;s
            range, the arrival against sunset, the weather where you will be when you get there, and
            the longest stretch without a hospital.
          </li>
          <li>
            <strong>Ups and downs.</strong> Heights every 100 m from open terrain data give the
            climbs, the elevation profile and the 3D ride preview, which can be saved as a video.
          </li>
        </ol>
        <p>
          It is built with Next.js, TypeScript, Tailwind CSS, Supabase Postgres with PostGIS,
          Drizzle, MapLibre GL, Vitest and Playwright, and runs on Vercel. Every outside service
          sits behind its own small interface, cached and throttled to its fair-use rules.{" "}
          <a
            href="https://github.com/Subhi2/Triplan"
            className="text-brand-dark font-bold underline dark:text-teal-300"
          >
            The code is on GitHub
          </a>{" "}
          under the MIT licence, with a data snapshot to run it yourself in one command.
        </p>
      </section>

      <section aria-labelledby="data" className="flex flex-col gap-3">
        <h2 id="data" className="font-display text-2xl font-bold tracking-tight">
          Where the data comes from
        </h2>
        <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
          {SOURCES.map((s) => (
            <li key={s.what} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
              <span className="font-bold sm:w-64 sm:shrink-0">{s.what}</span>
              <span className="text-sm text-stone-600 dark:text-stone-400">
                <a href={s.href} className="underline">
                  {s.who}
                </a>{" "}
                · {s.licence}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="privacy" className="flex flex-col gap-2">
        <h2 id="privacy" className="font-display text-2xl font-bold tracking-tight">
          Privacy
        </h2>
        <p>
          No account and no tracking cookies. Your position is asked for only when you tap
          &ldquo;Use my location&rdquo;, rounded to about 100 m before it leaves your phone, and
          never stored. Saved trips are public to anyone with the link. Visits are counted without
          cookies, and routes planned are counted per day, with nothing about who planned them. Text
          typed into &ldquo;plan in plain words&rdquo; goes to the AI provider to read it and is not
          stored.
        </p>
      </section>

      <section aria-labelledby="who" className="flex flex-col gap-2">
        <h2 id="who" className="font-display text-2xl font-bold tracking-tight">
          Who made it
        </h2>
        <p>
          Built by{" "}
          <a href="https://github.com/Subhi2" className="underline">
            Subhash
          </a>{" "}
          as a free-time project. Found a wrong place, or a road that should be here?{" "}
          <a href="https://github.com/Subhi2/Triplan/issues" className="underline">
            Open an issue
          </a>
          .
        </p>
        <p>
          <Link href="/rides" className="text-brand-dark font-bold underline dark:text-teal-300">
            Start with a famous ride
          </Link>
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
