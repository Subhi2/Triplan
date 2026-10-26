-- Toll booths as service points (docs/02, "Breaks, sunset stop, tolls and helplines"). Widens the
-- kind check only: the old constraint is replaced by one that also allows 'toll'. No rows change.
ALTER TABLE "service_point" DROP CONSTRAINT "service_point_kind_check";--> statement-breakpoint
ALTER TABLE "service_point" ADD CONSTRAINT "service_point_kind_check" CHECK ("service_point"."kind" IN ('hospital', 'police', 'atm', 'tyre', 'repair', 'stay', 'toll'));
