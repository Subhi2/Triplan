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
}

/** Wikidata ids per image query, and Commons titles per imageinfo request (the API's limit). */
export const WIKIDATA_BATCH = 200;
export const COMMONS_BATCH = 50;
