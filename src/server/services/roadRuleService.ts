import { sql, type SQL } from "drizzle-orm";
import type { LineString } from "geojson";
import type { RoadRuleSource, RuleKind, RuleOnRoute } from "@/lib/roadRules";
import { getDb } from "../db";
import { normalizeDistrictName } from "./districtImportService";
import { isOsmRegionKey } from "./osmRegions";

// Road rules (docs/02, "Road rules and permits"): stored by `pnpm db:seed-road-rules` from
// data/road-rules.json, and found along a route by rules_along_route (migration 0020).

interface RuleRawRow extends Record<string, unknown> {
  slug: string;
  kind: RuleKind;
  title: string;
  closed_from: string | null;
  closed_to: string | null;
  vehicles: string[];
  months: number[];
  link: string;
  source: string | null;
  checked_on: string;
  note: string | null;
  km_from: number | string;
  km_to: number | string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The rules the route meets, in km order. */
export async function rulesAlongRoute(geometry: LineString): Promise<RuleOnRoute[]> {
  const rows = await getDb().execute<RuleRawRow>(sql`
    SELECT slug, kind, title, closed_from, closed_to, vehicles, months, link, source,
           checked_on::text AS checked_on, note, km_from, km_to
    FROM rules_along_route(${JSON.stringify(geometry)})`);
  return rows.map((r) => ({
    slug: r.slug,
    kind: r.kind,
    title: r.title,
    kmFrom: round1(Number(r.km_from)),
    kmTo: round1(Number(r.km_to)),
    closedFrom: r.closed_from,
    closedTo: r.closed_to,
    vehicles: r.vehicles,
    months: r.months.map(Number),
    link: r.link,
    source: r.source,
    checkedOn: r.checked_on,
    note: r.note,
  }));
}

const textArray = (values: string[]) =>
  sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;

/**
 * The SQL for a rule's area or road, as geography. A road is routed by the caller first and
 * comes as its line; districts and states are the union of our district outlines, so
 * `pnpm db:import-districts` must have run for them.
 */
export async function ruleGeometry(
  where: RoadRuleSource["where"],
  routedLine: LineString | null,
): Promise<SQL> {
  if ("road" in where) {
    if (!routedLine) throw new Error("A road rule needs its routed line");
    return sql`ST_GeomFromGeoJSON(${JSON.stringify(routedLine)})::geography`;
  }
  if ("circles" in where) {
    const circles = where.circles.map(
      ({ center: [lng, lat], radiusKm }) =>
        sql`ST_Buffer(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusKm * 1000})::geometry`,
    );
    return sql`ST_Multi(ST_Union(ARRAY[${sql.join(circles, sql`, `)}]))::geography`;
  }
  if (!isOsmRegionKey(where.state)) throw new Error(`Unknown state ${where.state}`);
  if ("districts" in where) {
    const names = where.districts.map(normalizeDistrictName);
    const [row] = await getDb().execute<{ found: string[] }>(sql`
      SELECT coalesce(array_agg(name), '{}') AS found FROM district
      WHERE region = ${where.state} AND names && ${textArray(names)}`);
    if ((row?.found.length ?? 0) < names.length) {
      throw new Error(
        `Districts ${where.districts.join(", ")} in ${where.state}: found ${row?.found.join(", ") || "none"}`,
      );
    }
    return sql`(SELECT ST_Multi(ST_Union(geom::geometry))::geography FROM district
      WHERE region = ${where.state} AND names && ${textArray(names)})`;
  }
  const [row] = await getDb().execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM district WHERE region = ${where.state}`,
  );
  if (!row?.n) throw new Error(`No districts for ${where.state}: run pnpm db:import-districts`);
  return sql`(SELECT ST_Multi(ST_Union(geom::geometry))::geography FROM district
    WHERE region = ${where.state})`;
}

/** Writes one rule (insert or replace by slug). */
export async function upsertRoadRule(rule: RoadRuleSource, geom: SQL): Promise<void> {
  const v = {
    closedFrom: rule.closed?.from ?? null,
    closedTo: rule.closed?.to ?? null,
    vehicles: textArray(rule.vehicles),
    months: sql`ARRAY[${sql.join(
      rule.months.map((m) => sql`${m}`),
      sql`, `,
    )}]::smallint[]`,
  };
  await getDb().execute(sql`
    INSERT INTO road_rule (slug, kind, title, geom, closed_from, closed_to, vehicles, months,
                           link, source, checked_on, note, seeded_at)
    VALUES (${rule.slug}, ${rule.kind}, ${rule.title}, ${geom}, ${v.closedFrom}, ${v.closedTo},
            ${v.vehicles}, ${v.months}, ${rule.link}, ${rule.source ?? null},
            ${rule.checkedOn}::date, ${rule.note ?? null}, now())
    ON CONFLICT (slug) DO UPDATE SET
      kind = excluded.kind, title = excluded.title, geom = excluded.geom,
      closed_from = excluded.closed_from, closed_to = excluded.closed_to,
      vehicles = excluded.vehicles, months = excluded.months, link = excluded.link,
      source = excluded.source, checked_on = excluded.checked_on, note = excluded.note,
      seeded_at = now()`);
}

/** Deletes rules no longer in the file. Returns their slugs. */
export async function deleteRoadRulesExcept(slugs: string[]): Promise<string[]> {
  const rows = await getDb().execute<{ slug: string }>(sql`
    DELETE FROM road_rule WHERE NOT (slug = ANY (${textArray(slugs)})) RETURNING slug`);
  return rows.map((r) => r.slug);
}
