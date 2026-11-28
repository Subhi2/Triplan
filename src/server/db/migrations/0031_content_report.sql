CREATE TABLE "content_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"note" text NOT NULL,
	"contact" text,
	"device_hash" text NOT NULL,
	"status" "place_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_report_kind_check" CHECK ("content_report"."kind" IN ('copyright', 'privacy', 'harmful', 'wrong', 'other'))
);
--> statement-breakpoint
CREATE INDEX "content_report_status_idx" ON "content_report" USING btree ("status","created_at");--> statement-breakpoint
-- Read and written only by our server (DATABASE_URL), never through Supabase's public API.
ALTER TABLE "content_report" ENABLE ROW LEVEL SECURITY;
