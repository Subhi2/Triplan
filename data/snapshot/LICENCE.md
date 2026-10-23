# Data licence

The files in this folder are a snapshot of Triplan's public data: places, guides, items to carry, photo credits, famous rides, service points (hospitals, police, ATMs, tyre and repair shops, stays) and open places (fuel, food and coffee from Overture). Load them with `pnpm db:setup`.

This database is made available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Any rights in individual contents of the database are licensed under the [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/).

It contains information from [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, made available under the ODbL. If you use this data, credit "© OpenStreetMap contributors" and share any database you derive from it under the same licence.

Photos are not in this folder: each `media` row links to a file on Wikimedia Commons (or an embed) with its own `source`, `license` and `author`. Show those with the photo.

Place descriptions imported from Wikipedia (CC BY-SA 4.0) or Wikidata (CC0) keep their own licence, given in the place row's `description_license`, with the article or item in `description_url`. Show that credit with the text.

## Open places from Overture

`open_place.ndjson.gz` holds fuel stations, restaurants, cafes and tea stalls from [Overture Places](https://docs.overturemaps.org/guides/places/) (Overture Maps Foundation, overturemaps.org), release named in each row. They are not from OpenStreetMap. Each row's `license` and `datasets` say where it comes from:

- Data from Meta, Microsoft and other Overture members: [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/); the text is in `LICENSE-CDLA-Permissive-2.0.txt`.
- Data from Foursquare: Copyright Foursquare Labs, Inc., [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0); the text is in `LICENSE-Apache-2.0.txt`, and `NOTICE-Foursquare.txt` must go with any copy, together with the changes we made.
- Data from AllThePlaces: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

These licences allow use in this ODbL database. Share those rows on under their own licence and keep the notices.

Not included: trips, reviews, accounts, usage counts, caches, and any Google content (Google place ids are left empty).

The code in this repository is MIT licensed (see `LICENSE` at the root); this licence covers only the data in this folder.
