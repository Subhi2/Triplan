ALTER TABLE "place" ADD COLUMN "population" integer;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "osm_tags" jsonb;--> statement-breakpoint
CREATE INDEX "place_category_idx" ON "place" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "place_osm_id_key" ON "place" USING btree ("osm_id");