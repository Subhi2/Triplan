-- Service points (docs/02, "Safety stops"): hospitals, police, ATMs, tyre and repair shops and
-- stays from OpenStreetMap, kept apart from places. New table and function only.
CREATE TABLE "service_point" (
	"osm_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"phone" text,
	"region" text NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_point_kind_check" CHECK ("service_point"."kind" IN ('hospital', 'police', 'atm', 'tyre', 'repair', 'stay'))
);
--> statement-breakpoint
CREATE INDEX "service_point_location_gix" ON "service_point" USING gist ("location");--> statement-breakpoint
CREATE INDEX "service_point_region_idx" ON "service_point" USING btree ("region");--> statement-breakpoint
ALTER TABLE "service_point" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY service_point_read ON public.service_point FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint
-- Hand-written: the service points within corridor_m of a route, in km order, like
-- places_along_route (0006): the route simplified once (50 m), km along it and the straight-line
-- detour. kinds NULL means every kind. Capped at 4000 (a route through two cities).
CREATE OR REPLACE FUNCTION public.services_along_route(
  geojson text,
  corridor_m integer,
  kinds text[] DEFAULT NULL
)
RETURNS TABLE (
  osm_id text,
  kind text,
  name text,
  phone text,
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
    SELECT sp.osm_id, sp.kind, sp.name, sp.phone, sp.location,
           ST_LineLocatePoint(rl.sg, sp.location::geometry) * rl.len / 1000 AS km_from_start,
           ST_Distance(sp.location, rl.simple) AS detour_m
    FROM rl
    JOIN service_point sp ON ST_DWithin(sp.location, rl.simple, corridor_m)
    WHERE kinds IS NULL OR sp.kind = ANY (kinds)
    ORDER BY detour_m
    LIMIT 4000
  )
  SELECT h.osm_id, h.kind, h.name, h.phone,
         ST_X(h.location::geometry), ST_Y(h.location::geometry),
         h.km_from_start, h.detour_m
  FROM hits h
  ORDER BY h.km_from_start;
$$;
