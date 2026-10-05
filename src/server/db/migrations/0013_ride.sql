-- Famous rides (docs/02, "Famous rides"): routed once by pnpm db:seed-rides. Public, read-only:
-- RLS on with a read policy, writes only by the server role. New table only.
CREATE TABLE "ride" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"blurb" text NOT NULL,
	"region" text NOT NULL,
	"vehicle" "vehicle" DEFAULT 'bike' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"best_months" smallint[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"stops" jsonb NOT NULL,
	"route_geom" geography(LineString, 4326) NOT NULL,
	"distance_m" integer NOT NULL,
	"duration_s" integer NOT NULL,
	"road_mix" jsonb,
	"curvature" jsonb,
	"profile" jsonb,
	"ascent_m" integer,
	"hairpins" smallint DEFAULT 0 NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ride" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ride_read ON public.ride FOR SELECT TO anon, authenticated USING (true);
