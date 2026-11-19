CREATE TABLE "ride_mark" (
	"rider_id" uuid NOT NULL,
	"ride_slug" text NOT NULL,
	"status" text NOT NULL,
	"done_on" date,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_mark_rider_id_ride_slug_pk" PRIMARY KEY("rider_id","ride_slug"),
	CONSTRAINT "ride_mark_status_check" CHECK ("ride_mark"."status" IN ('pending', 'done'))
);
--> statement-breakpoint
ALTER TABLE "ride_mark" ADD CONSTRAINT "ride_mark_rider_id_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."rider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_mark" ENABLE ROW LEVEL SECURITY;
