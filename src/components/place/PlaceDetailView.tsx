import { categoryStyle } from "@/lib/categories";
import { formatDuration } from "@/lib/format";
import { googleEnabled } from "@/lib/google";
import { placeGoogleMapsHref } from "@/lib/googleMaps";
import { MONTH_SHORT } from "@/lib/months";
import { VEHICLE_LABELS, type PlaceDetail } from "@/lib/placeDetail";
import { detourLabel } from "@/lib/places";
import type { Vehicle } from "@/lib/trip";
import { CarryList } from "./CarryList";
import { MonthStrip } from "./MonthStrip";
import { NotKnown } from "./NotKnown";

interface Props {
  place: PlaceDetail;
  /** The current month (1–12), for the month strip and the items to carry. */
  month: number;
  headingLevel: 1 | 2;
  /** Where the place is on the selected route, when shown from the planner. */
  along?: { kmFromStart: number; detourKm: number } | null;
  /** The trip's vehicle, to warn when the place is better reached another way. */
  vehicle?: Vehicle;
  /** Buttons under the title, e.g. "Add to trip". */
  actions?: React.ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>;
}

function Field(props: { label: string; value: React.ReactNode; source?: string }) {
  const empty = props.value === null || props.value === undefined || props.value === "";
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-stone-600 dark:text-stone-400">{props.label}</dt>
      <dd>
        {empty ? <NotKnown /> : props.value}
        {!empty && props.source && (
          <span className="text-xs text-stone-500 dark:text-stone-400"> ({props.source})</span>
        )}
      </dd>
    </div>
  );
}

function Section(props: { title: string; level: 2 | 3; children: React.ReactNode }) {
  const H = props.level === 2 ? "h2" : "h3";
  return (
    <section className="border-t border-stone-200 pt-3 dark:border-stone-800">
      <H className="mb-1 font-semibold">{props.title}</H>
      {props.children}
    </section>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <>
      <span aria-hidden className="text-amber-600 dark:text-amber-400">
        ★{" "}
      </span>
      <span className="sr-only">Rated </span>
      {rating.toFixed(1)}
    </>
  );
}

const external = "noopener noreferrer nofollow";

/**
 * Everything known about a place: photos, rating, guide fields (with "Not known yet" for empty
 * ones), items to carry, reviews and videos. Used on /place/[slug] and in the planner's panel.
 */
/** Where a photo comes from, as shown in its credit line. */
const MEDIA_SOURCES: Record<string, string> = {
  wikimedia: "Wikimedia Commons",
  user: "Rider photo",
};

