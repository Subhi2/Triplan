CREATE TABLE "ride_photo_block" (
	"ride_slug" text NOT NULL,
	"file" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_photo_block_ride_slug_file_pk" PRIMARY KEY("ride_slug","file")
);
--> statement-breakpoint
-- Read and written only by our server (DATABASE_URL), never through Supabase's public API.
ALTER TABLE "ride_photo_block" ENABLE ROW LEVEL SECURITY;
