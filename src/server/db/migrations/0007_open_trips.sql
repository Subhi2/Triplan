-- Saved trips are open (no sign-in): every trip is public, and it remembers the route option
-- the user picked. See docs/03-data-model.md ("Trips").
ALTER TABLE "trip" ALTER COLUMN "is_public" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "trip" ADD COLUMN "route_id" text;--> statement-breakpoint
ALTER TABLE "trip" ADD COLUMN "via_label" text;--> statement-breakpoint
CREATE INDEX "trip_updated_at_idx" ON "trip" USING btree ("updated_at" DESC NULLS LAST);