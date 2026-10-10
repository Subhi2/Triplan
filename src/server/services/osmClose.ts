import type { LngLat } from "@/lib/geo";
import type { OsmCurrent } from "../providers/osm/osmApi";
import { classifyOsmElement } from "./osmClassify";

// Which places a finished import may close. A place the import did not see is closed only when
// OpenStreetMap says it is gone (deleted) or no longer a place we import (retagged or renamed),
// and never more than a few percent of a state at once without --force: on 2026-10-09 Overpass
// servers answered 51 tiles with nothing and about 1,070 open places were closed.

export interface CloseCandidate {
  id: string; // our place id
  osmId: string; // "node/123"
  name: string;
  category: string;
  location: LngLat;
}

export type CloseReason = "deleted" | "retagged";

export interface ClosePlan {
  close: { place: CloseCandidate; reason: CloseReason }[];
  /** Still a place in OpenStreetMap: missed by Overpass, kept open. */
  stillThere: CloseCandidate[];
  /** The OSM API did not answer for these: kept open. */
  unchecked: CloseCandidate[];
  /** Closing more than this needs --force. */
  limit: number;
  refused: boolean;
}

export const MAX_CLOSE_SHARE = 0.03;
/** Small states may always close this many. */
const MIN_CLOSE_LIMIT = 10;

export function closeLimit(openInState: number, maxShare = MAX_CLOSE_SHARE): number {
  return Math.max(MIN_CLOSE_LIMIT, Math.floor(openInState * maxShare));
}

export function planClosures(
  candidates: CloseCandidate[],
  current: Map<string, OsmCurrent>,
  openInState: number,
  { force = false, maxShare = MAX_CLOSE_SHARE }: { force?: boolean; maxShare?: number } = {},
): ClosePlan {
  const plan: ClosePlan = {
    close: [],
    stillThere: [],
    unchecked: [],
    limit: closeLimit(openInState, maxShare),
    refused: false,
  };
  for (const place of candidates) {
    const now = current.get(place.osmId);
    if (!now) {
      plan.unchecked.push(place);
    } else if (now.gone) {
      plan.close.push({ place, reason: "deleted" });
    } else {
      // Ways and relations come without a position from the API; ours is close enough to classify.
      const stillAPlace = classifyOsmElement({
        id: place.osmId,
        location: now.location ?? place.location,
        extentM: 0,
        tags: now.tags,
      });
      if (stillAPlace) plan.stillThere.push(place);
      else plan.close.push({ place, reason: "retagged" });
    }
  }
  plan.refused = !force && plan.close.length > plan.limit;
  return plan;
}
