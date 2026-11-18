import { sql } from "drizzle-orm";
import type { PhotoCredit } from "@/lib/media";
import { getDb } from "../db";

/**
 * The credit (author, licence, source) of each thumbnail shown in a list, in one query, so every
 * photo on screen carries its credit (CLAUDE.md). Thumbnails with no credit found are left out.
 */
export async function photoCredits(
  thumbUrls: (string | null)[],
): Promise<Map<string, PhotoCredit>> {
  const urls = [...new Set(thumbUrls.filter((u): u is string => !!u))];
  if (urls.length === 0) return new Map();
  const rows = await getDb().execute<{
    thumb_url: string;
    author: string | null;
    license: string;
    source: string;
  }>(sql`
    SELECT DISTINCT ON (thumb_url) thumb_url, author, license, source
    FROM media
    WHERE thumb_url = ANY(${sql.param(urls)}::text[]) AND status = 'verified'
    ORDER BY thumb_url, created_at
  `);
  return new Map(
    [...rows].map((r) => [r.thumb_url, { author: r.author, license: r.license, source: r.source }]),
  );
}
