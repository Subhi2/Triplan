import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

// Resume files for the OpenStreetMap imports (--resume): which tiles of a region were saved or
// split, so a run stopped by a dead network or a sleeping laptop goes on where it stopped instead
// of fetching every tile again. One small JSON file per import and region, never committed.

export const PROGRESS_DIR = ".import-progress";

const progressSchema = z.object({
  /** databaseNow() when the region's first run started: stale places are closed against it. */
  startedAt: z.string().min(1),
  /** Every tile succeeded: --resume skips the region. */
  complete: z.boolean(),
  /** Elements Overpass returned over every run, so a resumed region is not taken for empty. */
  elements: z.number().int().nonnegative(),
  /** The starting tile size when --tile-deg chose one, so a resume cuts the same tiles. */
  tileDeg: z.number().positive().optional(),
  done: z.array(z.string()),
  split: z.array(z.string()),
});

export type RegionProgress = z.infer<typeof progressSchema>;

export function progressPath(kind: string, region: string, dir = PROGRESS_DIR): string {
  return join(dir, `${kind}-${region}.json`);
}

/** The saved progress, or null when there is none or it cannot be read. */
export function readProgress(path: string): RegionProgress | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = progressSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Writes through a temporary file, so a run killed mid-write leaves the old file whole. */
export function writeProgress(path: string, progress: RegionProgress): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(progress));
  renameSync(tmp, path);
}
