# Data licence

The files in this folder are a snapshot of Triplan's public data: places, guides, items to carry, photo credits, famous rides and service points (hospitals, police, ATMs, tyre and repair shops, stays). Load them with `pnpm db:setup`.

This database is made available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Any rights in individual contents of the database are licensed under the [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/).

It contains information from [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, made available under the ODbL. If you use this data, credit "© OpenStreetMap contributors" and share any database you derive from it under the same licence.

Photos are not in this folder: each `media` row links to a file on Wikimedia Commons (or an embed) with its own `source`, `license` and `author`. Show those with the photo.

Place descriptions imported from Wikipedia (CC BY-SA 4.0) or Wikidata (CC0) keep their own licence, given in the place row's `description_license`, with the article or item in `description_url`. Show that credit with the text.

Not included: trips, reviews, accounts, usage counts, caches, and any Google content (Google place ids are left empty).

The code in this repository is MIT licensed (see `LICENSE` at the root); this licence covers only the data in this folder.
