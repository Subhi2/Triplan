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
5. **Saved trips** (no sign-in): save, rename, reopen, save changes or save as a new trip, and share the trip's link (`/trips/[id]`). Anyone with a trip's link can open it and save a copy; only the device that saved it can rename it or save changes. "Your trips" lists the trips saved or opened on this device. A reopened trip selects the route option it was saved with.

### Near me (G2, added 2026-09-30)

12. **Near me** (`/nearby`): well-known places the rider can reach from where they are, within 30 min, 1 h, 2 h or half a day **on the road** (not as the crow flies), by bike or car. The point is the rider's position (asked for only when they tap "Use my location"), a typed place, or a spot tapped on the map. The list shows the top 20 by how well-known they are, nearest first, led by the ride time; category chips show every place in a category. Each place opens its details, with **Ride there**, which opens the planner from here to that place.
13. **Use my location** in the planner's start field.
14. **In season** badge on places whose best months include this month.
15. **Ahead of you** (ride mode on `/nearby`): while riding, the well-known places coming up in the direction of travel, in large glanceable rows, with the screen kept on.

User stories:
- As a rider stopped for tea in Sakleshpur, I want to see what is worth seeing within an hour of here, so I can decide on a side trip without planning a route.
- As a rider on the road, I want to glance at what is coming up ahead, so I don't ride past a waterfall I would have stopped for.
- As a rider who finds a place nearby, I want to ride there in one tap, with the places along that road.

Privacy: the position is taken only on a tap, rounded to about 100 m before it leaves the phone, never stored or logged, and not written into a shared link except as that rounded point.

### Showcase (G3, added 2026-10-02)

16. **Hairpins and twistiness** on each route card ("24 hairpins · 55 km twisty"), worked out from the road's shape.
17. **Elevation profile** of the selected route: total climb and descent, the highest point, and each big climb ("climbs 853 m in 16 km to Valparai"). Scrubbing the chart moves a marker along the route on the map.
18. **3D ride preview**: the camera rides the route over 3D terrain, slower through ghats, with km, height and the places as it passes them. It can be saved as a video for Instagram or WhatsApp.
19. **Ride story**: a tall poster of the trip (route, km, time, climb, hairpins, top stops) shared from the phone's share sheet.
20. **Famous rides** (`/rides`): about 20 well-known Indian rides, each with its own page (route, profile, hairpins, places, best months), one tap to open in the planner or preview in 3D. The empty planner offers them as "Try a famous ride".
21. **Plan in plain words** (when the AI key is set): "2-day monsoon ride from Pune with waterfalls, under 250 km" fills the planner. Typed text is sent to the AI provider to read it, and is never stored.
22. **Safety stops** along the route: hospitals, police, ATMs, puncture and repair shops, with how many there are per 50 km and the longest stretch without a hospital.
23. **Multi-day split**: riding hours per day, an overnight town near each split with stays nearby, the place list in Day 1 / Day 2 sections, one GPX track per day.
24. **About** (`/about`): the story, how it works, every data source and its licence, and live numbers (rides planned, places, trips saved).

For developers: one command (`pnpm db:setup`) loads a fresh database with all our public data from the latest data snapshot.

User stories:
- As a rider choosing between two roads, I want to see which one has the ghat, how many hairpins and how much climbing, so I pick the ride I want.
- As a rider before a trip, I want to preview the ride, so I know what is coming and can show my group.
- As someone who has never used the app, I want to see a famous ride in one tap, so I understand what it does.
- As a family on a long drive, I want the trip split into days with a town to stay in, so we don't drive after dark.

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
- Native apps.

## Screens

1. **Home / Trip planner** (`/`): trip form on top (collapsible on mobile), map, route cards, place list. Mobile: map on top half, list in a draggable bottom sheet.
2. **Place detail** (`/place/[slug]`).
3. **Your trips** (`/trips`, the trips saved or opened on this device), **trip** (`/trips/[id]`: the planner opened with the trip; this is its share link).
4. **Add a place** (`/contribute`).
5. **Admin** (`/admin/*`): moderation queues, discovery queue.
6. **Sign in** (`/login`), only if accounts are added later.
7. **Near me** (`/nearby`): the chooser (Use my location / type a place / pick on the map), time and vehicle chips, the list and the map; on phones the list is in the bottom sheet. Ride mode ("Ahead of you") covers the screen.
8. **Famous rides** (`/rides`, `/rides/[slug]`).
9. **About** (`/about`).
10. **3D ride preview**: covers the screen over the planner or a ride page.

The prototype at https://claude.ai/artifact/7Sic9yRggEb2jTPXcWAimD shows the intended planner layout.

## Acceptance criteria for the MVP

- Searching Bengaluru → Kalasa returns at least 2 routes, one through Sakleshpur and one through Chikkamagaluru (force with via stops if the engine does not return both).
- Adding via stop "Sakleshpur" produces a route passing within 1 km of Sakleshpur town.
- With seed data loaded, the Sakleshpur route lists Manjarabad Fort and Ballalarayana Durga; the Chikkamagaluru route lists Belur. Mullayanagiri, Devaramane and Shravanabelagola are real detours: they appear only with a 10 km or wider corridor and are flagged as detours. Neither lists places only on the other route (with default 5 km corridor, detours flagged).
- Places are ordered by km from start and km values are within 5% of real road distance.
- Place detail shows all guide fields, with "Not known yet" for empty ones rather than hiding them.
- Works at 375 px width; Lighthouse PWA and accessibility scores ≥ 90.
- Route + places response under 2 s for a 350 km route with 5,000 places in the DB (routing cached).

## Acceptance criteria for Near me

- With the position at Sakleshpur, "Within 1 h by bike" lists Manjarabad Fort (about 5 km by road) and not Mullayanagiri; every place listed has a road time under the limit.
- The page never asks for the position on load; only a tap on "Use my location" (or the locate button in the planner) does. Denying it shows a message and the other ways to choose a point.
- The URL and every request carry the position to 3 decimals at most.
- If road times are unavailable, the list falls back to straight-line distances and says so.
- "Ride there" opens the planner with the start and that place, and routes.
- Ride mode shows places ahead (within about 35° of the heading) and not those behind, and stops watching the position when closed.
- Works at 375 px width with 44 px touch targets.

## Acceptance criteria for the showcase

- Bengaluru → Kalasa via Sakleshpur shows 15–30 hairpins, all in the hills past Sakleshpur and most between Kottigehara and Kalasa; the NH75 stretch to Hassan shows none.
- Its profile shows the descents into Kalasa; Pollachi → Valparai shows the climb above Aliyar (about 850 m at 5%) and its 40 hairpins.
- The 3D preview opens without asking for anything, flies the whole route, keeps the map and terrain credits on screen (and in the saved video), and does not move on its own under reduced motion.
- The story poster for a route opens as a 1080×1920 PNG and shares from a phone's share sheet.
- `/rides` lists every famous ride; each page shows its route and opens it in the planner with the same stops.
- Without `ANTHROPIC_API_KEY` there is no "plan in plain words" box and no AI call.
- On an empty database, `pnpm db:setup` loads the snapshot and the place count matches its manifest.
- Works at 375 px width with 44 px touch targets.
