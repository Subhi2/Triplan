-- Community (G6, docs/02 "Community (G6)"): riders' device accounts, clubs, hosted group rides
-- and their members. New tables only. Row level security is on with no policies: only the server
-- reads and writes them (never the browser through Supabase's REST API).
CREATE TABLE "club" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"home_label" text NOT NULL,
	"home_point" geography(Point, 4326),
	"vehicle" text DEFAULT 'any' NOT NULL,
	"join_policy" text DEFAULT 'approval' NOT NULL,
	"invite_token_hash" text,
	"whatsapp_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_slug_unique" UNIQUE("slug"),
	CONSTRAINT "club_vehicle_check" CHECK ("club"."vehicle" IN ('bike', 'car', 'any')),
	CONSTRAINT "club_join_policy_check" CHECK ("club"."join_policy" IN ('open', 'approval', 'invite'))
);
--> statement-breakpoint
CREATE TABLE "club_member" (
	"club_id" uuid NOT NULL,
	"rider_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_member_club_id_rider_id_pk" PRIMARY KEY("club_id","rider_id"),
	CONSTRAINT "club_member_role_check" CHECK ("club_member"."role" IN ('owner', 'admin', 'member')),
	CONSTRAINT "club_member_status_check" CHECK ("club_member"."status" IN ('pending', 'active', 'blocked'))
);
--> statement-breakpoint
CREATE TABLE "group_ride" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid,
	"trip_id" uuid NOT NULL,
	"title" text NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"meet_label" text NOT NULL,
	"meet_note" text DEFAULT '' NOT NULL,
	"meet_point" geography(Point, 4326),
	"seats" smallint NOT NULL,
	"vehicle" text DEFAULT 'bike' NOT NULL,
	"pace" text DEFAULT 'steady' NOT NULL,
	"needs" text[] DEFAULT '{}' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"join_policy" text DEFAULT 'approval' NOT NULL,
	"whatsapp_url" text,
	"room_id" text NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_ride_seats_check" CHECK ("group_ride"."seats" BETWEEN 1 AND 50),
	CONSTRAINT "group_ride_vehicle_check" CHECK ("group_ride"."vehicle" IN ('bike', 'car', 'any')),
	CONSTRAINT "group_ride_pace_check" CHECK ("group_ride"."pace" IN ('relaxed', 'steady', 'brisk')),
	CONSTRAINT "group_ride_visibility_check" CHECK ("group_ride"."visibility" IN ('public', 'club', 'link')),
	CONSTRAINT "group_ride_join_policy_check" CHECK ("group_ride"."join_policy" IN ('approval', 'open')),
	CONSTRAINT "group_ride_club_only_check" CHECK ("group_ride"."visibility" <> 'club' OR "group_ride"."club_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "group_ride_member" (
	"ride_id" uuid NOT NULL,
	"rider_id" uuid NOT NULL,
	"role" text DEFAULT 'rider' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"seats_taken" smallint DEFAULT 1 NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_ride_member_ride_id_rider_id_pk" PRIMARY KEY("ride_id","rider_id"),
	CONSTRAINT "group_ride_member_role_check" CHECK ("group_ride_member"."role" IN ('host', 'cohost', 'rider')),
	CONSTRAINT "group_ride_member_status_check" CHECK ("group_ride_member"."status" IN ('pending', 'approved', 'waitlist', 'declined', 'left', 'removed')),
	CONSTRAINT "group_ride_member_seats_check" CHECK ("group_ride_member"."seats_taken" BETWEEN 1 AND 2)
);
--> statement-breakpoint
CREATE TABLE "rider" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_member" ADD CONSTRAINT "club_member_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_member" ADD CONSTRAINT "club_member_rider_id_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."rider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_ride" ADD CONSTRAINT "group_ride_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_ride" ADD CONSTRAINT "group_ride_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_ride_member" ADD CONSTRAINT "group_ride_member_ride_id_group_ride_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."group_ride"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_ride_member" ADD CONSTRAINT "group_ride_member_rider_id_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."rider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_home_point_gix" ON "club" USING gist ("home_point");--> statement-breakpoint
CREATE INDEX "club_member_rider_idx" ON "club_member" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "group_ride_starts_at_idx" ON "group_ride" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "group_ride_club_idx" ON "group_ride" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "group_ride_member_rider_idx" ON "group_ride_member" USING btree ("rider_id");
--> statement-breakpoint
ALTER TABLE "rider" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "club" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "club_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_ride" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_ride_member" ENABLE ROW LEVEL SECURITY;
