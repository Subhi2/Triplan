CREATE TABLE "ride_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rider_id" uuid NOT NULL,
	"ridden_on" date NOT NULL,
	"title" text NOT NULL,
	"distance_km" real NOT NULL,
	"hairpins" smallint DEFAULT 0 NOT NULL,
	"climb_m" integer,
	"trip_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ride_log" ADD CONSTRAINT "ride_log_rider_id_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."rider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ride_log_rider_idx" ON "ride_log" USING btree ("rider_id","ridden_on");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_log_trip_idx" ON "ride_log" USING btree ("rider_id","trip_id");
--> statement-breakpoint
-- Read and written only by our server (DATABASE_URL), never through Supabase's public API.
ALTER TABLE "ride_log" ENABLE ROW LEVEL SECURITY;
