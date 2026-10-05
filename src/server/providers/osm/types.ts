import type { LngLat } from "@/lib/geo";

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

export interface OsmElement {
  id: string; // "node/123", "way/456", "relation/789"
  location: LngLat; // node position, or the centre of a way's / relation's bounding box
  extentM: number; // bounding box diagonal in metres; 0 for nodes
  tags: Record<string, string>;
}

export interface OsmPlacesRequest {
  areaIso: string; // ISO 3166-2 code of the state, e.g. "IN-KA"
  bbox: BBox; // one tile of it
}

export interface OsmPlacesProvider {
  /** Places of interest, fuel stations and towns inside the area and tile. */
  fetchPlaces(request: OsmPlacesRequest): Promise<OsmElement[]>;
  /** Hospitals, police, ATMs, tyre and repair shops and stays inside the area and tile. */
  fetchServices(request: OsmPlacesRequest): Promise<OsmElement[]>;
}

/** The query timed out or ran out of memory: retry with a smaller tile. */
export class OsmTileTooBigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OsmTileTooBigError";
  }
}

/** The server has no free slot or is overloaded: wait, then retry. */
export class OsmServerBusyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OsmServerBusyError";
  }
}
