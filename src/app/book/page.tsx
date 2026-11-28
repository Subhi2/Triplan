import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { PrintButton } from "@/components/trip/PrintButton";
import { RouteSketch } from "@/components/ride/RouteSketch";
import { categoryStyle } from "@/lib/categories";
import { formatDuration, formatKm } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import {
  DEFAULT_EV_RANGE_KM,
  DEFAULT_RANGE_KM,
  FUEL_CORRIDOR_KM,
  pickFuelStops,
} from "@/lib/rideCheck";
import { helplines } from "@/lib/safety";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { parseTripUrl, serializeTripUrl } from "@/lib/tripUrl";
import { placesAlong } from "@/server/services/corridorService";
import { openPlacesAlong } from "@/server/services/openPlaceService";
import { packingFor } from "@/server/services/packingService";
import { rulesAlongRoute } from "@/server/services/roadRuleService";
import { getRouteResult } from "@/server/services/routeService";
import { servicesAlong } from "@/server/services/servicePointService";

// The road book (G10, C4): the trip on paper, or saved as a PDF from the browser's print. Our own
// data only: a sketch of the road (no map tiles, nothing from Google), the stops in km order,
// where to fill up, road rules with their links, helplines and what to pack.

export const metadata: Metadata = {
  title: `Road book · ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

/** Stops listed when the rider picked none: the well-known places along the road. */
const TOP_PLACES = 15;
const UUID = /^[0-9a-f-]{36}$/;

type Search = Promise<Record<string, string | string[] | undefined>>;

function paramsOf(search: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    for (const value of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, value);
  }
  return params;
}

export default async function RoadBookPage({ searchParams }: { searchParams: Search }) {
  const params = paramsOf(await searchParams);
  const trip = parseTripUrl(params);
  const routeId = params.get("route") ?? "";
  const pickedIds = (params.get("p") ?? "").split(",").filter((id) => UUID.test(id));
  const route = routeId ? await getRouteResult(routeId).catch(() => null) : null;
  const plannerLink = `${siteUrl()}/?${serializeTripUrl(trip)}`;

  if (!route || !trip.from || !trip.to) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <h1 className="font-display text-3xl font-extrabold">Road book</h1>
        <p>
          This road book&apos;s route is no longer kept. Open the trip and print it from there
          again.
        </p>
        <Link
          href={plannerLink}
          className="text-brand-dark inline-flex min-h-11 items-center font-bold underline md:min-h-0 dark:text-teal-300"
        >
          Open the trip
        </Link>
      </main>
    );
  }

  const geometry = route.geometry;
  const line = geometry.coordinates as LngLat[];
  const totalKm = route.distanceM / 1000;
  const electric = trip.myBike?.electric ?? false;
  const rangeKm =
    trip.myBike?.rangeKm ?? (electric ? DEFAULT_EV_RANGE_KM : DEFAULT_RANGE_KM)[trip.vehicle];
  const month = new Date().getMonth() + 1;

  const [places, fuel, openFuel, charging, rules, packing, qr] = await Promise.all([
    placesAlong(geometry, trip.corridorKm * 1000, null),
    electric ? Promise.resolve([]) : placesAlong(geometry, FUEL_CORRIDOR_KM * 1000, ["fuel"]),
    electric ? Promise.resolve([]) : openPlacesAlong(geometry, FUEL_CORRIDOR_KM * 1000, ["fuel"]),
    electric ? servicesAlong(geometry, FUEL_CORRIDOR_KM * 1000, ["charging"]) : Promise.resolve([]),
    rulesAlongRoute(geometry).catch(() => []),
    packingFor(pickedIds, month, trip.to.location).catch(() => []),
    QRCode.toString(plannerLink, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
  ]);

  const picked = places.filter((p) => pickedIds.includes(p.id));
  const stops = (
    picked.length > 0 ? picked : places.filter((p) => p.notable).slice(0, TOP_PLACES)
  ).sort((a, b) => a.kmFromStart - b.kmFromStart);
  const stations = electric
    ? charging.map((c) => ({ name: c.name ?? "Charging point", kmFromStart: c.kmFromStart }))
    : [...fuel, ...openFuel].map((f) => ({ name: f.name, kmFromStart: f.kmFromStart }));
  const fuelPlan = pickFuelStops(stations, totalKm, rangeKm);
  const title = `${trip.from.label} → ${trip.to.label}`;

  const h2 = "font-display text-xl font-bold tracking-tight";
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 print:max-w-none print:px-0 print:py-0 print:text-[11pt]">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={plannerLink}
          className="text-brand-dark inline-flex min-h-11 items-center font-bold underline md:min-h-0 dark:text-teal-300"
        >
          Back to the trip
        </Link>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-widest text-stone-600 uppercase dark:text-stone-400">
            {SITE_NAME} road book
          </p>
          <h1 className="font-display text-3xl leading-tight font-extrabold">{title}</h1>
          <p className="tabular font-mono">
            {formatKm(route.distanceM)} · about {formatDuration(route.durationS / 60)} riding ·{" "}
            {trip.vehicle === "bike" ? "by bike" : "by car"}
            {trip.via.length > 0 && ` · via ${trip.via.map((v) => v.label).join(", ")}`}
          </p>
        </div>
        <div className="flex w-24 shrink-0 flex-col items-center gap-1 text-center text-[10px]">
          <div
            className="w-24 [&_svg]:h-auto [&_svg]:w-full"
            // Our own QR code of the trip link, drawn by `qrcode` as SVG.
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          Open on a phone
        </div>
      </header>

      <RouteSketch
        line={line}
        className="bg-brand-tint h-48 w-full rounded-2xl dark:bg-teal-950 print:h-40 print:bg-transparent print:ring-1 print:ring-stone-300"
      />

      <section aria-labelledby="book-stops" className="flex break-inside-avoid-page flex-col gap-2">
        <h2 id="book-stops" className={h2}>
          {picked.length > 0 ? "Your stops" : "Worth stopping for"}
        </h2>
        <ol className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
          {stops.map((p) => (
            <li key={p.id} className="flex break-inside-avoid items-baseline gap-3 py-1.5">
              <span className="tabular w-16 shrink-0 font-mono text-sm">
                km {Math.round(p.kmFromStart)}
              </span>
              <span className="font-bold">{p.name}</span>
              <span className="text-sm text-stone-600 dark:text-stone-400">
                {categoryStyle(p.category).name}
                {p.detourM > 300 ? ` · ${formatKm(p.detourM)} off the road` : ""}
              </span>
            </li>
          ))}
          {stops.length === 0 && <li className="py-1.5">No places found along this road.</li>}
        </ol>
      </section>

      <section aria-labelledby="book-fuel" className="flex break-inside-avoid flex-col gap-1">
        <h2 id="book-fuel" className={h2}>
          {electric ? "Charging" : "Fuel"}
        </h2>
        {fuelPlan.stops.length === 0 && fuelPlan.strandedAtKm === null ? (
          <p>
            One {electric ? "charge" : "tank"} ({rangeKm} km) covers the ride with a quarter spare.
          </p>
        ) : (
          <ol className="flex flex-col">
            {fuelPlan.stops.map((s) => (
              <li key={`${s.name}-${s.kmFromStart}`} className="flex gap-3">
                <span className="tabular w-16 shrink-0 font-mono text-sm">
                  km {Math.round(s.kmFromStart)}
                </span>
                {electric ? "Charge" : "Fill up"} at {s.name}
              </li>
            ))}
            {fuelPlan.strandedAtKm !== null && (
              <li className="font-bold">
                No {electric ? "charger" : "pump"} we know of in reach before km{" "}
                {Math.round(fuelPlan.strandedAtKm)}:{" "}
                {electric ? "plan a charge on the way." : "carry fuel."}
              </li>
            )}
          </ol>
        )}
        <p className="text-xs text-stone-600 dark:text-stone-400">
          For a {rangeKm} km range, from OpenStreetMap{electric ? "" : " and Overture Maps"}; some
          may be missing or closed.
        </p>
      </section>

      {rules.length > 0 && (
        <section aria-labelledby="book-rules" className="flex break-inside-avoid flex-col gap-1">
          <h2 id="book-rules" className={h2}>
            Road rules on the way
          </h2>
          <ul className="flex flex-col gap-1">
            {rules.map((r) => (
              <li key={r.slug}>
                <span className="tabular font-mono text-sm">
                  km {Math.round(r.kmFrom)}–{Math.round(r.kmTo)}
                </span>{" "}
                <span className="font-bold">{r.title}</span>
                {r.closedFrom && r.closedTo && ` · closed ${r.closedFrom}–${r.closedTo}`}
                <span className="block text-xs text-stone-600 dark:text-stone-400">
                  Checked {r.checkedOn} at {r.link}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="book-help" className="flex break-inside-avoid flex-col gap-1">
        <h2 id="book-help" className={h2}>
          Helplines
        </h2>
        <ul className="flex flex-col">
          {helplines(1).map((h) => (
            <li key={h.number}>
              <span className="tabular font-mono font-bold">{h.number}</span> {h.name}: {h.what}
              {h.number === "1033" ? " (on national highways)" : ""}
            </li>
          ))}
        </ul>
      </section>

      {packing.length > 0 && (
        <section aria-labelledby="book-pack" className="flex break-inside-avoid flex-col gap-1">
          <h2 id="book-pack" className={h2}>
            What to pack
          </h2>
          <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
            {packing.map((i) => (
              <li key={i.slug} className="flex items-baseline gap-2">
                <span aria-hidden className="font-mono">
                  ☐
                </span>
                {i.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-stone-200 pt-2 text-xs text-stone-600 dark:border-stone-800 dark:text-stone-400">
        A guide, not a promise: check road rules at their links and follow the signs on the road.
        Map data © OpenStreetMap contributors (ODbL). Made with {SITE_NAME}.
      </footer>
    </main>
  );
}