export function PlaceDetailView({
  place,
  month,
  headingLevel,
  along,
  vehicle,
  actions,
  headingRef,
}: Props) {
  const cat = categoryStyle(place.category);
  const g = place.guide;
  const H = headingLevel === 1 ? "h1" : "h2";
  const sub = headingLevel === 1 ? 2 : 3;
  const [lng, lat] = place.location;
  const area = [place.district, place.state].filter(Boolean).join(", ");
  const notIdeal =
    vehicle && g && g.bestVehicles.length > 0 && !g.bestVehicles.includes(vehicle)
      ? g.bestVehicles.map((v) => VEHICLE_LABELS[v].toLowerCase()).join(" or ")
      : null;

  return (
    <article className="flex flex-col gap-4" aria-labelledby={`place-${place.id}`}>
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 px-2 py-0.5 dark:border-stone-700">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            {cat.name}
          </span>
          {place.trending && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              Trending
            </span>
          )}
        </div>
        <H
          id={`place-${place.id}`}
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-bold outline-none"
        >
          {place.name}
        </H>
        {area && <p className="text-sm text-stone-600 dark:text-stone-400">{area}</p>}
        {along && (
          <p className="text-sm">
            <span className="font-semibold">{Math.round(along.kmFromStart)} km</span> from the start
            · {detourLabel(along.detourKm)}
          </p>
        )}
        <p className="text-sm">
          {place.rating !== null ? (
            <>
              <Stars rating={place.rating} /> ({place.ratingCount} review
              {place.ratingCount === 1 ? "" : "s"})
            </>
          ) : (
            <span className="text-stone-600 dark:text-stone-400">No reviews yet</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {actions}
          <a
            href={placeGoogleMapsHref(place, googleEnabled)}
            target="_blank"
            rel={external}
            className="inline-flex min-h-11 items-center rounded-md border border-stone-300 px-3 text-sm font-medium hover:border-stone-500 md:min-h-0 md:py-1.5 dark:border-stone-700"
          >
            Open in Google Maps
          </a>
        </div>
      </header>

      {place.media.length > 0 ? (
        <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" aria-label="Photos">
          {place.media.map((m) => (
            <li key={m.url} className="w-64 shrink-0 snap-start">
              <figure>
                {/* Photos come from many hosts (Wikimedia, uploads), each shown with its credit. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.thumbUrl ?? m.url}
                  alt={`${place.name}${m.author ? `, photo by ${m.author}` : ""}`}
                  loading="lazy"
                  className="h-40 w-64 rounded-lg bg-stone-200 object-cover dark:bg-stone-800"
                />
                <figcaption className="mt-1 truncate text-xs text-stone-600 dark:text-stone-400">
                  {m.authorUrl ? (
                    <a href={m.authorUrl} rel={external} target="_blank" className="underline">
                      {m.author ?? "Unknown author"}
                    </a>
                  ) : (
                    (m.author ?? "Unknown author")
                  )}{" "}
                  · {m.license} · {MEDIA_SOURCES[m.source] ?? m.source}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-stone-100 px-3 py-6 text-center text-sm text-stone-500 dark:bg-stone-900 dark:text-stone-400">
          No photos yet
        </p>
      )}

      {place.description && <p className="text-sm leading-relaxed">{place.description}</p>}

      <Section title="Getting there" level={sub}>
        <dl>
          <Field
            label="Best vehicle"
            value={
              g && g.bestVehicles.length > 0
                ? g.bestVehicles.map((v) => VEHICLE_LABELS[v]).join(", ")
                : null
            }
          />
          <Field label="Last mile" value={g?.lastMileNote} />
          <Field
            label="Road"
            value={g?.roadCondition && <span className="capitalize">{g.roadCondition}</span>}
          />
        </dl>
        {notIdeal && (
          <p className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Better reached by {notIdeal} than by {vehicle}.
          </p>
        )}
      </Section>

      <Section title="When to go" level={sub}>
        <MonthStrip guide={g} month={month} />
        <dl className="mt-1">
          <Field label="Time of day" value={g?.bestTimeOfDay} />
          <Field
            label="Time needed"
            value={g?.visitDurationMin ? `About ${formatDuration(g.visitDurationMin)}` : null}
          />
        </dl>
      </Section>

      <Section title="What to carry" level={sub}>
        <CarryList carry={place.carry} month={month} />
      </Section>

      <Section title="Visiting" level={sub}>
        <dl>
          <Field
            label="Timings"
            value={g?.timings ?? place.osm.openingHours}
            source={!g?.timings && place.osm.openingHours ? "OpenStreetMap" : undefined}
          />
          <Field
            label="Entry fee"
            value={g?.entryFee ?? place.osm.fee}
            source={!g?.entryFee && place.osm.fee ? "OpenStreetMap" : undefined}
          />
          <Field label="Dress code" value={g?.dressCode} />
          <Field label="Permit" value={g?.permitNeeded} />
          {g?.notes && <Field label="Notes" value={g.notes} />}
        </dl>
      </Section>

      <Section title="Reviews" level={sub}>
        {place.reviews.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">No reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {place.reviews.map((r) => (
              <li key={r.id} className="text-sm">
                <p>
                  <Stars rating={r.rating} /> · {r.author ?? "A traveller"}
                  {r.visitedMonth && (
                    <span className="text-stone-600 dark:text-stone-400">
                      {" "}
                      · visited {MONTH_SHORT[r.visitedMonth - 1]} {r.visitedYear ?? ""}
                      {r.vehicleUsed && ` by ${VEHICLE_LABELS[r.vehicleUsed].toLowerCase()}`}
                    </span>
                  )}
                </p>
                {r.body && <p className="mt-0.5 leading-relaxed">{r.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Videos and reels" level={sub}>
        {place.videos.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">No videos yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {place.videos.map((v) => (
              <li key={v.url}>
                <a
                  href={v.url}
                  rel={external}
                  target="_blank"
                  className="text-brand inline-flex min-h-11 items-center underline md:min-h-0"
                >
                  {v.title ?? v.url}
                </a>
                <span className="text-stone-600 dark:text-stone-400">
                  {" "}
                  · {v.source === "youtube" ? "YouTube" : "Instagram"}
                  {v.creator && ` · ${v.creator}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <footer className="flex flex-col gap-2 border-t border-stone-200 pt-3 text-sm dark:border-stone-800">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
            rel={external}
            target="_blank"
            className="text-brand inline-flex min-h-11 items-center underline md:min-h-0"
          >
            Directions
          </a>
          <a
            href={
              place.osm.id
                ? `https://www.openstreetmap.org/${place.osm.id}`
                : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
            }
            rel={external}
            target="_blank"
            className="text-brand inline-flex min-h-11 items-center underline md:min-h-0"
          >
            OpenStreetMap
          </a>
          {place.osm.wikipediaUrl && (
            <a
              href={place.osm.wikipediaUrl}
              rel={external}
              target="_blank"
              className="text-brand inline-flex min-h-11 items-center underline md:min-h-0"
            >
              Wikipedia
            </a>
          )}
          {place.osm.website && (
            <a
              href={place.osm.website}
              rel={external}
              target="_blank"
              className="text-brand inline-flex min-h-11 items-center underline md:min-h-0"
            >
              Website
            </a>
          )}
        </p>
        {place.osm.id && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Map data ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              rel={external}
              target="_blank"
              className="underline"
            >
              OpenStreetMap contributors
            </a>
          </p>
        )}
      </footer>
    </article>
  );
}
