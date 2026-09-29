-- Hand-written: places_along_route v3.
-- * MATERIALIZED CTEs: inside a SQL function the route is a parameter, so without them Postgres
--   inlines "parse the GeoJSON and simplify it" into the main query and repeats it for every place
--   (27 s for ~4,000 places instead of ~40 ms).
-- * Returns `notable` (curated, reviewed or Wikidata-linked) so the app can rank places.
-- The return type changes, so the function is dropped and recreated.
DROP FUNCTION IF EXISTS public.places_along_route(text, integer, text[]);
--> statement-breakpoint
CREATE FUNCTION public.places_along_route(
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
  trending_score real,
  notable boolean
)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH r AS MATERIALIZED (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326) AS g
  ), rl AS MATERIALIZED (
    SELECT len, sg, sg::geography AS simple
    FROM (
      SELECT ST_Length(g::geography) AS len,
             ST_Transform(ST_Simplify(ST_Transform(g, 3857), 50), 4326) AS sg
      FROM r
    ) s
  ), hits AS MATERIALIZED (
    SELECT p.id, p.slug, p.name, c.slug AS category, p.location,
           ST_LineLocatePoint(rl.sg, p.location::geometry) * rl.len / 1000 AS km_from_start,
           ST_Distance(p.location, rl.simple) AS detour_m,
           p.rating_avg, p.rating_count, p.trending_score,
           (p.source <> 'osm' OR p.wikidata_id IS NOT NULL OR p.rating_count > 0) AS notable,
           c.weight
             + CASE WHEN p.source <> 'osm' THEN 1 ELSE 0 END
             + CASE WHEN p.wikidata_id IS NOT NULL THEN 0.5 ELSE 0 END AS priority
    FROM rl
    JOIN place p ON ST_DWithin(p.location, rl.simple, corridor_m)
    JOIN category c ON c.id = p.category_id
    WHERE p.status = 'verified'
      AND CASE WHEN categories IS NULL THEN c.slug <> 'town' ELSE c.slug = ANY (categories) END
  ), kept AS (
    -- Over 500 places: keep the most worthwhile, so long trips are not cut off before the end.
    SELECT * FROM hits ORDER BY priority DESC, detour_m LIMIT 500
  )
  SELECT k.id, k.slug, k.name, k.category,
         ST_X(k.location::geometry), ST_Y(k.location::geometry),
         k.km_from_start, k.detour_m, k.rating_avg, k.rating_count,
         coalesce(pg.best_months, '{}'),
         m.thumb_url,
         k.trending_score,
         k.notable
  FROM kept k
  LEFT JOIN place_guide pg ON pg.place_id = k.id
  LEFT JOIN LATERAL (
    SELECT coalesce(md.thumb_url, md.url) AS thumb_url
    FROM media md
    WHERE md.place_id = k.id AND md.kind = 'image' AND md.status = 'verified'
    ORDER BY md.created_at
    LIMIT 1
  ) m ON true
  ORDER BY k.km_from_start;
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.places_along_route(text, integer, text[]) TO anon, authenticated;
