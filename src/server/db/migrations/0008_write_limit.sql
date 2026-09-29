-- Per-visitor limit on saving and renaming trips (no sign-in). Server only: RLS on, no policies.
CREATE TABLE "write_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "write_limit" ENABLE ROW LEVEL SECURITY;
