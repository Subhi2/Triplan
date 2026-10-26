import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { z } from "zod";
import type { OpenPlaceRecord, OpenPlacesProvider } from "./types";

// Overture Places read straight from Overture's public bucket with DuckDB, for the import scripts
// only (DuckDB is a dev dependency). Each release is a fixed download: nothing in the app calls
// Overture, and the rows we keep are stored by us (CLAUDE.md, "Choosing new features").

export const OVERTURE_STAC_URL = "https://stac.overturemaps.org/catalog.json";
const BUCKET = "s3://overturemaps-us-west-2/release";
const RELEASE_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/;

const catalogSchema = z.object({ latest: z.string().regex(RELEASE_PATTERN) });

/** The newest release named by Overture's STAC catalog. */
export async function latestOvertureRelease(userAgent: string): Promise<string> {
  const res = await fetch(OVERTURE_STAC_URL, { headers: { "User-Agent": userAgent } });
  if (!res.ok) throw new Error(`Overture catalog: HTTP ${res.status}`);
  return catalogSchema.parse(await res.json()).latest;
}

const rowSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  confidence: z.number().min(0).max(1).nullable(),
  basic_category: z.string(),
  detail_category: z.string().nullable(),
  datasets: z.array(z.string()).nullable(),
  licenses: z.array(z.string()).nullable(),
  operating_status: z.string().nullable(),
  locality: z.string().nullable(),
  website: z.string().nullable(),
});

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

export async function createOvertureProvider(release: string): Promise<OpenPlacesProvider> {
  if (!RELEASE_PATTERN.test(release)) throw new Error(`Not an Overture release: ${release}`);
  const instance = await DuckDBInstance.create(":memory:");
  const connection: DuckDBConnection = await instance.connect();
  await connection.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';");
  const files = `${BUCKET}/${release}/theme=places/type=place/*`;

  return {
    release,
    async placesInBox([west, south, east, north], basicCategories) {
      for (const n of [west, south, east, north]) {
        if (!Number.isFinite(n)) throw new Error("Bad box");
      }
      if (basicCategories.length === 0) return [];
      // Points have xmin = xmax, so the bbox column filters the box and gives the coordinates;
      // Overture's files are sorted so DuckDB reads only the row groups in the box.
      const reader = await connection.runAndReadAll(`
        SELECT id, names.primary AS name, bbox.xmin AS lng, bbox.ymin AS lat, confidence,
               basic_category, taxonomy.primary AS detail_category,
               list_distinct(list_transform(sources, s -> s.dataset)) AS datasets,
               list_distinct(list_transform(sources, s -> s.license)) AS licenses,
               operating_status, addresses[1].locality AS locality, websites[1] AS website
        FROM read_parquet('${files}')
        WHERE bbox.xmin BETWEEN ${west} AND ${east} AND bbox.ymin BETWEEN ${south} AND ${north}
          AND basic_category IN (${basicCategories.map(quote).join(", ")})`);
      return reader.getRowObjectsJson().flatMap((raw): OpenPlaceRecord[] => {
        const parsed = rowSchema.safeParse(raw);
        if (!parsed.success || !parsed.data.name?.trim()) return [];
        const r = parsed.data;
        return [
          {
            id: r.id,
            name: r.name!.trim(),
            lng: r.lng,
            lat: r.lat,
            confidence: r.confidence,
            basicCategory: r.basic_category,
            detailCategory: r.detail_category,
            datasets: r.datasets ?? [],
            licenses: r.licenses ?? [],
            operatingStatus: r.operating_status,
            locality: r.locality,
            website: r.website,
          },
        ];
      });
    },
    close() {
      connection.closeSync();
      instance.closeSync();
    },
  };
}
