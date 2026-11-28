CREATE TABLE "place_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"device_hash" text NOT NULL,
	"status" "place_status" DEFAULT 'unverified' NOT NULL,
	"moderation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_flag_kind_check" CHECK ("place_flag"."kind" IN ('closed', 'wrong_location', 'wrong_category', 'duplicate', 'other'))
);
--> statement-breakpoint
ALTER TABLE "place_flag" ADD CONSTRAINT "place_flag_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "place_flag_place_device_idx" ON "place_flag" USING btree ("place_id","device_hash");--> statement-breakpoint
CREATE INDEX "place_flag_status_idx" ON "place_flag" USING btree ("status","created_at");--> statement-breakpoint
-- Read and written only by our server (DATABASE_URL), never through Supabase's public API.
ALTER TABLE "place_flag" ENABLE ROW LEVEL SECURITY;
