"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PlaceDetail } from "@/lib/placeDetail";
import type { Vehicle } from "@/lib/trip";
import { PlaceDetailView } from "./PlaceDetailView";

type DetailState =
  | { status: "loading" }
  | { status: "ok"; place: PlaceDetail }
  | { status: "error"; message: string };

// Place details change rarely; keep the ones opened in this visit.
const cache = new Map<string, PlaceDetail>();

function usePlaceDetail(slug: string): DetailState {
  const [state, setState] = useState<DetailState>(() => {
    const hit = cache.get(slug);
    return hit ? { status: "ok", place: hit } : { status: "loading" };
  });

  useEffect(() => {
    const hit = cache.get(slug);
    if (hit) {
      setState({ status: "ok", place: hit });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/places/${encodeURIComponent(slug)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = (await res.json()) as { place?: PlaceDetail; error?: string };
        if (!res.ok || !data.place) throw new Error(data.error ?? `HTTP ${res.status}`);
        cache.set(slug, data.place);
        setState({ status: "ok", place: data.place });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not load the place",
        });
      });
    return () => ctrl.abort();
  }, [slug]);

  return state;
}

interface Props {
  slug: string;
  name: string;
  along: { kmFromStart: number; detourKm: number } | null;
  vehicle: Vehicle;
  /** The "Add to trip" control. */
  tripAction?: React.ReactNode;
  onBack: () => void;
}

/** A place's details in the planner (the side panel on desktop, the bottom sheet on mobile). */
export function PlacePanel({ slug, name, along, vehicle, tripAction, onBack }: Props) {
  const state = usePlaceDetail(slug);
  const top = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Start at the top of the details, and move focus there for keyboard and screen reader users.
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [slug]);
  const loaded = state.status === "ok";
  useEffect(() => {
    if (loaded) heading.current?.focus({ preventScroll: true });
  }, [loaded, slug]);

  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-brand inline-flex min-h-11 items-center text-sm font-medium hover:underline md:min-h-0"
        >
          ← All places
        </button>
        <Link
          href={`/place/${slug}`}
          className="inline-flex min-h-11 items-center text-sm text-stone-600 underline md:min-h-0 dark:text-stone-400"
        >
          Open full page
        </Link>
      </div>
      {state.status === "loading" && (
        <>
          <h2 className="text-xl font-bold">{name}</h2>
          {tripAction && <div className="flex flex-wrap gap-2">{tripAction}</div>}
          <p className="text-sm text-stone-500">Loading details…</p>
        </>
      )}
      {state.status === "error" && (
        <>
          <h2 className="text-xl font-bold">{name}</h2>
          {tripAction && <div className="flex flex-wrap gap-2">{tripAction}</div>}
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {state.message}
          </p>
        </>
      )}
      {state.status === "ok" && (
        <PlaceDetailView
          place={state.place}
          month={new Date().getMonth() + 1}
          headingLevel={2}
          headingRef={heading}
          along={along}
          vehicle={vehicle}
          actions={tripAction}
        />
      )}
    </div>
  );
}
