# 01 · Product spec

## Goal

Help riders plan a trip by showing everything worth stopping for along the exact road they will take, with practical guidance (vehicle, season, what to pack) that map apps do not give.

## Users

- **Weekend bike rider** from a city, planning a 1–3 day ghat or coastal ride.
- **Car traveller / family** who wants temples, viewpoints and food stops on the way.
- **Contributor** who knows a region and adds places, photos and reviews.
- **Admin** who reviews submitted and discovered places.

## Core concepts

- **Trip**: start, destination, ordered via stops (0–5), vehicle type, corridor width.
- **Route**: the road geometry for a trip, plus distance, duration, and alternatives.
- **Corridor**: a buffer around the route line (default 5 km, user can choose 2 / 5 / 10 / 25 km).
- **Place**: a point of interest with a category and curated guide fields.
- **Detour**: extra distance to reach a place from the nearest point on the route (one way).
- **Hidden place**: a place discovered from social posts or user submissions, marked unverified until an admin approves it.

## Features by release

### MVP (phases 1–4)

1. **Trip search**
   - Start and destination inputs with place autocomplete (geocoding).
   - "Add stop" to insert via stops; drag to reorder; remove.
   - Vehicle selector: bike, car. (Affects "best vehicle" warnings only.)
   - Corridor width selector.
2. **Route options**
   - Show 2–3 routes where they exist: the one through the user's via stops, or without via stops the routing engine's alternatives, topped up to 3 with routes through towns on the way (e.g. Bengaluru → Samse via Chikkamagaluru, via Hassan–Sakleshpur and via Arasikere–Belur).
   - Each route card shows distance (km), ride time, main towns passed through, and how the distance splits by road: national highway, state highway, ghat roads and other roads, in % and km.
   - Selecting a route card highlights it on the map.
   - One tap turns a town on an alternative route into a via stop (e.g. "via Sakleshpur").
3. **Places along the route**
   - List sorted by km from start. Each row: km marker, name, category chip, rating, best-time summary, "On route" or "+N km detour".
   - Filter chips by category. Toggle "hide detours over N km".
   - Map markers coloured by category; clicking a marker scrolls the list and vice versa.
   - Tick places in the list (or on a place's details) and "Open in Google Maps" opens the trip in Google Maps ready to navigate: start, destination, and the via stops and ticked places as stops in the order they come along the route. Google Maps takes up to 9 stops (3 in mobile browsers; the app takes 9).
4. **Place detail** (sheet on mobile, side panel on desktop, own URL `/place/[slug]`)
   - Photo gallery with attribution.
   - "Open in Google Maps" (also on each row of the list): the place's Google Maps page, for its photos, reviews and directions; the exact place once its Google place id is known.
   - Rating (our reviews).
   - "From Google" (when the Google map is on): photos, Google rating and reviews, only for places with no photos or fewer than 3 reviews of our own, loaded after the details show, each photo and review credited to its author. Our own photos and reviews come first. Not shown when the day's Google budget is used up.
   - Best vehicle, last-mile note (e.g. "narrow road, bike only for last 3 km").
   - Best months (12-month strip, good / ok / avoid), best time of day.
   - Items to carry (can vary by season; show current-season items first).
   - Timings, entry fee, dress code, where known.
   - Reviews list.
   - "Add to trip" button: inserts the place as a via stop at its place along the route (before the first via stop further along) and recomputes the route. Once added, it shows "In your trip (stop N)" and "Remove from trip".
   - Links to related videos / reels (from the hidden-places pipeline).
5. **Saved trips** (open, no sign-in): save, rename, reopen, save changes or save as a new trip, and share the trip's link (`/trips/[id]`). There are no owners: every saved trip is in one list that everyone sees, and anyone with a trip's link can open and update it. A reopened trip selects the route option it was saved with.

### v1 (phases 5–7)

6. Accounts via Supabase Auth (email magic link, Google). Not needed for the MVP, which is open without sign-in; decide with reviews and contributions (phase 5) whether they need accounts.
7. User reviews with rating, month visited, vehicle used, text, up to 5 photos.
8. "Add a place" form: drop a pin, name, category, photos, optional YouTube/Instagram link. Goes to moderation.
9. Admin moderation queue for places, reviews, photos, and discovered social posts.
10. Hidden places discovery from YouTube (and Instagram after Meta approval). See `05-hidden-places.md`.
11. "Trending" badge on places with many recent posts.

### Later

- Monsoon / ghat closure alerts, weather on the trip date.
- Offline trip pack (PWA cache of route, places and photos).
- Fuel range planner (tank size, mileage, fuel stations on route).
- Multi-day trips with overnight stays.
- Native apps.

## Screens

1. **Home / Trip planner** (`/`): trip form on top (collapsible on mobile), map, route cards, place list. Mobile: map on top half, list in a draggable bottom sheet.
2. **Place detail** (`/place/[slug]`).
3. **Saved trips** (`/trips`, everyone's trips), **trip** (`/trips/[id]`: the planner opened with the trip; this is its share link).
4. **Add a place** (`/contribute`).
5. **Admin** (`/admin/*`): moderation queues, discovery queue.
6. **Sign in** (`/login`), only if accounts are added later.

The prototype at https://claude.ai/artifact/7Sic9yRggEb2jTPXcWAimD shows the intended planner layout.

## Acceptance criteria for the MVP

- Searching Bengaluru → Kalasa returns at least 2 routes, one through Sakleshpur and one through Chikkamagaluru (force with via stops if the engine does not return both).
- Adding via stop "Sakleshpur" produces a route passing within 1 km of Sakleshpur town.
- With seed data loaded, the Sakleshpur route lists Manjarabad Fort and Ballalarayana Durga; the Chikkamagaluru route lists Belur. Mullayanagiri, Devaramane and Shravanabelagola are real detours: they appear only with a 10 km or wider corridor and are flagged as detours. Neither lists places only on the other route (with default 5 km corridor, detours flagged).
- Places are ordered by km from start and km values are within 5% of real road distance.
- Place detail shows all guide fields, with "Not known yet" for empty ones rather than hiding them.
- Works at 375 px width; Lighthouse PWA and accessibility scores ≥ 90.
- Route + places response under 2 s for a 350 km route with 5,000 places in the DB (routing cached).
