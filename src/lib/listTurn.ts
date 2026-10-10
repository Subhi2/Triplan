// Which way the place list turns when the rider switches route or changes a filter (docs/08
// "Motion"): a later route or a narrower filter comes in from the right, an earlier route or a
// wider filter from the left, like turning the page forward or back.

export type ListTurn = "next" | "prev";

export interface ListView {
  /** The picked route's position among the options. */
  routeIndex: number;
  /** Changes whenever the filters change. */
  filterKey: string;
  /** How narrow the filters are: picked categories, plus one for a detour limit. */
  filterRank: number;
}

/** The turn from one view of the list to the next; null when nothing changed. */
export function listTurn(prev: ListView, next: ListView): ListTurn | null {
  if (next.routeIndex !== prev.routeIndex)
    return next.routeIndex > prev.routeIndex ? "next" : "prev";
  if (next.filterKey === prev.filterKey) return null;
  return next.filterRank >= prev.filterRank ? "next" : "prev";
}
