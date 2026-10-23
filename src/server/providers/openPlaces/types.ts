/** A west, south, east, north box in degrees. */
export type BBox = [number, number, number, number];

/** One record from an open places dataset (Overture Places), as read for our import (G5). */
export interface OpenPlaceRecord {
  /** The dataset's own stable id (Overture's GERS id). */
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** How sure the dataset is that the place exists, 0 to 1; null when it does not say. */
  confidence: number | null;
  /** Overture's high-level category ("gas_station", "restaurant"). */
  basicCategory: string;
  /** The most specific category ("south_indian_restaurant"). */
  detailCategory: string | null;
  /** Where the record comes from ("meta", "Foursquare", "AllThePlaces") and their licences. */
  datasets: string[];
  licenses: string[];
  /** "open", "temporarily_closed", "permanently_closed"; null when unknown. */
  operatingStatus: string | null;
  locality: string | null;
  website: string | null;
}

export interface OpenPlacesProvider {
  /** The release read, for example "2026-10-21.0". */
  readonly release: string;
  /** Records in the box whose high-level category is one of `basicCategories`. */
  placesInBox(bbox: BBox, basicCategories: readonly string[]): Promise<OpenPlaceRecord[]>;
  close(): void;
}
