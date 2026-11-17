/** Where a photo comes from, as shown in its credit line. */
export const MEDIA_SOURCES: Record<string, string> = {
  wikimedia: "Wikimedia Commons",
  user: "Rider photo",
};

export function mediaSourceName(source: string): string {
  return MEDIA_SOURCES[source] ?? source;
}
