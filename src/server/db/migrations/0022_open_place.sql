-- Open places (docs/02, "Open places from Overture"): fuel, food and coffee from Overture Places,
-- kept apart from places so they get no pages and stay out of the place list. New table and
-- function only.
CREATE TABLE "open_place" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"confidence" real NOT NULL,
	"license" text NOT NULL,
	"datasets" text[] NOT NULL,
	"region" text NOT NULL,
	"release" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_place_category_check" CHECK ("open_place"."category" IN ('fuel', 'food', 'coffee'))
);
--> statement-breakpoint
CREATE INDEX "open_place_location_gix" ON "open_place" USING gist ("location");--> statement-breakpoint
CREATE INDEX "open_place_region_idx" ON "open_place" USING btree ("region");
--> statement-breakpoint
ALTER TABLE "open_place" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY open_place_read ON public.open_place FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint
-- Hand-written: the open places within corridor_m of a route, in km order, like
-- services_along_route (0015). categories NULL means every category. Capped at 4000.
CREATE OR REPLACE FUNCTION public.open_places_along_route(
  geojson text,
  corridor_m integer,
  categories text[] DEFAULT NULL
)
RETURNS TABLE (
  id text,
  name text,
  category text,
  lng double precision,
  lat double precision,
  km_from_start double precision,
  detour_m double precision
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
    SELECT op.id, op.name, op.category, op.location,
           ST_LineLocatePoint(rl.sg, op.location::geometry) * rl.len / 1000 AS km_from_start,
           ST_Distance(op.location, rl.simple) AS detour_m
    FROM rl
    JOIN open_place op ON ST_DWithin(op.location, rl.simple, corridor_m)
    WHERE categories IS NULL OR op.category = ANY (categories)
    ORDER BY detour_m
    LIMIT 4000
  )
  SELECT h.id, h.name, h.category,
         ST_X(h.location::geometry), ST_Y(h.location::geometry),
         h.km_from_start, h.detour_m
  FROM hits h
  ORDER BY h.km_from_start;
$$;
