CREATE TABLE "rider_vehicle" (
	"rider_id" uuid NOT NULL,
	"vehicle" "vehicle" NOT NULL,
	"range_km" integer,
	"km_per_litre" real,
	"fuel_price" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rider_vehicle_rider_id_vehicle_pk" PRIMARY KEY("rider_id","vehicle")
);
--> statement-breakpoint
ALTER TABLE "trip" ADD COLUMN "range_km" integer;--> statement-breakpoint
ALTER TABLE "trip" ADD COLUMN "km_per_litre" real;--> statement-breakpoint
ALTER TABLE "trip" ADD COLUMN "fuel_price" real;--> statement-breakpoint
ALTER TABLE "rider_vehicle" ADD CONSTRAINT "rider_vehicle_rider_id_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."rider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Read and written only by our server (DATABASE_URL), never through Supabase's public API.
ALTER TABLE "rider_vehicle" ENABLE ROW LEVEL SECURITY;
