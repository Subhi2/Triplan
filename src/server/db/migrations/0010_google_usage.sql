-- Daily Google call budget (docs/02, "Google Maps Platform"). Server only: RLS on, no policies.
CREATE TABLE "google_usage" (
	"day" date NOT NULL,
	"sku" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "google_usage_day_sku_pk" PRIMARY KEY("day","sku")
);
--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "google_place_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "google_usage" ENABLE ROW LEVEL SECURITY;
