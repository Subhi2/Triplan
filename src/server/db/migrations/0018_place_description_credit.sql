-- Credit for imported place descriptions (docs/04, Growth G4 step C2): where the text comes from,
-- its licence and the page to link, and when the import last looked. Additive: new nullable columns.
ALTER TABLE "place" ADD COLUMN "description_source" text;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "description_license" text;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "description_url" text;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "description_checked_at" timestamp with time zone;