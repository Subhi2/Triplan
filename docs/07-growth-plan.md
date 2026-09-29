# 07 · Growth plan

Product view, written 2026-09-29 after the MVP went live (https://triplan-blue.vercel.app). What makes riders pick this app, come back and bring friends; which open-source tools and open data get us there; and what to build in which order. Build steps for each item are in `04-build-plan.md`.

## Positioning

**"Everything worth stopping for on your exact road, and what you need to ride it."**

| Alternative | What riders use it for | What it does not do (our gap to fill) |
|---|---|---|
| Google Maps | Navigation, searching a place | No list of what is along the road; no season, vehicle or packing advice; "search along route" only for fuel and food |
| Kurviger, Calimoto | Twisty motorcycle routes | Paid, Europe-first; thin place data for India |
| Wanderlog, TripIt | Itineraries for a destination | Nothing about the road between two towns |
| OsmAnd, Organic Maps | Offline navigation | No curation, no "is it worth it" |
| Instagram, YouTube | Finding hidden places | Scattered, no map, no route |

Our edge: the corridor search (places on *this* road, in km order), India-wide open data (38,000+ places from OpenStreetMap), and rider guidance (best vehicle, months, what to carry). The growth plan widens that edge with ride-safety utilities and turns every planned trip into something shared.

## Growth loops

1. **Search → place page → planner.** 20,000+ place pages that search engines can index ("Manjarabad Fort best time to visit", "places between Bengaluru and Kalasa"). Needs a sitemap, structured data, real photos and a clear "Plan a ride here".
2. **Plan → share → new rider.** Rides are group plans; in India the plan goes to a WhatsApp group. Every shared link must unfurl into a card showing the route, distance and stops, and open straight into the planner.
3. **Utility → return visit.** Riders come back before each ride if the app answers "Will I run out of fuel? Will I reach before dark? Will it rain on the ghat?". Installing to the home screen (already a PWA) and GPX export put it into their ride routine.
4. **Contribute → better data → more search traffic** (Phase 5): reviews and photos from riders who used the app.

## Feature list, by priority

**G1 · Now: no API keys, no cost, no product decision needed.** Built in the Growth phase of `04`.

| # | Feature | Why it sells | Tools and data (licence) |
|---|---|---|---|
| G1.1 | **Share cards and SEO**: link previews for trips and places, sitemap, robots, schema.org data, native Share / WhatsApp button | Every shared trip advertises the app; place pages rank | `next/og` (built into Next.js), Next metadata routes, schema.org `TouristAttraction` |
| G1.2 | **Photos from Wikimedia Commons** for places with a Wikidata id | Pages with photos get clicked and shared; most places have none today | Wikidata `P18` + Commons `imageinfo`/`extmetadata` APIs (CC BY / CC BY-SA / PD, author and licence stored per image) |
| G1.3 | **Ride check**: longest stretch without fuel against the vehicle's range; start time → arrival → sunset warning | Safety is the top worry on ghat rides; no map app answers it | 18,000 fuel stations already imported from OSM; `suncalc` (BSD-2) |
| G1.4 | **GPX export** of the route, stops and ticked places | Riders navigate with OsmAnd, Organic Maps, Garmin, and offline apps; "works with my device" | GPX 1.1 (open format), no dependency |
| G1.5 | **Weather on the ride**: rain, temperature and wind at each part of the route at the time the rider gets there | "Will it rain on Charmadi at 4 pm?" is asked before every monsoon ride | MET Norway Locationforecast (free, commercial use allowed, CC BY 4.0, identify with User-Agent). Open-Meteo's free API is for non-commercial use only, so it is not used |

**G2 · Next: free, more work.**

| # | Feature | Tools and data (licence) |
|---|---|---|
| G2.1 | Safety stops along the route: hospitals, police, puncture and bike repair shops, ATMs, toilets (filter chips; count per 50 km) | OSM tags `amenity=hospital|police|atm|toilets`, `shop=motorcycle_repair|tyres|car_repair` through the existing Overpass import |
| G2.2 | Elevation profile and ghat climbs on each route card ("climbs 900 m in 18 km at Charmadi") | Mapterhorn terrain tiles (Copernicus DEM, code BSD-3) or AWS Terrain Tiles (open data), read server-side; `maplibre-contour` (BSD-3) and MapLibre hillshade for the map |
| G2.3 | "Scenic / back roads" route option (avoids highways) | Valhalla (MIT) `motorcycle` costing with `use_highways` near 0 and `use_trails`. Public FOSSGIS server: 1 request per second per user, send `X-Client-Id`, announce the app in Valhalla's GitHub Discussions; self-host before launch. GraphHopper (Apache-2.0) with a curvature custom model is the self-hosted alternative for "twisty roads" |
| G2.4 | Popular route pages (`/routes/bengaluru-to-kalasa`): top places, route options, best months; generated from saved trips | Existing corridor search, ISR |
| G2.5 | Multi-day planner: split by riding hours per day, suggest overnight towns and stays near the split | Stay places from OSM (1,100+ imported) |
| G2.6 | Offline trip pack: route, places and map tiles for the corridor saved on the phone | Serwist (already used, MIT), PMTiles (BSD-3), `maplibre-offline-pmtiles`. Uses the MapLibre view: Google's map tiles cannot be saved offline |
| G2.7 | Languages: Kannada, Hindi, Tamil, Malayalam, Marathi | `next-intl` (MIT) |
| G2.8 | Measure it: which features get used, where visitors come from | Umami (MIT, self-host or free cloud tier) or Vercel Web Analytics (free tier); GlitchTip (open source) or Sentry free plan for errors |

**G3 · Later: needs decisions, accounts or money.**

- Reviews, rider photos, "Add a place" (Phase 5). Decide how to stop spam without sign-in.
- Group ride: a live link where the group sees each other's position (Supabase Realtime).
- Hidden places from YouTube (Phase 6).
- Google fills the gaps (decided 2026-09-29, step list in `04` "Growth G1-Google"): Google map, exact Google Maps links, and Google photos and reviews for places with none of our own, within Google's free monthly usage.

## Making money

Commercial use needs **Vercel Pro (US$20/month)** first: the Hobby plan is for non-commercial use only. Open data licences above allow commercial use with attribution, except Open-Meteo's free API (not used).

In order of fit with the product:

1. **Stays along the route**: affiliate links from the "stay" places and multi-day split (Booking.com and Agoda have affiliate programmes; homestays directly).
2. **Bike rentals** at the start city (direct partnerships, e.g. Royal Brothers lists partner enquiries; no public affiliate programme found).
3. **Riding gear** linked from "What to carry" (Amazon Associates India: about 5–7% for sports, apparel and luggage).
4. **Featured listings** for cafes, homestays and garages on the route, always labelled "Sponsored" and never changing the km order.
5. **Rider Pro** (later): offline packs, multi-day planner, unlimited GPX. Only once the free app has regular users.
6. **Clubs and tour operators**: branded group-ride pages.

## What to measure

Trips planned per week, share links opened, trips saved, home-screen installs, visitors who return within 30 days, search impressions and clicks (Google Search Console, free). Set these up with G2.8 before spending on anything else.
