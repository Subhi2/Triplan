-- Road rules (docs/02, "Road rules and permits"): night bans, permits, e-passes and fees, curated
-- in data/road-rules.json. New table and function only.
CREATE TABLE "road_rule" (
	"slug" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"geom" geography(Geometry, 4326) NOT NULL,
	"closed_from" text,
	"closed_to" text,
	"vehicles" text[] DEFAULT '{}'::text[] NOT NULL,
	"months" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"link" text NOT NULL,
	"source" text,
	"checked_on" date NOT NULL,
	"note" text,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "road_rule_kind_check" CHECK ("road_rule"."kind" IN ('night_ban', 'permit', 'epass', 'fee'))
);
--> statement-breakpoint
CREATE INDEX "road_rule_geom_gix" ON "road_rule" USING gist ("geom");--> statement-breakpoint
ALTER TABLE "road_rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY road_rule_read ON public.road_rule FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint
-- Hand-written: the rules a route meets, with the km where it meets each and leaves it. A rule on
-- a road counts when the route runs along it (within corridor_m) for 1 km or more, so crossing
-- the road does not; a rule on an area counts when the route goes 100 m or more into it.
CREATE OR REPLACE FUNCTION public.rules_along_route(geojson text, corridor_m integer DEFAULT 150)
RETURNS TABLE (
  slug text,
  kind text,
  title text,
  closed_from text,
  closed_to text,
  vehicles text[],
  months smallint[],
  link text,
  source text,
  checked_on date,
  note text,
  km_from double precision,
  km_to double precision
)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH r AS MATERIALIZED (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326) AS g
  ), rl AS MATERIALIZED (
    SELECT len, sg, sg::geography AS simple
    FROM (
      SELECT ST_Length(g::geography) AS len,
             ST_Transform(ST_Simplify(ST_Transform(g, 3857), 50), 4326) AS sg
      FROM r
    ) s
  ), hits AS MATERIALIZED (
    SELECT rr.slug, rr.kind, rr.title, rr.closed_from, rr.closed_to, rr.vehicles, rr.months,
           rr.link, rr.source, rr.checked_on, rr.note, rl.sg, rl.len,
           GeometryType(rr.geom::geometry) LIKE '%LINESTRING' AS on_road,
           ST_Intersection(
             rl.sg,
             CASE WHEN GeometryType(rr.geom::geometry) LIKE '%LINESTRING'
                  THEN ST_Buffer(rr.geom, corridor_m)::geometry
                  ELSE rr.geom::geometry END
           ) AS part
    FROM rl
    JOIN road_rule rr ON ST_DWithin(rr.geom, rl.simple, corridor_m)
  ), measured AS (
    SELECT h.*,
           ST_Length(h.part::geography) AS part_m,
           (SELECT min(ST_LineLocatePoint(h.sg, p.geom)) FROM ST_DumpPoints(h.part) p) AS f_from,
           (SELECT max(ST_LineLocatePoint(h.sg, p.geom)) FROM ST_DumpPoints(h.part) p) AS f_to
    FROM hits h
  )
  SELECT m.slug, m.kind, m.title, m.closed_from, m.closed_to, m.vehicles, m.months, m.link,
         m.source, m.checked_on, m.note, m.f_from * m.len / 1000, m.f_to * m.len / 1000
  FROM measured m
  WHERE m.part_m >= CASE WHEN m.on_road THEN 1000 ELSE 100 END
  ORDER BY m.f_from;
$$;
