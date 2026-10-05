-- Usage counters per UTC day (docs/02, "Usage numbers"). Server only: RLS on, no policies.
-- New table only.
CREATE TABLE "usage_daily" (
	"day" date NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_day_key_pk" PRIMARY KEY("day","key")
);
--> statement-breakpoint
ALTER TABLE "usage_daily" ENABLE ROW LEVEL SECURITY;
