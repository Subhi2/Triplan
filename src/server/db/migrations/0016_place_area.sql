-- Outlines for big places (national parks, sanctuaries): a new nullable column and index, and
-- places_along_route measuring to the outline when a place has one. Additive: the function keeps
-- its signature and columns.
ALTER TABLE "place" ADD COLUMN "area" geography(MultiPolygon, 4326);--> statement-breakpoint
CREATE INDEX "place_area_gix" ON "place" USING gist ("area") WHERE "place"."area" IS NOT NULL;--> statement-breakpoint
-- Hand-written: places_along_route (0006) with places that have an outline found by the outline.
-- A route through a park gets it at the km where the road first enters it, 0 m off the road, and
-- the pin on the road there; a route passing by gets the nearest point. Places without an outline
-- are found by their location, as before.
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
  ), area_hits AS MATERIALIZED (
    SELECT p.id, p.area, rl.sg, rl.len,
           ST_Distance(p.area, rl.simple) AS detour_m,
           CASE WHEN ST_Intersects(p.area::geometry, rl.sg) THEN (
             SELECT min(ST_LineLocatePoint(rl.sg, d.geom))
             FROM ST_DumpPoints(ST_Intersection(rl.sg, p.area::geometry)) d
           ) ELSE ST_LineLocatePoint(rl.sg, ST_ClosestPoint(rl.sg, p.area::geometry)) END AS frac
    FROM rl
    JOIN place p ON p.area IS NOT NULL AND ST_DWithin(p.area, rl.simple, corridor_m)
    WHERE p.status = 'verified'
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
    WHERE p.status = 'verified' AND p.area IS NULL
      AND CASE WHEN categories IS NULL THEN c.slug <> 'town' ELSE c.slug = ANY (categories) END
    UNION ALL
    SELECT p.id, p.slug, p.name, c.slug,
           CASE WHEN a.detour_m = 0 THEN ST_LineInterpolatePoint(a.sg, a.frac)::geography
                ELSE ST_ClosestPoint(p.area::geometry, a.sg)::geography END,
           a.frac * a.len / 1000,
           a.detour_m,
           p.rating_avg, p.rating_count, p.trending_score,
           (p.source <> 'osm' OR p.wikidata_id IS NOT NULL OR p.rating_count > 0),
           c.weight
             + CASE WHEN p.source <> 'osm' THEN 1 ELSE 0 END
             + CASE WHEN p.wikidata_id IS NOT NULL THEN 0.5 ELSE 0 END
    FROM area_hits a
    JOIN place p ON p.id = a.id
    JOIN category c ON c.id = p.category_id
    WHERE CASE WHEN categories IS NULL THEN c.slug <> 'town' ELSE c.slug = ANY (categories) END
  ), kept AS (
    -- Over 1000 places: keep the most worthwhile, so long trips are not cut off before the end.
    SELECT * FROM hits ORDER BY priority DESC, detour_m LIMIT 1000
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
