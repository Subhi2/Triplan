-- Riders' reviews, photos and road reports without sign-in (docs/02, "Reviews, photos and road
-- reports"). New tables, new nullable columns, and review.user_id may now be empty (riders'
-- reviews carry device_hash instead). No rows change.
CREATE TABLE "pow_spent" (
	"signature" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "road_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"nickname" text,
	"device_hash" text NOT NULL,
	"status" "place_status" DEFAULT 'unverified' NOT NULL,
	"moderation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "road_report_kind_check" CHECK ("road_report"."kind" IN ('closed', 'landslide', 'flooded', 'potholes', 'diversion'))
);
--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "device_hash" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "device_hash" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "moderation" jsonb;--> statement-breakpoint
CREATE INDEX "road_report_location_gix" ON "road_report" USING gist ("location");--> statement-breakpoint
CREATE INDEX "road_report_expires_idx" ON "road_report" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_place_device_key" ON "review" USING btree ("place_id","device_hash") WHERE "review"."device_hash" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "road_report" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY road_report_read ON public.road_report FOR SELECT TO anon, authenticated
  USING (status = 'verified' AND expires_at > now());--> statement-breakpoint
ALTER TABLE "pow_spent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Hand-written: approved road reports in force within corridor_m of a route, in km order, like
-- services_along_route (0015). Capped at 200.
CREATE OR REPLACE FUNCTION public.reports_along_route(geojson text, corridor_m integer)
RETURNS TABLE (
  id uuid,
  kind text,
  note text,
  nickname text,
  lng double precision,
  lat double precision,
  km_from_start double precision,
  detour_m double precision,
  created_at timestamptz,
  expires_at timestamptz
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
    SELECT rr.*, ST_LineLocatePoint(rl.sg, rr.location::geometry) * rl.len / 1000 AS km_from_start,
           ST_Distance(rr.location, rl.simple) AS detour_m
    FROM rl
    JOIN road_report rr ON ST_DWithin(rr.location, rl.simple, corridor_m)
    WHERE rr.status = 'verified' AND rr.expires_at > now()
    ORDER BY detour_m
    LIMIT 200
  )
  SELECT h.id, h.kind, h.note, h.nickname,
         ST_X(h.location::geometry), ST_Y(h.location::geometry),
         h.km_from_start, h.detour_m, h.created_at, h.expires_at
  FROM hits h
  ORDER BY h.km_from_start;
$$;
