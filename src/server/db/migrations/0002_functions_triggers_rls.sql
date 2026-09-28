-- Hand-written: triggers, places_along_route and RLS policies.
-- See docs/02-architecture.md ("Corridor search", "Auth and security") and docs/03-data-model.md.

-- updated_at -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER place_set_updated_at BEFORE UPDATE ON public.place
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trip_set_updated_at BEFORE UPDATE ON public.trip
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- place.rating_avg / rating_count from verified reviews ----------------------------

CREATE OR REPLACE FUNCTION public.recompute_place_rating(pid uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.place p
  SET rating_avg = s.avg, rating_count = s.cnt
  FROM (
    SELECT avg(rating)::real AS avg, count(*)::int AS cnt
    FROM public.review
    WHERE place_id = pid AND status = 'verified'
  ) s
  WHERE p.id = pid;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.recompute_place_rating(uuid) FROM public, anon, authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.review_refresh_rating() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recompute_place_rating(OLD.place_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recompute_place_rating(NEW.place_id);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER review_refresh_rating AFTER INSERT OR UPDATE OR DELETE ON public.review
  FOR EACH ROW EXECUTE FUNCTION public.review_refresh_rating();
--> statement-breakpoint

-- profile row for every new auth user ---------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profile (user_id, display_name)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint

-- Places along a route (corridor search) ----------------------------------------------
-- The simplified line (~50 m tolerance) is only used for the index-backed ST_DWithin filter;
-- km and detour use the full-resolution line. detour_m is straight-line, so approximate.
-- Towns exist for via labels and are excluded unless asked for by category.

CREATE OR REPLACE FUNCTION public.places_along_route(
  geojson text,
  corridor_m integer,
  categories text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  category text,
  lng double precision,
  lat double precision,
  km_from_start double precision,
  detour_m double precision,
  rating_avg real,
  rating_count integer,
  best_months smallint[],
  thumb_url text,
  trending_score real
)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH r AS (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326) AS g
  ), rl AS (
    SELECT g,
           ST_Length(g::geography) AS len,
           ST_Transform(ST_Simplify(ST_Transform(g, 3857), 50), 4326)::geography AS simple
    FROM r
  )
  SELECT p.id, p.slug, p.name, c.slug,
         ST_X(p.location::geometry), ST_Y(p.location::geometry),
         ST_LineLocatePoint(rl.g, p.location::geometry) * rl.len / 1000,
         ST_Distance(p.location, rl.g::geography),
         p.rating_avg, p.rating_count,
         coalesce(pg.best_months, '{}'),
         m.thumb_url,
         p.trending_score
  FROM place p
  JOIN category c ON c.id = p.category_id
  LEFT JOIN place_guide pg ON pg.place_id = p.id
  LEFT JOIN LATERAL (
    SELECT coalesce(md.thumb_url, md.url) AS thumb_url
    FROM media md
    WHERE md.place_id = p.id AND md.kind = 'image' AND md.status = 'verified'
    ORDER BY md.created_at
    LIMIT 1
  ) m ON true
  CROSS JOIN rl
  WHERE p.status = 'verified'
    AND ST_DWithin(p.location, rl.simple, corridor_m)
    AND CASE WHEN categories IS NULL THEN c.slug <> 'town' ELSE c.slug = ANY (categories) END
  ORDER BY 7
  LIMIT 500;
$$;
--> statement-breakpoint

-- Row Level Security ----------------------------------------------------------------------
-- The app server connects as the table owner (DATABASE_URL) and bypasses RLS. These policies
-- guard requests made with the Supabase publishable key (anon / authenticated roles).

CREATE OR REPLACE FUNCTION public.is_moderator() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile
    WHERE user_id = (SELECT auth.uid()) AND role IN ('moderator', 'admin')
  );
$$;
--> statement-breakpoint
ALTER TABLE public.category ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.place ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.place_guide ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.carry_item ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.place_carry ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.external_rating ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.discovery_region ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.social_post ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.trip ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.trip_stop ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.route_cache ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- route_cache and geocode_cache: no policies, server only.

-- Reference data: everyone reads, moderators write.
CREATE POLICY category_read ON public.category FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint
CREATE POLICY category_moderate ON public.category FOR ALL TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint
CREATE POLICY carry_item_read ON public.carry_item FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint
CREATE POLICY carry_item_moderate ON public.carry_item FOR ALL TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint

