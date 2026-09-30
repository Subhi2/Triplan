-- Hand-written: places_near_point, the places around one point for the Near me screen. The same
-- columns and "worth a stop" priority as places_along_route (0006), with the straight-line
-- distance from the point in place of the km along a route. New function only.
-- Inputs are origin_lng/origin_lat: the returned lng/lat columns are OUT parameters.
CREATE OR REPLACE FUNCTION public.places_near_point(
  origin_lng double precision,
  origin_lat double precision,
  radius_m integer,
  categories text[] DEFAULT NULL,
  lim integer DEFAULT 400
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  category text,
  lng double precision,
  lat double precision,
  distance_m double precision,
  rating_avg real,
  rating_count integer,
  best_months smallint[],
  thumb_url text,
  trending_score real,
  notable boolean,
  priority double precision
)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH o AS MATERIALIZED (
    SELECT ST_SetSRID(ST_MakePoint(origin_lng, origin_lat), 4326)::geography AS g
  ), hits AS MATERIALIZED (
    SELECT p.id, p.slug, p.name, c.slug AS category, p.location,
           ST_Distance(p.location, o.g) AS distance_m,
           p.rating_avg, p.rating_count, p.trending_score,
           (p.source <> 'osm' OR p.wikidata_id IS NOT NULL OR p.rating_count > 0) AS notable,
           (c.weight
             + CASE WHEN p.source <> 'osm' THEN 1 ELSE 0 END
             + CASE WHEN p.wikidata_id IS NOT NULL THEN 0.5 ELSE 0 END)::double precision AS priority
    FROM o
    JOIN place p ON ST_DWithin(p.location, o.g, radius_m)
    JOIN category c ON c.id = p.category_id
    WHERE p.status = 'verified'
      AND CASE WHEN categories IS NULL THEN c.slug <> 'town' ELSE c.slug = ANY (categories) END
  ), kept AS (
    -- The most worthwhile first, so a wide radius around a city is not all fuel and food.
    SELECT * FROM hits
    ORDER BY priority DESC, coalesce(rating_avg, 0) DESC, distance_m
    LIMIT least(greatest(lim, 1), 1000)
  )
  SELECT k.id, k.slug, k.name, k.category,
         ST_X(k.location::geometry), ST_Y(k.location::geometry),
         k.distance_m, k.rating_avg, k.rating_count,
         coalesce(pg.best_months, '{}'),
         m.thumb_url,
         k.trending_score,
         k.notable,
         k.priority
  FROM kept k
  LEFT JOIN place_guide pg ON pg.place_id = k.id
  LEFT JOIN LATERAL (
    SELECT coalesce(md.thumb_url, md.url) AS thumb_url
    FROM media md
    WHERE md.place_id = k.id AND md.kind = 'image' AND md.status = 'verified'
    ORDER BY md.created_at
    LIMIT 1
  ) m ON true
  ORDER BY k.priority DESC, coalesce(k.rating_avg, 0) DESC, k.distance_m;
$$;
