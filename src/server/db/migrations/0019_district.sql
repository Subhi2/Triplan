-- Districts (docs/02, "Alerts on the route"): India's districts from OpenStreetMap with their LGD
-- codes, so official alerts that name districts by code can be matched to a route. New table and
-- function only.
CREATE TABLE "district" (
	"osm_id" text PRIMARY KEY NOT NULL,
	"lgd_code" integer,
	"name" text NOT NULL,
	"names" text[] DEFAULT '{}'::text[] NOT NULL,
	"region" text NOT NULL,
	"geom" geography(MultiPolygon, 4326) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "district_lgd_code_key" ON "district" USING btree ("lgd_code");--> statement-breakpoint
CREATE INDEX "district_geom_gix" ON "district" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "district_region_idx" ON "district" USING btree ("region");--> statement-breakpoint
ALTER TABLE "district" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY district_read ON public.district FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint
-- Hand-written: the districts a route passes through, with the km where it first enters each
-- (as places_along_route does for park outlines, 0016), in km order.
CREATE OR REPLACE FUNCTION public.districts_along_route(geojson text)
RETURNS TABLE (
  lgd_code integer,
  name text,
  names text[],
  region text,
  km_from_start double precision
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
  )
  SELECT d.lgd_code, d.name, d.names, d.region,
         (SELECT min(ST_LineLocatePoint(rl.sg, p.geom))
          FROM ST_DumpPoints(ST_Intersection(rl.sg, d.geom::geometry)) p) * rl.len / 1000 AS km
  FROM rl
  JOIN district d ON ST_Intersects(d.geom, rl.simple)
  ORDER BY km;
$$;
