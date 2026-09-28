CREATE TYPE "public"."place_status" AS ENUM('draft', 'unverified', 'verified', 'rejected', 'closed');--> statement-breakpoint
CREATE TYPE "public"."social_status" AS ENUM('new', 'extracted', 'matched', 'candidate', 'verified', 'rejected', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."vehicle" AS ENUM('bike', 'car', 'suv_4x4', 'on_foot', 'bus');--> statement-breakpoint
CREATE TABLE "carry_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	CONSTRAINT "carry_item_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"parent_id" integer,
	"weight" real DEFAULT 1 NOT NULL,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "discovery_region" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"center" geography(Point, 4326) NOT NULL,
	"radius_km" integer DEFAULT 30 NOT NULL,
	"keywords" text[] NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "external_rating" (
	"place_id" uuid,
	"source" text NOT NULL,
	"rating" real,
	"count" integer,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "external_rating_place_id_source_pk" PRIMARY KEY("place_id","source")
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"query" text PRIMARY KEY NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"thumb_url" text,
	"source" text NOT NULL,
	"license" text NOT NULL,
	"author" text,
	"author_url" text,
	"width" integer,
	"height" integer,
	"status" "place_status" DEFAULT 'unverified' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"alt_names" text[] DEFAULT '{}' NOT NULL,
	"category_id" integer NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"address" text,
	"district" text,
	"state" text,
	"description" text,
	"status" "place_status" DEFAULT 'unverified' NOT NULL,
	"source" text NOT NULL,
	"osm_id" text,
	"google_place_id" text,
	"wikidata_id" text,
	"rating_avg" real,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"trending_score" real DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "place_carry" (
	"place_id" uuid,
	"item_id" integer,
	"months" smallint[] DEFAULT '{}' NOT NULL,
	"reason" text,
	CONSTRAINT "place_carry_place_id_item_id_pk" PRIMARY KEY("place_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "place_guide" (
	"place_id" uuid PRIMARY KEY NOT NULL,
	"best_vehicles" "vehicle"[] DEFAULT '{}' NOT NULL,
	"last_mile_note" text,
	"road_condition" text,
	"best_months" smallint[] DEFAULT '{}' NOT NULL,
	"ok_months" smallint[] DEFAULT '{}' NOT NULL,
	"avoid_months" smallint[] DEFAULT '{}' NOT NULL,
	"best_time_of_day" text,
	"visit_duration_min" integer,
	"timings" text,
	"entry_fee" text,
	"dress_code" text,
	"permit_needed" text,
	"notes" text,
	"verified_at" timestamp with time zone,
	"verified_by" uuid
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'user' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"body" text,
	"visited_month" smallint,
	"visited_year" smallint,
	"vehicle_used" "vehicle",
	"status" "place_status" DEFAULT 'verified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_place_id_user_id_unique" UNIQUE("place_id","user_id"),
	CONSTRAINT "review_rating_check" CHECK ("review"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "review_visited_month_check" CHECK ("review"."visited_month" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "route_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"creator_name" text,
	"creator_url" text,
	"title" text,
	"caption" text,
	"posted_at" timestamp with time zone,
	"view_count" bigint,
	"like_count" bigint,
	"geo" geography(Point, 4326),
	"search_query" text,
	"region_id" integer,
	"extracted" jsonb,
	"place_id" uuid,
	"status" "social_status" DEFAULT 'new' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_post_source_external_id_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "trip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"title" text NOT NULL,
	"vehicle" "vehicle" DEFAULT 'bike' NOT NULL,
	"corridor_m" integer DEFAULT 5000 NOT NULL,
	"route_geom" geography(LineString, 4326),
	"distance_m" integer,
	"duration_s" integer,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_stop" (
	"trip_id" uuid,
	"position" smallint NOT NULL,
	"label" text NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"place_id" uuid,
	CONSTRAINT "trip_stop_trip_id_position_pk" PRIMARY KEY("trip_id","position")
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_rating" ADD CONSTRAINT "external_rating_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place" ADD CONSTRAINT "place_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place" ADD CONSTRAINT "place_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_carry" ADD CONSTRAINT "place_carry_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_carry" ADD CONSTRAINT "place_carry_item_id_carry_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."carry_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_guide" ADD CONSTRAINT "place_guide_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_guide" ADD CONSTRAINT "place_guide_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_region_id_discovery_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."discovery_region"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stop" ADD CONSTRAINT "trip_stop_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stop" ADD CONSTRAINT "trip_stop_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_location_gix" ON "place" USING gist ("location");--> statement-breakpoint
CREATE INDEX "place_name_trgm" ON "place" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "place_status_idx" ON "place" USING btree ("status");