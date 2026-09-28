// Loads categories, carry items, towns and places from docs/06-seed-data.md.
// Idempotent: upserts on slug, and replaces each seeded place's guide and carry rows.
// Run with `pnpm db:seed` (reads DATABASE_URL from .env.local).
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { closeDb, getDb } from "../src/server/db";
import { carryItem, category, place, placeCarry, placeGuide } from "../src/server/db/schema";

const SEED_DOC = "docs/06-seed-data.md";

// Display metadata for the slugs listed in the seed doc. Icons are lucide icon names.
const CATEGORY_META: Record<string, { name: string; icon: string; weight?: number }> = {
  temple: { name: "Temple", icon: "landmark" },
  heritage: { name: "Heritage", icon: "castle", weight: 1.2 },
  fort: { name: "Fort", icon: "castle" },
  viewpoint: { name: "Viewpoint", icon: "binoculars", weight: 1.1 },
  waterfall: { name: "Waterfall", icon: "droplets", weight: 1.1 },
  trek: { name: "Trek", icon: "footprints" },
  lake: { name: "Lake", icon: "waves" },
  beach: { name: "Beach", icon: "umbrella" },
  food: { name: "Food", icon: "utensils", weight: 0.8 },
  coffee: { name: "Coffee", icon: "coffee", weight: 0.8 },
  fuel: { name: "Fuel", icon: "fuel", weight: 0.5 },
  stay: { name: "Stay", icon: "bed", weight: 0.7 },
  town: { name: "Town", icon: "building-2", weight: 0 },
};

const CARRY_META: Record<string, { name: string; icon: string }> = {
  raincoat: { name: "Raincoat", icon: "cloud-rain" },
  leech_socks: { name: "Leech socks", icon: "bug" },
  cash: { name: "Cash", icon: "banknote" },
  torch: { name: "Torch", icon: "flashlight" },
  jacket: { name: "Jacket", icon: "shirt" },
  gloves: { name: "Gloves", icon: "hand" },
  water_2l: { name: "Water (2 L)", icon: "cup-soda" },
  cap: { name: "Cap", icon: "sun" },
  trekking_shoes: { name: "Trekking shoes", icon: "footprints" },
  grip_shoes: { name: "Shoes with good grip", icon: "footprints" },
  socks_hot_rock: { name: "Socks for hot rock", icon: "thermometer-sun" },
  modest_clothing: { name: "Modest clothing", icon: "shirt" },
  traditional_attire: { name: "Traditional attire", icon: "shirt" },
  snacks: { name: "Snacks", icon: "cookie" },
  dry_bag: { name: "Dry bag", icon: "backpack" },
  spare_clothes: { name: "Spare clothes", icon: "shirt" },
  power_bank: { name: "Power bank", icon: "battery-charging" },
  first_aid: { name: "First aid kit", icon: "cross" },
  forest_permit: { name: "Forest permit", icon: "file-check" },
};

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

type SeedPlace = z.infer<typeof seedPlace>;

function slugify(s: string): string {
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

function withMeta<T>(slugs: string[], meta: Record<string, T>, kind: string) {
  return slugs.map((slug) => {
    const m = meta[slug];
    if (!m) throw new Error(`No display metadata for ${kind} "${slug}"; add it in scripts/seed.ts`);
    return { slug, ...m };
  });
}

async function main() {
  const doc = await readFile(SEED_DOC, "utf8");
  const categories = withMeta(inlineList(doc, "Categories"), CATEGORY_META, "category");
  const carryItems = withMeta(inlineList(doc, "Carry items"), CARRY_META, "carry item");
  const places = z.array(seedPlace).parse(jsonBlock(doc, "Places"));
  const towns = z.array(seedTown).parse(jsonBlock(doc, "Towns"));

  const db = getDb();
  await db.transaction(async (tx) => {
    const catRows = await tx
      .insert(category)
      .values(categories)
      .onConflictDoUpdate({
        target: category.slug,
        set: {
          name: sql`excluded.name`,
          icon: sql`excluded.icon`,
          weight: sql`excluded.weight`,
        },
      })
      .returning({ id: category.id, slug: category.slug });
    const categoryId = new Map(catRows.map((r) => [r.slug, r.id]));

    const itemRows = await tx
      .insert(carryItem)
      .values(carryItems)
      .onConflictDoUpdate({
        target: carryItem.slug,
        set: { name: sql`excluded.name`, icon: sql`excluded.icon` },
      })
      .returning({ id: carryItem.id, slug: carryItem.slug });
    const itemId = new Map(itemRows.map((r) => [r.slug, r.id]));

    const lookup = (map: Map<string, number>, slug: string, where: string) => {
      const id = map.get(slug);
      if (id === undefined) throw new Error(`Unknown slug "${slug}" in ${where}`);
      return id;
    };

    const placeRows = [
      ...places.map((p: SeedPlace) => ({
        slug: p.slug,
        name: p.name,
        categoryId: lookup(categoryId, p.category, `place ${p.slug}`),
        location: [p.lng, p.lat] as [number, number],
        district: p.district ?? null,
      })),
      ...towns.map((t) => ({
        slug: slugify(t.name),
        name: t.name,
        categoryId: lookup(categoryId, "town", "towns"),
        location: [t.lng, t.lat] as [number, number],
        district: null,
      })),
    ].map((p) => ({ ...p, state: "Karnataka", status: "verified" as const, source: "curated" }));

    const upserted = await tx
      .insert(place)
      .values(placeRows)
      .onConflictDoUpdate({
        target: place.slug,
        set: {
          name: sql`excluded.name`,
          categoryId: sql`excluded.category_id`,
          location: sql`excluded.location`,
          district: sql`excluded.district`,
          state: sql`excluded.state`,
          status: sql`excluded.status`,
          source: sql`excluded.source`,
        },
      })
      .returning({ id: place.id, slug: place.slug });
    const placeId = new Map(upserted.map((r) => [r.slug, r.id]));

    for (const p of places) {
      const id = placeId.get(p.slug);
      if (!id) throw new Error(`Place ${p.slug} was not upserted`);
      const g = p.guide;
      const guide = {
        bestVehicles: g.best_vehicles,
        lastMileNote: g.last_mile_note ?? null,
        roadCondition: g.road_condition ?? null,
        bestMonths: g.best_months,
        okMonths: g.ok_months,
        avoidMonths: g.avoid_months,
        bestTimeOfDay: g.best_time_of_day ?? null,
        visitDurationMin: g.visit_duration_min ?? null,
        timings: g.timings ?? null,
        entryFee: g.entry_fee ?? null,
        dressCode: g.dress_code ?? null,
        permitNeeded: g.permit_needed ?? null,
        notes: g.notes ?? null,
      };
      await tx
        .insert(placeGuide)
        .values({ placeId: id, ...guide })
        .onConflictDoUpdate({ target: placeGuide.placeId, set: guide });

      await tx.delete(placeCarry).where(eq(placeCarry.placeId, id));
      if (p.carry.length > 0) {
        await tx.insert(placeCarry).values(
          p.carry.map(([slug, months]) => ({
            placeId: id,
            itemId: lookup(itemId, slug, `carry of ${p.slug}`),
            months,
          })),
        );
      }
    }
  });

  console.log(
    `Seeded ${categories.length} categories, ${carryItems.length} carry items, ` +
      `${places.length} places and ${towns.length} towns.`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
