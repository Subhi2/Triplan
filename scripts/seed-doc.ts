// Parses docs/06-seed-data.md, the source of truth for seed data.
import { readFile } from "node:fs/promises";
import { z } from "zod";

export const SEED_DOC = "docs/06-seed-data.md";

const month = z.number().int().min(1).max(12);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

const seedPlace = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  category: z.string(),
  lat,
  lng,
  district: z.string().optional(),
  osm_id: z
    .string()
    .regex(/^(node|way|relation)\/\d+$/)
    .optional(),
  guide: z
    .object({
      best_vehicles: z.array(z.enum(["bike", "car", "suv_4x4", "on_foot", "bus"])).default([]),
      last_mile_note: z.string().optional(),
      road_condition: z.string().optional(),
      best_months: z.array(month).default([]),
      ok_months: z.array(month).default([]),
      avoid_months: z.array(month).default([]),
      best_time_of_day: z.string().optional(),
      visit_duration_min: z.number().int().positive().optional(),
      timings: z.string().optional(),
      entry_fee: z.string().optional(),
      dress_code: z.string().optional(),
      permit_needed: z.string().optional(),
      notes: z.string().optional(),
    })
    .strict(),
  carry: z.array(z.tuple([z.string(), z.array(month)])).default([]),
});

const seedTown = z.object({ name: z.string().min(1), lat, lng });

export type SeedPlace = z.infer<typeof seedPlace>;
export type SeedTown = z.infer<typeof seedTown>;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Returns the inline `a, b, c` list under a "## heading". */
function inlineList(doc: string, heading: string): string[] {
  const match = new RegExp(`## ${heading}\\s+\`([^\`]+)\``).exec(doc);
  if (!match?.[1]) throw new Error(`No inline list under "## ${heading}" in ${SEED_DOC}`);
  return match[1].split(",").map((s) => s.trim());
}

/** Returns the parsed ```json block under a "## heading". */
function jsonBlock(doc: string, heading: string): unknown {
  const match = new RegExp(`## ${heading}[^\\n]*\\n+\`\`\`json\\n([\\s\\S]*?)\`\`\``).exec(doc);
  if (!match?.[1]) throw new Error(`No json block under "## ${heading}" in ${SEED_DOC}`);
  return JSON.parse(match[1]);
}

export async function readSeedDoc() {
  const doc = await readFile(SEED_DOC, "utf8");
  return {
    categorySlugs: inlineList(doc, "Categories"),
    carryItemSlugs: inlineList(doc, "Carry items"),
    places: z.array(seedPlace).parse(jsonBlock(doc, "Places")),
    towns: z.array(seedTown).parse(jsonBlock(doc, "Towns")),
  };
}
