ALTER TABLE "ride" ADD COLUMN "tier" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "ride" ADD CONSTRAINT "ride_tier_check" CHECK ("ride"."tier" IN ('classic', 'legend'));