/** Where a photo comes from, as shown in its credit line. */
export const MEDIA_SOURCES: Record<string, string> = {
  wikimedia: "Wikimedia Commons",
  user: "Rider photo",
};

export function mediaSourceName(source: string): string {
  return MEDIA_SOURCES[source] ?? source;
}

/** Who took a photo and under which licence, shown next to it wherever it appears. */
export interface PhotoCredit {
  author: string | null;
  license: string;
  source: string;
}

/** "photo Aravind K G · CC BY-SA 3.0", the short credit under a thumbnail. */
export function shortCredit(c: PhotoCredit): string {
  return `photo ${c.author ?? "unknown"} · ${c.license}`;
}
