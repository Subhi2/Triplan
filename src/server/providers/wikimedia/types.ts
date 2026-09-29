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

export interface WikimediaProvider {
  /** The main image (Wikidata P18) of each item that has one, by Wikidata id ("Q672241"). */
  imageFiles(wikidataIds: string[]): Promise<Map<string, string>>;
  /** Credit, licence and sized URLs for Commons files, by file title; missing files are left out. */
  imageInfo(files: string[]): Promise<Map<string, CommonsImage>>;
}

/** Wikidata ids per image query, and Commons titles per imageinfo request (the API's limit). */
export const WIKIDATA_BATCH = 200;
export const COMMONS_BATCH = 50;
