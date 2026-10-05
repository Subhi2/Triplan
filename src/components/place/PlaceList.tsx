"use client";

import { Fragment, useEffect } from "react";
import type { PlaceAlong } from "@/lib/places";
import { PlaceRow, placeRowId } from "./PlaceRow";

interface Props {
  places: PlaceAlong[]; // already filtered, ordered by km
  activeId: string | null;
  hoverId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  pickedIds: ReadonlySet<string>;
  onPickedChange: (place: PlaceAlong, picked: boolean) => void;
  /** Nights of a multi-day split, in km order: the list shows where each day ends. */
  nights?: { km: number; label: string }[];
}

export function PlaceList(props: Props) {
  const { places, activeId, hoverId, onSelect, onHover, nights = [] } = props;
  // Bring the active place into view, e.g. after its marker was clicked on the map.
  useEffect(() => {
    if (activeId) {
      document
        .getElementById(placeRowId(activeId))
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeId]);

  return (
    <ol aria-label="Places along the route" className="flex flex-col">
      {places.map((p, i) => {
        // The nights passed between the previous place and this one.
        const prevKm = i > 0 ? places[i - 1]!.kmFromStart : -Infinity;
        const passed = nights.filter((n) => n.km >= prevKm && n.km < p.kmFromStart);
        return (
          <Fragment key={p.id}>
            {passed.map((n) => (
              <li
                key={`night-${n.km}`}
                className="font-display flex items-center gap-2 py-2 text-xs font-bold tracking-wider text-stone-600 uppercase dark:text-stone-400"
              >
                <span aria-hidden className="h-px flex-1 bg-stone-300 dark:bg-stone-700" />
                {n.label}
                <span aria-hidden className="h-px flex-1 bg-stone-300 dark:bg-stone-700" />
              </li>
            ))}
            <PlaceRow
              place={p}
              index={i}
              active={p.id === activeId}
              highlighted={p.id === hoverId}
              onSelect={() => onSelect(p.id)}
              onHover={(h) => onHover(h ? p.id : null)}
              picked={props.pickedIds.has(p.id)}
              onPickedChange={(picked) => props.onPickedChange(p, picked)}
            />
          </Fragment>
        );
      })}
    </ol>
  );
}