-- Places: verified ones are public; users see and submit their own; moderators do the rest.
CREATE POLICY place_read ON public.place FOR SELECT TO anon, authenticated
  USING (status = 'verified' OR created_by = (SELECT auth.uid()) OR (SELECT public.is_moderator()));--> statement-breakpoint
CREATE POLICY place_submit ON public.place FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND status IN ('draft', 'unverified'));--> statement-breakpoint
CREATE POLICY place_moderate_update ON public.place FOR UPDATE TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint
CREATE POLICY place_moderate_delete ON public.place FOR DELETE TO authenticated
  USING ((SELECT public.is_moderator()));--> statement-breakpoint

-- Per-place details follow the visibility of their place (place RLS applies inside EXISTS).
CREATE POLICY place_guide_read ON public.place_guide FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_id));--> statement-breakpoint
CREATE POLICY place_guide_moderate ON public.place_guide FOR ALL TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint
CREATE POLICY place_carry_read ON public.place_carry FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_id));--> statement-breakpoint
CREATE POLICY place_carry_moderate ON public.place_carry FOR ALL TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint
CREATE POLICY external_rating_read ON public.external_rating FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_id));--> statement-breakpoint
CREATE POLICY external_rating_moderate ON public.external_rating FOR ALL TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint

-- Media: verified public; users upload as unverified and can delete their own.
CREATE POLICY media_read ON public.media FOR SELECT TO anon, authenticated
  USING (status = 'verified' OR uploaded_by = (SELECT auth.uid()) OR (SELECT public.is_moderator()));--> statement-breakpoint
CREATE POLICY media_upload ON public.media FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = (SELECT auth.uid()) AND status = 'unverified');--> statement-breakpoint
CREATE POLICY media_delete_own ON public.media FOR DELETE TO authenticated
  USING (uploaded_by = (SELECT auth.uid()));--> statement-breakpoint
CREATE POLICY media_moderate ON public.media FOR ALL TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint

-- Reviews: published on write; owners edit only while verified, so a moderated review stays hidden.
CREATE POLICY review_read ON public.review FOR SELECT TO anon, authenticated
  USING (status = 'verified' OR user_id = (SELECT auth.uid()) OR (SELECT public.is_moderator()));--> statement-breakpoint
CREATE POLICY review_insert_own ON public.review FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'verified');--> statement-breakpoint
CREATE POLICY review_update_own ON public.review FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND status = 'verified')
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'verified');--> statement-breakpoint
CREATE POLICY review_delete_own ON public.review FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));--> statement-breakpoint
CREATE POLICY review_moderate ON public.review FOR ALL TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint

-- Discovery: moderators only; linked posts are public so place pages can list videos.
CREATE POLICY discovery_region_moderate ON public.discovery_region FOR ALL TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint
CREATE POLICY social_post_read ON public.social_post FOR SELECT TO anon, authenticated
  USING (status IN ('matched', 'verified') OR (SELECT public.is_moderator()));--> statement-breakpoint
CREATE POLICY social_post_moderate ON public.social_post FOR ALL TO authenticated
  USING ((SELECT public.is_moderator())) WITH CHECK ((SELECT public.is_moderator()));--> statement-breakpoint

-- Trips: owners have full access; public trips are readable by anyone with the link.
CREATE POLICY trip_read ON public.trip FOR SELECT TO anon, authenticated
  USING (is_public OR user_id = (SELECT auth.uid()));--> statement-breakpoint
CREATE POLICY trip_insert_own ON public.trip FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));--> statement-breakpoint
CREATE POLICY trip_update_own ON public.trip FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));--> statement-breakpoint
CREATE POLICY trip_delete_own ON public.trip FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));--> statement-breakpoint
CREATE POLICY trip_stop_read ON public.trip_stop FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.trip t WHERE t.id = trip_id));--> statement-breakpoint
CREATE POLICY trip_stop_write_own ON public.trip_stop FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trip t WHERE t.id = trip_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trip t WHERE t.id = trip_id AND t.user_id = (SELECT auth.uid())));--> statement-breakpoint

-- Profiles: display names are public; users may change only their own display_name.
CREATE POLICY profile_read ON public.profile FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint
CREATE POLICY profile_update_own ON public.profile FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));--> statement-breakpoint
REVOKE UPDATE ON public.profile FROM anon, authenticated;--> statement-breakpoint
GRANT UPDATE (display_name) ON public.profile TO authenticated;
