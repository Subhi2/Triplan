"use client";

import { useEffect } from "react";
import type { PlaceAlong } from "@/lib/places";
import { PlaceRow, placeRowId } from "./PlaceRow";

interface Props {
  places: PlaceAlong[]; // already filtered, ordered by km
  activeId: string | null;
  hoverId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function PlaceList({ places, activeId, hoverId, onSelect, onHover }: Props) {
  // Bring the active place into view, e.g. after its marker was clicked on the map.
  useEffect(() => {
    if (activeId) {
      document
        .getElementById(placeRowId(activeId))
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeId]);

  return (
    <ol aria-label="Places along the route" className="space-y-1">
      {places.map((p) => (
        <PlaceRow
          key={p.id}
          place={p}
          active={p.id === activeId}
          highlighted={p.id === hoverId}
          onSelect={() => onSelect(p.id)}
          onHover={(h) => onHover(h ? p.id : null)}
        />
      ))}
    </ol>
  );
}
