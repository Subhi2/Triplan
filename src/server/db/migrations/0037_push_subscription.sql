CREATE TABLE "push_subscription" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"rider_id" uuid NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_rider_id_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."rider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscription_rider_idx" ON "push_subscription" USING btree ("rider_id");
--> statement-breakpoint
-- Read and written only by our server (DATABASE_URL), never through Supabase's public API.
ALTER TABLE "push_subscription" ENABLE ROW LEVEL SECURITY;
