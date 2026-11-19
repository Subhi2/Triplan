CREATE TABLE "ride_photo" (
	"ride_slug" text NOT NULL,
	"position" smallint NOT NULL,
	"file" text NOT NULL,
	"url" text NOT NULL,
	"thumb_url" text NOT NULL,
	"page_url" text NOT NULL,
	"caption" text NOT NULL,
	"author" text,
	"license" text NOT NULL,
	"km_from_start" real NOT NULL,
	"width" smallint NOT NULL,
	"height" smallint NOT NULL,
	CONSTRAINT "ride_photo_ride_slug_position_pk" PRIMARY KEY("ride_slug","position")
);
--> statement-breakpoint
ALTER TABLE "ride_photo" ENABLE ROW LEVEL SECURITY;
