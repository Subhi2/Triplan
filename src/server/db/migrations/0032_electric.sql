ALTER TABLE "service_point" DROP CONSTRAINT "service_point_kind_check";--> statement-breakpoint
ALTER TABLE "rider_vehicle" ADD COLUMN "electric" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "service_point" ADD CONSTRAINT "service_point_kind_check" CHECK ("service_point"."kind" IN ('hospital', 'police', 'atm', 'tyre', 'repair', 'stay', 'toll', 'charging'));