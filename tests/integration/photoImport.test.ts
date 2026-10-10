import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db";
import type { CommonsImage, WikimediaProvider } from "@/server/providers/wikimedia";
import { importWikimediaPhotos, placesNeedingPhotos } from "@/server/services/photoImportService";

// Two test places with made-up Wikidata ids: one whose item has an image, one without. The run
// is limited to them (onlyIds) so it never touches real places.
describe.skipIf(!process.env.DATABASE_URL)("Wikimedia photo import", () => {
  const tag = Date.now();
  const slugs = [`test-photo-yes-${tag}`, `test-photo-no-${tag}`];
  const QID_YES = `Q9${String(tag).slice(-9)}1`;
  const QID_NO = `Q9${String(tag).slice(-9)}2`;
  const image: CommonsImage = {
    file: "File:Test fort.jpg",
    url: `https://upload.wikimedia.org/test/${tag}/960px-Test_fort.jpg`,
    thumbUrl: `https://upload.wikimedia.org/test/${tag}/330px-Test_fort.jpg`,
    pageUrl: "https://commons.wikimedia.org/wiki/File:Test_fort.jpg",
    author: "A. Photographer",
    license: "CC BY-SA 4.0",
    width: 960,
    height: 640,
  };
  const asked: string[][] = [];
  const provider: WikimediaProvider = {
    items: async (ids) => {
      asked.push(ids);
      return new Map(
        ids
          .filter((id) => id === QID_YES)
          .map((id) => [id, { file: image.file, human: false, location: null }]),
      );
    },
    imageInfo: async (files) => new Map(files.map((f) => [f, image])),
  };
  let ids: string[] = [];

  beforeAll(async () => {
    for (const [slug, qid] of [
      [slugs[0]!, QID_YES],
      [slugs[1]!, QID_NO],
    ]) {
      const [row] = await getDb().execute<{ id: string }>(sql`
        INSERT INTO place (slug, name, category_id, location, source, status, wikidata_id)
        SELECT ${slug}, ${slug}, id, ST_SetSRID(ST_MakePoint(75.7581, 12.9173), 4326)::geography,
               'curated', 'verified', ${qid}
        FROM category WHERE slug = 'fort'
        RETURNING id`);
      ids.push(row!.id);
    }
  });

  afterAll(async () => {
    await getDb().execute(sql`DELETE FROM place WHERE slug IN (${slugs[0]!}, ${slugs[1]!})`);
    await closeDb();
    ids = [];
  });

  it("stores the photo with its credit and marks both places as checked", async () => {
    expect(await placesNeedingPhotos(10, ids)).toHaveLength(2);

    const result = await importWikimediaPhotos(provider, { limit: 10, onlyIds: ids, pauseMs: 0 });
    expect(result).toEqual({ checked: 2, found: 1, rejected: 0 });
    expect(asked.flat().sort()).toEqual([QID_YES, QID_NO].sort());

    const media = await getDb().execute(sql`
      SELECT p.slug, m.url, m.thumb_url, m.author, m.license, m.author_url, m.source, m.status
      FROM media m JOIN place p ON p.id = m.place_id
      WHERE p.id = ANY(${sql.param(ids)}::uuid[])`);
    expect(media).toEqual([
      {
        slug: slugs[0],
        url: image.url,
        thumb_url: image.thumbUrl,
        author: "A. Photographer",
        license: "CC BY-SA 4.0",
        author_url: image.pageUrl,
        source: "wikimedia",
        status: "verified",
      },
    ]);

    // Both are checked now, so a second run asks for nothing.
    expect(await placesNeedingPhotos(10, ids)).toEqual([]);
    expect(await importWikimediaPhotos(provider, { limit: 10, onlyIds: ids, pauseMs: 0 })).toEqual({
      checked: 0,
      found: 0,
    });
  });
});
