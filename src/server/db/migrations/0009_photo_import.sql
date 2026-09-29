ALTER TABLE "place" ADD COLUMN "photos_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "media_place_url_key" ON "media" USING btree ("place_id","url");