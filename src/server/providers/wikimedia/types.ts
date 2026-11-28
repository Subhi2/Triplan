import type { LngLat } from "@/lib/geo";

/** What a place's Wikidata item says, to check the link before taking its photo or text. */
export interface WikidataItem {
  file: string | null; // main image (P18): "File:Jog Falls at Shimoga.jpg"
  human: boolean; // an instance of human (P31 = Q5): OSM's wikidata tag on a memorial
  location: LngLat | null; // coordinates (P625)
  enwiki: string | null; // title of the English Wikipedia article about it
  description: string | null; // Wikidata's own short English description (CC0)
}

/** A photo on Wikimedia Commons with what we must show next to it (docs/07, G1.2). */
export interface CommonsImage {
  file: string; // "File:Jog Falls at Shimoga.jpg"
  url: string; // 960 px wide (or the original when smaller)
  thumbUrl: string; // 330 px wide
  pageUrl: string; // the file's page on Commons: full credit and licence
  author: string | null; // plain text
  license: string; // "CC BY-SA 3.0", "Public domain"
  width: number; // of `url`
  height: number;
}

/** A Wikidata item with coordinates and an English name, to link places that have no id. */
export interface WikidataPlaceItem {
  id: string; // "Q672241"
  label: string;
  location: LngLat;
}

/** A file on Commons that has coordinates near a point (Commons geosearch). */
export interface CommonsGeoFile {
  file: string; // "File:Jog Falls at Shimoga.jpg"
  location: LngLat;
  distM: number; // from the point searched
}

export interface WikimediaProvider {
  /** Main image, whether it is a person, and coordinates of each item, by id ("Q672241"). */
  items(wikidataIds: string[]): Promise<Map<string, WikidataItem>>;
  /**
   * Items with coordinates and an English name inside a box [west, south, east, north], leaving
   * out settlements (items with a population): the candidates for linking our places.
   */
  itemsInBox(box: [number, number, number, number]): Promise<WikidataPlaceItem[]>;
  /** Credit, licence and sized URLs for Commons files, by file title; missing files are left out. */
  imageInfo(files: string[]): Promise<Map<string, CommonsImage>>;
  /** Files on Commons with coordinates within `radiusM` (at most 10,000) of a point, nearest first. */
  filesNear(point: LngLat, radiusM: number): Promise<CommonsGeoFile[]>;
  /**
   * Films and series with a filming location (P915) at these items (G12), by place item id; at
   * most WIKIDATA_BATCH ids. Wikidata is CC0.
   */
  filmsAt(wikidataIds: string[]): Promise<Map<string, WikidataFilm[]>>;
}

export interface WikidataFilm {
  qid: string;
  title: string;
  year: number | null;
}

/** Files per geosearch request (the API's limit for an anonymous client). */
export const GEOSEARCH_LIMIT = 50;

/** Wikidata ids per image query, and Commons titles per imageinfo request (the API's limit). */
export const WIKIDATA_BATCH = 200;
export const COMMONS_BATCH = 50;
