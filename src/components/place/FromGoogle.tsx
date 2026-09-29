"use client";

import { useEffect, useState } from "react";
import { googleEnabled } from "@/lib/google";
import { googlePhotoUrl, type GoogleAuthor, type GoogleGapFill } from "@/lib/googleGap";

// Google's photos, rating and reviews for a place that lacks its own (docs/02, "Google Maps
// Platform"). Loaded in the browser after the details show, never stored or cached, and only
// when the Google map is the one in use. Every photo and review is credited to its author.

interface Props {
  slug: string;
  placeName: string;
  /** What we have of our own: Google is only asked when there is a gap. */
  ownPhotos: number;
  ownReviews: number;
  headingLevel: 2 | 3;
}

/** Same rule as the server (googleGapService): photos without our own, reviews below 3. */
const hasGap = (ownPhotos: number, ownReviews: number) => ownPhotos === 0 || ownReviews < 3;

const external = "noopener noreferrer nofollow";

function Author({ author }: { author: GoogleAuthor }) {
  return author.uri ? (
    <a href={author.uri} rel={external} target="_blank" className="underline">
      {author.displayName}
    </a>
  ) : (
    <>{author.displayName}</>
  );
}

export function FromGoogle({ slug, placeName, ownPhotos, ownReviews, headingLevel }: Props) {
  const [fill, setFill] = useState<GoogleGapFill | null>(null);
  const wanted = googleEnabled && hasGap(ownPhotos, ownReviews);

  useEffect(() => {
    setFill(null);
    if (!wanted) return;
    const ctrl = new AbortController();
    fetch(`/api/places/${encodeURIComponent(slug)}/google`, { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ fill: GoogleGapFill | null }>) : null))
      .then((body) => setFill(body?.fill ?? null))
      .catch(() => {}); // Google is extra: with it down, the section is simply not shown
    return () => ctrl.abort();
  }, [slug, wanted]);

  if (!fill || (fill.photos.length === 0 && fill.rating === null && fill.reviews.length === 0)) {
    return null;
  }
  const H = headingLevel === 2 ? "h2" : "h3";

  return (
    <section
      className="flex flex-col gap-2 border-t border-stone-200 pt-3 dark:border-stone-800"
      aria-label="From Google"
    >
      <H className="font-semibold">
        From Google
        {fill.rating !== null && (
          <span className="ml-2 text-sm font-normal">
            <span aria-hidden className="text-amber-600 dark:text-amber-400">
              ★{" "}
            </span>
            <span className="sr-only">Rated </span>
            {fill.rating.toFixed(1)}
            {fill.ratingCount !== null && (
              <span className="text-stone-600 dark:text-stone-400">
                {" "}
                ({fill.ratingCount.toLocaleString("en-IN")})
              </span>
            )}
          </span>
        )}
      </H>

      {fill.photos.length > 0 && (
        <ul
          className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
          aria-label="Photos from Google"
        >
          {fill.photos.map((p, i) => (
            <li key={p.name} className="w-64 shrink-0 snap-start">
              <figure>
                {/* Each photo is a billed request: the first loads now, the rest as the row is
                    swiped. Served by Google through our redirect, never stored. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={googlePhotoUrl(p.name)}
                  alt={`${placeName}${p.authors[0] ? `, photo by ${p.authors[0].displayName}` : ""}`}
                  loading={i === 0 ? "eager" : "lazy"}
                  referrerPolicy="no-referrer"
                  className="h-40 w-64 rounded-lg bg-stone-200 object-cover dark:bg-stone-800"
                />
                <figcaption className="mt-1 truncate text-xs text-stone-600 dark:text-stone-400">
                  {p.authors.length > 0 ? (
                    p.authors.map((a, j) => (
                      <span key={j}>
                        {j > 0 && ", "}
                        <Author author={a} />
                      </span>
                    ))
                  ) : (
                    <>Google user</>
                  )}{" "}
                  · Google Maps
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}

      {fill.reviews.length > 0 && (
        <ul className="space-y-3">
          {fill.reviews.map((r, i) => (
            <li key={i} className="text-sm">
              <p className="flex items-center gap-2">
                {r.author.photoUri && (
                  // eslint-disable-next-line @next/next/no-img-element -- Google's author photo
                  <img
                    src={r.author.photoUri}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-6 w-6 rounded-full"
                  />
                )}
                <span>
                  <span aria-hidden className="text-amber-600 dark:text-amber-400">
                    ★{" "}
                  </span>
                  <span className="sr-only">Rated </span>
                  {r.rating} · <Author author={r.author} />
                  <span className="text-stone-600 dark:text-stone-400"> · {r.relativeTime}</span>
                </span>
              </p>
              {r.text && <p className="mt-0.5 leading-relaxed whitespace-pre-line">{r.text}</p>}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-stone-500 dark:text-stone-400">
        Photos and reviews from Google Maps
        {fill.googleMapsUri && (
          <>
            {" · "}
            <a
              href={fill.googleMapsUri}
              rel={external}
              target="_blank"
              className="text-brand inline-flex min-h-11 items-center underline md:min-h-0"
            >
              See all on Google Maps
            </a>
          </>
        )}
      </p>
    </section>
  );
}
