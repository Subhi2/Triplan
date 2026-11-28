CREATE TABLE "place_film" (
	"place_id" uuid NOT NULL,
	"film_qid" text NOT NULL,
	"title" text NOT NULL,
	"year" smallint,
	CONSTRAINT "place_film_place_id_film_qid_pk" PRIMARY KEY("place_id","film_qid")
);
--> statement-breakpoint
ALTER TABLE "place_film" ADD CONSTRAINT "place_film_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Public facts (CC0); read by our server, never through Supabase's public API.
ALTER TABLE "place_film" ENABLE ROW LEVEL SECURITY;
