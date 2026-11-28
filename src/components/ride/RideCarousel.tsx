"use client";

import { useRef, useState } from "react";
import type { LngLat } from "@/lib/geo";
import { mediaSourceName } from "@/lib/media";
import type { RidePhoto } from "@/lib/rides";
import { RouteSketch } from "./RouteSketch";

/**
 * A ride's photos in a strip that scrolls sideways (swipe, or the arrows), with the ride's path
 * drawn over the corner and the credit of the photo in view underneath. One photo shows no
 * arrows; no photo shows the route's shape alone. Photos come from Commons with their credit.
 *
 * `size` "compact" and "card" use the small pictures in a short strip; "hero" the large ones. The arrows
 * stop the click, so a ride card that is a link does not open when they are used.
 */
export function RideCarousel({
  photos,
  line,
  size = "card",
  swipe = true,
  linkCredit = false,
  className = "",
}: {
  photos: RidePhoto[];
  line: LngLat[];
  size?: "compact" | "card" | "hero";
  /** Photos move by swipe and scroll; off inside a strip that itself scrolls sideways. */
  swipe?: boolean;
  /** Link each credit to the photo's Commons page (not inside another link). */
  linkCredit?: boolean;
  className?: string;
}) {
  const strip = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const height = size === "hero" ? "h-56 md:h-80" : size === "compact" ? "h-24" : "h-36";
  const sketch =
    size === "hero"
      ? "absolute right-3 bottom-3 h-20 w-28 rounded-xl"
      : size === "compact"
        ? "absolute right-1.5 bottom-1.5 h-11 w-14 rounded-md"
        : "absolute right-2 bottom-2 h-14 w-20 rounded-lg";

  if (photos.length === 0) {
    return (
      <RouteSketch
        line={line}
        className={`bg-brand-tint ${height} w-full rounded-xl dark:bg-teal-950 ${className}`}
      />
    );
  }

  const go = (to: number) => {
    const el = strip.current;
    if (!el) return;
    const next = (to + photos.length) % photos.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };
  const current = photos[Math.min(index, photos.length - 1)]!;
  // Arrows show on hover with a mouse; always where the strip cannot be swiped.
  const arrow = `absolute top-1/2 z-10 ${swipe ? "hidden group-hover/carousel:flex" : "flex"} h-11 w-11 md:h-9 md:w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-lg text-white hover:bg-black/70 focus-visible:flex`;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="group/carousel relative">
        <ul
          ref={strip}
          aria-label="Photos along the ride"
          // Reachable by keyboard (axe: scrollable-region-focusable); the arrow keys turn it.
          tabIndex={photos.length > 1 ? 0 : undefined}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            go(index + (e.key === "ArrowRight" ? 1 : -1));
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
          }}
          className={`flex ${height} w-full snap-x snap-mandatory ${swipe ? "overflow-x-auto" : "overflow-x-hidden"} [scrollbar-width:none] rounded-xl bg-stone-200 dark:bg-stone-800 [&::-webkit-scrollbar]:hidden`}
        >
          {photos.map((p, i) => (
            <li key={p.url ?? p.thumbUrl} className="h-full w-full shrink-0 snap-center">
              {/* Our own credited photo (Wikimedia Commons or a rider's), never Google's. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={size === "hero" ? (p.url ?? p.thumbUrl) : p.thumbUrl}
                alt={`${p.placeName}${p.author ? `, photo by ${p.author}` : ""}`}
                loading={i === 0 && size === "hero" ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
              />
            </li>
          ))}
        </ul>
        {photos.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                go(index - 1);
              }}
              className={`${arrow} left-2`}
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                go(index + 1);
              }}
              className={`${arrow} right-2`}
            >
              <span aria-hidden>›</span>
            </button>
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1"
            >
              {photos.map((p, i) => (
                <span
                  key={p.url ?? p.thumbUrl}
                  className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`}
                />
              ))}
            </span>
          </>
        )}
        {/* The ride's path, as on every ride card. */}
        <RouteSketch
          line={line}
          className={`bg-brand-tint/95 pointer-events-none ${sketch} dark:bg-teal-950/95`}
        />
      </div>
      <p className="line-clamp-2 text-xs text-stone-600 dark:text-stone-400" aria-live="polite">
        {current.placeName} · photo {current.author ?? "unknown author"} · {current.license} ·{" "}
        {linkCredit && current.pageUrl ? (
          <a href={current.pageUrl} rel="noopener noreferrer" className="underline">
            {mediaSourceName(current.source)}
          </a>
        ) : (
          mediaSourceName(current.source)
        )}
      </p>
    </div>
  );
}
