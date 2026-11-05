-- Riders get anonymous Supabase accounts for clubs and group rides (G6), so any visitor can now hold
-- the `authenticated` role. The self-service write policies from 0002 were never used (every write
-- goes through the server's own connection, with its proof of work, limits and admin queue), but
-- they would let a signed-in visitor write through Supabase's REST API directly: a review already
-- marked verified, places, media rows, trips, their own profile's name. Drop them. Reads and the
-- moderator policies (profile.role, which no user can change) stay.
DROP POLICY IF EXISTS place_submit ON public.place;--> statement-breakpoint
DROP POLICY IF EXISTS media_upload ON public.media;--> statement-breakpoint
DROP POLICY IF EXISTS media_delete_own ON public.media;--> statement-breakpoint
DROP POLICY IF EXISTS review_insert_own ON public.review;--> statement-breakpoint
DROP POLICY IF EXISTS review_update_own ON public.review;--> statement-breakpoint
DROP POLICY IF EXISTS review_delete_own ON public.review;--> statement-breakpoint
DROP POLICY IF EXISTS trip_insert_own ON public.trip;--> statement-breakpoint
DROP POLICY IF EXISTS trip_update_own ON public.trip;--> statement-breakpoint
DROP POLICY IF EXISTS trip_delete_own ON public.trip;--> statement-breakpoint
DROP POLICY IF EXISTS trip_stop_write_own ON public.trip_stop;--> statement-breakpoint
DROP POLICY IF EXISTS profile_update_own ON public.profile;--> statement-breakpoint
REVOKE UPDATE ON public.profile FROM authenticated;
