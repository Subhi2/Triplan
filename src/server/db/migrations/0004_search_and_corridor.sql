-- Hand-written: name search over alt names, and places_along_route for large imported datasets.

-- Type-ahead also matches alternative names ("Ooty" for Udhagamandalam). array_to_string is only
-- STABLE, so wrap it to index it.
CREATE OR REPLACE FUNCTION public.alt_names_text(names text[]) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT array_to_string(names, ' ')
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS place_alt_names_trgm ON public.place
  USING gin (public.alt_names_text(alt_names) extensions.gin_trgm_ops);
--> statement-breakpoint

-- places_along_route v2:
-- * km and detour are measured on the simplified line (~50 m tolerance, like the filter). With
--   thousands of imported places this keeps the query fast; detour is approximate anyway, and km
--   is the position along the line times the full route length.
-- * When the corridor holds more than 500 places, keep the most worthwhile ones (curated first,
--   then Wikidata-linked, by category weight, nearest the route) rather than the first 500 by km,
--   so long trips are not cut off before the destination. Results are still ordered by km.
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
  ), s AS (
    SELECT ST_Length(g::geography) AS len,
           ST_Transform(ST_Simplify(ST_Transform(g, 3857), 50), 4326) AS sg
    FROM r
  ), rl AS (
    SELECT len, sg, sg::geography AS simple FROM s
  ), hits AS (
    SELECT p.id, p.slug, p.name, c.slug AS category, p.location,
           ST_LineLocatePoint(rl.sg, p.location::geometry) * rl.len / 1000 AS km_from_start,
           ST_Distance(p.location, rl.simple) AS detour_m,
           p.rating_avg, p.rating_count, p.trending_score,
           c.weight
             + CASE WHEN p.source <> 'osm' THEN 1 ELSE 0 END
             + CASE WHEN p.wikidata_id IS NOT NULL THEN 0.5 ELSE 0 END AS priority
    FROM place p
    JOIN category c ON c.id = p.category_id
    CROSS JOIN rl
    WHERE p.status = 'verified'
      AND ST_DWithin(p.location, rl.simple, corridor_m)
      AND CASE WHEN categories IS NULL THEN c.slug <> 'town' ELSE c.slug = ANY (categories) END
  ), kept AS (
    SELECT * FROM hits ORDER BY priority DESC, detour_m LIMIT 500
  )
  SELECT k.id, k.slug, k.name, k.category,
         ST_X(k.location::geometry), ST_Y(k.location::geometry),
         k.km_from_start, k.detour_m, k.rating_avg, k.rating_count,
         coalesce(pg.best_months, '{}'),
         m.thumb_url,
         k.trending_score
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
